import { DatabaseSync, backup } from 'node:sqlite';
import { constants, openSync, closeSync, mkdirSync, lstatSync, chmodSync, unlinkSync } from 'node:fs';
import { dirname, resolve, basename, sep, parse, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = basename(moduleRoot) === 'dist-server' ? dirname(moduleRoot) : moduleRoot;
const within = (path: string, root: string) => path === root || path.startsWith(root + sep);

export function privateDirectory(directory: string) {
  const target = resolve(directory);
  // Never change permissions on a shared root; storage needs its own directory.
  if ([parse(target).root, resolve(tmpdir()), resolve(homedir()), projectRoot].includes(target) ||
      ['dist', 'public', 'src', 'dist-server'].some(name => within(target, join(projectRoot, name)))) {
    throw new Error('Use a dedicated private storage directory outside public/build/source directories.');
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Private storage must be an owned directory, not a symbolic link.');
  }
  if (process.platform !== 'win32') chmodSync(target, 0o700);
  return target;
}

function privateFile(filename: string, create: boolean, readOnly = false) {
  if (create && !readOnly) {
    try { closeSync(openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)); }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  }
  // Do not open/close an existing DB or SHM file outside SQLite: closing any fd
  // can release POSIX locks held by another SQLite connection in this process.
  // The containing directory is owned and private before inspecting these paths.
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('SQLite storage must be an owned regular file without hard links or symbolic links.');
  }
  if (process.platform !== 'win32') chmodSync(filename, 0o600);
}

export function openPrivateDatabase(databasePath: string, options: { create?: boolean; readOnly?: boolean } = {}) {
  const filename = databasePath === ':memory:' ? databasePath : resolve(databasePath);
  if (filename !== ':memory:') {
    privateDirectory(dirname(filename));
    privateFile(filename, options.create !== false && !options.readOnly, options.readOnly);
    // Existing WAL/SHM can contain account and session data too. Tighten before opening.
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try { privateFile(filename + suffix, false, options.readOnly); }
      catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const db = new DatabaseSync(filename, { readOnly: options.readOnly, allowExtension: false });
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;');
    if (!options.readOnly) db.exec('PRAGMA secure_delete=ON;');
    return db;
  } catch (error) { db.close(); throw error; }
}

export async function backupPrivateDatabase(databasePath: string, directory: string) {
  if (databasePath === ':memory:') throw new Error('A persisted source database is required.');
  const destination = privateDirectory(directory);
  const filename = join(destination, 'mihwar-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.sqlite');
  const source = openPrivateDatabase(databasePath, { create: false, readOnly: true });
  let created = false;
  try {
    // Reserve a unique owner-only file. The backup API includes committed WAL data.
    const fd = openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    closeSync(fd);
    created = true;
    await backup(source, filename);
    const verification = openPrivateDatabase(filename, { create: false, readOnly: true });
    try {
      const integrity = verification.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || verification.prepare('PRAGMA foreign_key_check').all().length) {
        throw new Error('Backup verification failed; no verified backup was produced.');
      }
      return { path: filename, integrity: 'ok', foreignKeys: 'ok' };
    } finally { verification.close(); }
  } catch (error) {
    if (created) unlinkSync(filename);
    throw error;
  } finally { source.close(); }
}
