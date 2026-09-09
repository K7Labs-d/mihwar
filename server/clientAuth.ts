import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt, createHash, timingSafeEqual } from 'node:crypto';
import { createBrokerRequests } from './brokerRequests.ts';
import { ensureBrokerReviewPermission } from './accountPermissions.ts';
import { createBrokerReview } from './brokerReview.ts';
import { createClientRequests } from './clientRequests.ts';

type User = { id: string; name: string; email: string; created_at: string; can_review_brokers: number };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const SESSION_MS = 7 * 86400000;
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, PASSWORD_OPTIONS, (error, key) => error ? reject(error) : resolve(key));
});

export function createClientAuth({ databasePath, origin, now = Date.now }: { databasePath: string; origin: string; now?: () => number }) {
  const site = new URL(origin);
  if (site.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)) {
    throw new Error('AUTH_ORIGIN must use HTTPS outside localhost.');
  }
  if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS client_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS client_session_user ON client_sessions(user_id);
    CREATE TABLE IF NOT EXISTS client_auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `);
  ensureBrokerReviewPermission(db);
  let activeHashes = 0;
  const router = express.Router();
  const cookieName = 'mahwar_client_session';
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: site.protocol === 'https:', path: '/' };
  const tokenFrom = (req: express.Request) => {
    const raw = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
  };
  const publicUser = (user: User) => ({ id: user.id, name: user.name, email: user.email, createdAt: user.created_at, permissions: { reviewBrokers: user.can_review_brokers === 1 } });
  const cleanup = () => {
    db.prepare('DELETE FROM client_sessions WHERE expires_at <= ?').run(now());
    db.prepare('DELETE FROM client_auth_limits WHERE expires_at <= ?').run(now());
  };
  const limited = (key: string, max: number, duration: number) => {
    const hashed = digest(key);
    const existing = db.prepare('SELECT key FROM client_auth_limits WHERE key=?').get(hashed);
    if (!existing && Number((db.prepare('SELECT COUNT(*) AS n FROM client_auth_limits').get() as any).n) >= 10000) return true;
    const row = db.prepare(`INSERT INTO client_auth_limits (key,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).get(hashed, now() + duration) as { count: number };
    return row.count > max;
  };
  const issueSession = (req: express.Request, res: express.Response, userId: string) => {
    const previous = tokenFrom(req);
    if (previous) db.prepare('DELETE FROM client_sessions WHERE token_hash=?').run(digest(previous));
    // Bound parallel sessions per account while retaining the most recent ones.
    db.prepare(`DELETE FROM client_sessions WHERE user_id=? AND token_hash NOT IN
      (SELECT token_hash FROM client_sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 4)`).run(userId, userId);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO client_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(digest(token), userId, now() + SESSION_MS);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_MS });
  };
  const wrap = (handler: (req: express.Request, res: express.Response) => Promise<unknown>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => { handler(req, res).catch(next); };

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    if ((req.headers.origin && req.headers.origin !== site.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ error: 'الطلب غير مسموح من هذا الموقع.' });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'صيغة الطلب غير مدعومة.' });
    next();
  });
  router.use(express.json({ limit: '16kb' }));
  router.use(['/login', '/register'], (req, res, next) => {
    if (req.method !== 'POST') return next();
    cleanup();
    const registration = req.originalUrl.split('?')[0].endsWith('/register');
    const duration = registration ? 3600000 : 900000;
    if (limited((registration ? 'register:' : 'login:') + (req.ip || 'unknown'), registration ? 5 : 20, duration)) {
      res.setHeader('Retry-After', String(duration / 1000));
      return res.status(429).json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقًا.' });
    }
    if (activeHashes >= 4) return res.status(503).json({ error: 'الخدمة مشغولة الآن، حاول بعد قليل.' });
    next();
  });
  const credentials = (body: any) => {
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') return null;
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.password.length < 12 || body.password.length > 128) return null;
    return { email, password: body.password as string };
  };

  router.post('/register', wrap(async (req, res) => {
    if (req.body && Object.keys(req.body).some(key => !['name', 'email', 'password'].includes(key))) return res.status(400).json({ error: 'أرسل بيانات التسجيل فقط؛ لا يمكن تحديد صلاحيات الحساب.' });
    const input = credentials(req.body);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().normalize('NFC') : '';
    if (!input || name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) return res.status(400).json({ error: 'أدخل اسمًا صحيحًا وبريدًا صالحًا وكلمة مرور من 12 إلى 128 حرفًا.' });
    activeHashes++;
    let passwordHash: string;
    try {
      const salt = randomBytes(16);
      passwordHash = 'scrypt$' + salt.toString('hex') + '$' + (await derive(input.password, salt)).toString('hex');
    } finally { activeHashes--; }
    const user: User = { id: randomUUID(), name, email: input.email, created_at: new Date(now()).toISOString(), can_review_brokers: 0 };
    if (db.prepare('SELECT id FROM client_users WHERE email=?').get(input.email)) return res.status(409).json({ error: 'تعذر إنشاء الحساب بهذا البريد. جرّب تسجيل الدخول.' });
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO client_users(id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)').run(user.id, name, input.email, passwordHash, user.created_at);
      issueSession(req, res, user.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return res.status(201).json({ user: publicUser(user) });
  }));

  router.post('/login', wrap(async (req, res) => {
    const input = credentials(req.body);
    if (!input) return res.status(400).json({ error: 'أدخل بريدًا صالحًا وكلمة مرور من 12 إلى 128 حرفًا.' });
    if (limited('email:' + input.email, 10, 900000)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقًا.' });
    }
    const user = db.prepare('SELECT * FROM client_users WHERE email=?').get(input.email) as (User & { password_hash: string }) | undefined;
    const [, salt, expected] = user?.password_hash.split('$') || ['scrypt', '0'.repeat(32), '0'.repeat(128)];
    activeHashes++;
    let valid = false;
    try {
      const actual = await derive(input.password, Buffer.from(salt, 'hex'));
      valid = timingSafeEqual(actual, Buffer.from(expected, 'hex')) && !!user;
    } finally { activeHashes--; }
    if (!valid || !user) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    issueSession(req, res, user.id);
    return res.json({ user: publicUser(user) });
  }));

  const sessionUser = (req: express.Request) => {
    const token = tokenFrom(req);
    return token ? db.prepare(`SELECT u.id,u.name,u.email,u.created_at,u.can_review_brokers FROM client_users u
      JOIN client_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token), now()) as User | undefined : undefined;
  };
  router.get('/me', (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'يرجى تسجيل الدخول.' });
    return res.json({ user: publicUser(user) });
  });
  router.post('/logout', (req, res) => {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM client_sessions WHERE token_hash=?').run(digest(token));
    res.clearCookie(cookieName, cookieOptions);
    return res.json({ success: true });
  });
  router.use('/broker-requests', createBrokerRequests({ db, userIdFrom: req => sessionUser(req)?.id, now }));
  router.use('/requests', createClientRequests({ db, userIdFrom: req => sessionUser(req)?.id, now }));
  router.use('/broker-review', createBrokerReview({ db, userFrom: req => sessionUser(req), now }));
  router.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'حجم الطلب أكبر من المسموح.' : status === 400 ? 'صيغة الطلب غير صحيحة.' : 'تعذر إكمال الطلب. حاول مرة أخرى.' });
  });
  return { router, close: () => db.close() };
}
