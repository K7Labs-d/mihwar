// Operator command: private SQLite-aware backup; never a public HTTP endpoint.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupPrivateDatabase } from '../server/database.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
const [destination, ...extra] = process.argv.slice(2);
try {
  if (!destination || extra.length) throw new Error('Usage: node scripts/backup-database.mjs <private-backup-directory>');
  const source = process.env.AUTH_DB_PATH || 'data/clients.sqlite';
  const result = await backupPrivateDatabase(source === ':memory:' ? source : path.resolve(root, source), path.resolve(root, destination));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
