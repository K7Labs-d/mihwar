import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ensureRequestManagementPermission } from '../server/accountPermissions.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
const [action, emailInput, ...extra] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
if (!['grant', 'revoke'].includes(action) || !email || extra.length || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/request-manager.mjs <grant|revoke> <existing-account-email>');
  process.exitCode = 1;
} else {
  const databasePath = path.resolve(root, process.env.AUTH_DB_PATH || 'data/clients.sqlite');
  let db;
  try {
    if (!existsSync(databasePath)) throw new Error('The account database does not exist. Check AUTH_DB_PATH.');
    db = new DatabaseSync(databasePath);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    ensureRequestManagementPermission(db);
    // Only a server operator can run this command; no public API grants permission.
    const user = db.prepare('UPDATE client_users SET can_manage_requests=? WHERE email=? RETURNING id').get(action === 'grant' ? 1 : 0, email);
    if (!user) throw new Error('No existing account matches this email. No permission was granted.');
    console.log(JSON.stringify({ userId: user.id, manageRequests: action === 'grant' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { db?.close(); }
}
