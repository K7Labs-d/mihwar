// Server operator only. Never invoked by the web application.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({
  path: [path.join(root, '.env.local'), path.join(root, '.env')],
  quiet: true,
});
const [action, emailInput, ...extra] = process.argv.slice(2),
  email = emailInput?.trim().toLowerCase();
if (
  !['grant', 'revoke'].includes(action) ||
  !email ||
  extra.length ||
  email.length > 254 ||
  !/^\S+@\S+\.\S+$/.test(email)
) {
  console.error(
    'Usage: node scripts/platform-owner.mjs <grant|revoke> <existing-account-email>',
  );
  process.exitCode = 1;
} else {
  let db;
  try {
    const database = path.resolve(
      root,
      process.env.AUTH_DB_PATH || 'data/clients.sqlite',
    );
    if (!existsSync(database))
      throw new Error('Account database does not exist. Check AUTH_DB_PATH.');
    db = new DatabaseSync(database);
    db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;',
    );
    const user = db
      .prepare('SELECT id FROM client_users WHERE email=?')
      .get(email);
    if (!user)
      throw new Error(
        'No existing account matches this email. Nothing changed.',
      );
    db.prepare(
      'UPDATE client_users SET is_platform_admin=?,can_review_brokers=?,can_manage_requests=? WHERE id=?',
    ).run(...Array(3).fill(action === 'grant' ? 1 : 0), user.id);
    db.prepare('DELETE FROM client_sessions WHERE user_id=?').run(user.id);
    db.exec('COMMIT');
    console.log(
      JSON.stringify({
        userId: user.id,
        platformAdmin: action === 'grant',
        sessionsRevoked: true,
      }),
    );
  } catch (e) {
    if (db?.isTransaction) db.exec('ROLLBACK');
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}
