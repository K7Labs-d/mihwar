import { existsSync } from 'node:fs';

const serverUrl = new URL('../dist-server/server.js', import.meta.url);
if (!existsSync(serverUrl) || !existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('Build files are missing. Run npm run build, then npm start.');
  process.exitCode = 1;
} else {
  process.env.NODE_ENV = 'production';
  const { runServer } = await import(serverUrl.href);
  await runServer();
}
