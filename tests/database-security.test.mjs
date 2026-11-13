import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, chmodSync, statSync, existsSync, readdirSync, symlinkSync, linkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { openPrivateDatabase, backupPrivateDatabase } from '../server/database.ts';

const posix = process.platform !== 'win32';
const mode = path => statSync(path).mode & 0o777;
const fixture = () => mkdtempSync(join(tmpdir(), 'mihwar-storage-security-'));

test('existing data survives tightening database, directory, WAL and SHM permissions', () => {
  const root = fixture(), filename = join(root, 'clients.sqlite');
  let original, secure;
  try {
    original = new DatabaseSync(filename);
    original.exec('PRAGMA journal_mode=WAL; CREATE TABLE preserved(id INTEGER); INSERT INTO preserved VALUES(42)');
    if (posix) for (const path of [filename, filename+'-wal', filename+'-shm']) chmodSync(path, 0o666);
    if (posix) chmodSync(root, 0o755);
    secure = openPrivateDatabase(filename);
    assert.equal(secure.prepare('SELECT id FROM preserved').get().id, 42);
    assert.equal(secure.prepare('PRAGMA trusted_schema').get().trusted_schema, 0);
    assert.equal(secure.prepare('PRAGMA secure_delete').get().secure_delete, 1);
    if (posix) {
      assert.equal(mode(root), 0o700);
      for (const path of [filename, filename+'-wal', filename+'-shm']) assert.equal(mode(path), 0o600);
    }
  } finally { secure?.close(); original?.close(); rmSync(root, {recursive:true,force:true}); }
});

test('new database and newly created WAL/SHM are private even with a permissive umask', () => {
  const root = fixture(), filename=join(root,'private','clients.sqlite');
  const previous=process.umask(0);
  let db;
  try {
    db=openPrivateDatabase(filename);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE example(id INTEGER); INSERT INTO example VALUES(1)');
    if(posix) {
      assert.equal(mode(join(root,'private')),0o700);
      for(const file of [filename,filename+'-wal',filename+'-shm']) assert.equal(mode(file),0o600);
    }
  } finally {process.umask(previous);db?.close();rmSync(root,{recursive:true,force:true});}
});

test('hardening a second connection does not release an existing SQLite write lock', () => {
  const root=fixture(), filename=join(root,'clients.sqlite');
  const first=openPrivateDatabase(filename);
  let second;
  try {
    first.exec('CREATE TABLE keep(id INTEGER); BEGIN IMMEDIATE; INSERT INTO keep VALUES(1)');
    second=openPrivateDatabase(filename);
    second.exec('PRAGMA busy_timeout=0');
    assert.throws(()=>second.exec('INSERT INTO keep VALUES(2)'),/locked/);
    const external=spawnSync(process.execPath,['--input-type=module','-e',
      "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec('PRAGMA busy_timeout=0; INSERT INTO keep VALUES(3)');",filename],
      {encoding:'utf8',timeout:5000});
    assert.ifError(external.error);
    assert.notEqual(external.status,0);
    assert.match(external.stderr,/locked/);
    first.exec('COMMIT');
    second.exec('INSERT INTO keep VALUES(2)');
    assert.deepEqual(second.prepare('SELECT id FROM keep ORDER BY id').all().map(x=>x.id),[1,2]);
  } finally {if(first.isTransaction)first.exec('ROLLBACK');second?.close();first.close();rmSync(root,{recursive:true,force:true});}
});

test('database symlinks, hard links and public storage paths are rejected without changing target contents', {skip:!posix}, () => {
  const root=fixture(), filename=join(root,'real.sqlite');
  const db=new DatabaseSync(filename);db.exec('CREATE TABLE keep(id INTEGER); INSERT INTO keep VALUES(9)');db.close();
  const original=readFileSync(filename);
  try {
    symlinkSync(filename,join(root,'link.sqlite'));
    assert.throws(()=>openPrivateDatabase(join(root,'link.sqlite')));
    linkSync(filename,join(root,'hard.sqlite'));
    assert.throws(()=>openPrivateDatabase(join(root,'hard.sqlite')),/hard links/);
    assert.deepEqual(readFileSync(filename),original);
    for(const folder of ['dist','public','src','dist-server']) {
      assert.throws(()=>openPrivateDatabase(resolve(folder,'private.sqlite')),/dedicated private storage/);
      assert.equal(existsSync(resolve(folder,'private.sqlite')),false);
    }
    assert.throws(()=>openPrivateDatabase(join(tmpdir(),'shared-root.sqlite')),/dedicated private storage/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('verified backups include committed WAL data, reopen independently and never overwrite earlier backups', async () => {
  const root=fixture(), source=join(root,'clients.sqlite'), destination=join(root,'backups');
  const db=openPrivateDatabase(source);
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO parent VALUES(7); INSERT INTO child VALUES(7)');
    assert.ok(statSync(source+'-wal').size>0);
    const first=await backupPrivateDatabase(source,destination);
    assert.equal(first.integrity,'ok');assert.equal(first.foreignKeys,'ok');
    db.prepare('INSERT INTO parent VALUES(?)').run(8);
    const second=await backupPrivateDatabase(source,destination);
    assert.notEqual(first.path,second.path);
    const restored=new DatabaseSync(first.path,{readOnly:true});
    try {
      assert.deepEqual(restored.prepare('SELECT id FROM parent').all().map(x=>x.id),[7]);
      assert.equal(restored.prepare('SELECT parent_id FROM child').get().parent_id,7);
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    } finally {restored.close();}
    if(posix) {assert.equal(mode(destination),0o700);assert.equal(mode(first.path),0o600);}
  } finally {db.close();rmSync(root,{recursive:true,force:true});}
});

test('invalid backup sources fail without claiming success or leaving an invalid backup', async () => {
  const root=fixture(), source=join(root,'clients.sqlite'), destination=join(root,'backups');
  const db=new DatabaseSync(source);
  try {
    db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id)); INSERT INTO child VALUES(999)');
    await assert.rejects(backupPrivateDatabase(source,destination),/verification failed/);
    assert.deepEqual(readdirSync(destination),[]);
    await assert.rejects(backupPrivateDatabase(join(root,'missing.sqlite'),destination));
    assert.equal(existsSync(join(root,'missing.sqlite')),false);
  } finally {db.close();rmSync(root,{recursive:true,force:true});}
});
