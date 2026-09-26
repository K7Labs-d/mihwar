import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createClientAuth } from './server/clientAuth.ts';
import { createLoginEmailSender } from './server/loginEmail.ts';

const filename = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(filename);
const projectRoot = path.basename(moduleDir) === 'dist-server' ? path.dirname(moduleDir) : moduleDir;
dotenv.config({ path: [path.join(projectRoot, '.env.local'), path.join(projectRoot, '.env')], quiet: true });
const emailKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.LOGIN_EMAIL_FROM;
if (process.env.NODE_ENV === 'production' && (!emailKey || !emailFrom)) {
  throw new Error('Email login requires RESEND_API_KEY and LOGIN_EMAIL_FROM in production.');
}

export const app = express();
app.disable('x-powered-by');
const clientAuth = createClientAuth({
  databasePath: process.env.AUTH_DB_PATH === ':memory:' ? ':memory:' : path.resolve(projectRoot, process.env.AUTH_DB_PATH || 'data/clients.sqlite'),
  origin: process.env.AUTH_ORIGIN || 'http://localhost:' + (process.env.PORT || 3000),
  sendLoginCode: emailKey && emailFrom ? createLoginEmailSender(emailKey, emailFrom) : undefined,
});
app.use('/api/client', clientAuth.router);
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', mode: 'client-auth', version: '0.3.0' });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
const frontend = express.Router();
app.use(frontend);
app.use((_req, res) => res.status(404).type('text').send('Not found'));
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  res.status(500).type('text').send('Internal error');
});

let frontendReady = false;
let vite: import('vite').ViteDevServer | undefined;

export async function startServer(port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1', options = { frontend: true }): Promise<Server> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
  if (options.frontend && !frontendReady) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer } = await import('vite');
      vite = await createServer({ root: projectRoot, configLoader: 'native', server: { middlewareMode: true }, appType: 'custom' });
      frontend.use(vite.middlewares);
      frontend.get('/', async (req, res, next) => {
        try {
          const template = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
          res.type('html').send(await vite!.transformIndexHtml(req.originalUrl, template));
        } catch (error) { next(error); }
      });
    } else {
      const dist = path.join(projectRoot, 'dist');
      const index = path.join(dist, 'index.html');
      if (!existsSync(index)) throw new Error('Build files are missing. Run npm run build, then npm start.');
      frontend.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
      frontend.get('/', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(index);
      });
    }
    frontendReady = true;
  }
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('error', reject);
    server.once('listening', () => { server.removeListener('error', reject); resolve(server); });
  });
}

export async function runServer() {
  try {
    const server = await startServer();
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : process.env.PORT || 3000;
    console.log('Mahwar: http://localhost:' + port);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      server.close(async () => {
        await vite?.close();
        clientAuth.close();
        clearTimeout(deadline);
        process.exit(0);
      });
      server.closeIdleConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error: any) {
    await vite?.close();
    console.error(error?.code === 'EADDRINUSE'
      ? 'Port is already in use. Stop the earlier server or change PORT.'
      : 'Could not start Mahwar: ' + (error?.message || 'Unknown error'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && filename === path.resolve(process.argv[1])) await runServer();
