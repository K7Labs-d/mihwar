import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAuthOrigin, proxyTrust, transportSecurity, serverOrigin } from '../server/transportSecurity.ts';

async function fixture(cidrs='') {
  const app=express();
  app.set('trust proxy',proxyTrust(cidrs));
  app.use(transportSecurity('https://mihwar.example'));
  let writes=0;
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  app.post('/api/client/register',(_req,res)=>res.status(201).json({writes:++writes}));
  app.get('/ip',(req,res)=>res.json({ip:req.ip}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  return {base:'http://127.0.0.1:'+server.address().port, writes:()=>writes,
    close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}

test('public origins require HTTPS and invalid origins or public HTTP binding fail closed',()=>{
  for(const value of ['http://mihwar.example','https://user:password@mihwar.example','https://mihwar.example/path','https://mihwar.example/?x=1','https://mihwar.example/#x','ftp://localhost']) assert.throws(()=>parseAuthOrigin(value));
  assert.throws(()=>serverOrigin(undefined,'0.0.0.0',3000));
  assert.throws(()=>serverOrigin('http://localhost:3000','0.0.0.0',3000));
  assert.equal(serverOrigin(undefined,'127.0.0.1',3000),'http://localhost:3000');
  assert.equal(serverOrigin('https://mihwar.example','0.0.0.0',3000),'https://mihwar.example');
});

test('HTTP redirects to configured origin without trusting Host; unsafe methods cannot change data',async()=>{
  const f=await fixture();
  try {
    const get=await fetch(f.base+'/equipment?q=crane',{redirect:'manual',headers:{Host:'attacker.example','X-Forwarded-Host':'attacker.example','X-Forwarded-Proto':'https'}});
    assert.equal(get.status,308);assert.equal(get.headers.get('location'),'https://mihwar.example/equipment?q=crane');
    for(const method of ['POST','PUT','PATCH','DELETE']) {
      const r=await fetch(f.base+'/api/client/register',{method,redirect:'manual',headers:{'X-Forwarded-Proto':'https'}});
      assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
    }
    assert.equal(f.writes(),0);
  } finally {await f.close();}
});

test('only trusted TLS proxy requests pass, receive HSTS, and resolve the real client IP',async()=>{
  const f=await fixture('127.0.0.1/32');
  try {
    const secure=await fetch(f.base+'/api/client/register',{method:'POST',headers:{'X-Forwarded-Proto':'https'}});
    assert.equal(secure.status,201);assert.equal(f.writes(),1);
    assert.equal(secure.headers.get('strict-transport-security'),'max-age=31536000');
    assert.equal(secure.headers.get('x-content-type-options'),'nosniff');
    const insecure=await fetch(f.base+'/api/client/register',{method:'POST',headers:{'X-Forwarded-Proto':'http'}});
    assert.equal(insecure.status,403);
    const ambiguous=await fetch(f.base+'/api/client/register',{method:'POST',headers:{'X-Forwarded-Proto':'https,http'}});
    assert.equal(ambiguous.status,403);assert.equal(f.writes(),1);
    const address=await fetch(f.base+'/ip',{headers:{'X-Forwarded-Proto':'https','X-Forwarded-For':'198.51.100.1, 192.0.2.2'}});
    assert.equal((await address.json()).ip,'192.0.2.2');
    const health=await fetch(f.base+'/api/health',{headers:{'X-Forwarded-Proto':'https'}});
    assert.equal(health.status,200);
  } finally {await f.close();}
});

test('proxy trust rejects blanket/hop settings and matches IPv4-mapped IPv6 without widening trust',()=>{
  for(const config of ['true','1','*','0.0.0.0/0','::/0','127.0.0.1/33','127.0.0.1,','localhost','127.0.0.1/8/1']) assert.throws(()=>proxyTrust(config));
  const trust=proxyTrust('127.0.0.0/8,::1/128');
  assert.equal(trust('127.0.0.1'),true);assert.equal(trust('::ffff:127.0.0.1'),true);
  assert.equal(trust('::ffff:192.0.2.1'),false);assert.equal(trust('192.0.2.1'),false);assert.equal(trust('::1'),true);
  assert.equal(proxyTrust()('127.0.0.1'),false);
});

test('the actual server refuses unsafe public configuration before opening the account database',()=>{
  const root=mkdtempSync(join(tmpdir(),'mihwar-config-security-'));
  const filename=join(root,'clients.sqlite');
  try {
    for(const settings of [
      {AUTH_ORIGIN:'https://mihwar.example',TRUST_PROXY_CIDRS:''},
      {AUTH_ORIGIN:'https://mihwar.example',TRUST_PROXY_CIDRS:'true'},
      {AUTH_ORIGIN:'http://localhost:3000',TRUST_PROXY_CIDRS:''},
      {AUTH_ORIGIN:'',TRUST_PROXY_CIDRS:''},
    ]) {
      const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./server.ts')"],{
        cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',HOST:'0.0.0.0',AUTH_DB_PATH:filename,...settings},encoding:'utf8',timeout:10000,
      });
      assert.ifError(result.error);assert.notEqual(result.status,0);
      assert.match(result.stderr,/TRUST_PROXY_CIDRS|HTTPS|loopback/);
      assert.equal(existsSync(filename),false);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('the actual development server does not expose SQLite or WAL via ordinary or Vite filesystem URLs',async()=>{
  const project=resolve(fileURLToPath(new URL('..',import.meta.url))), data=join(project,'data');
  mkdirSync(data,{recursive:true,mode:0o700});
  const folder=mkdtempSync(join(data,'security-http-')), filename=join(folder,'clients.sqlite');
  const child=spawn(process.execPath,['server.ts'],{
    cwd:project,env:{...process.env,NODE_ENV:'development',PORT:'0',HOST:'127.0.0.1',AUTH_ORIGIN:'http://localhost',AUTH_DB_PATH:filename,TRUST_PROXY_CIDRS:''},stdio:['ignore','pipe','pipe'],
  });
  const closed=once(child,'close');
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  try {
    let base;
    for(let n=0;n<150;n++) {
      const match=output.match(/Mahwar: http:\/\/localhost:(\d+)/);
      if(match){base='http://127.0.0.1:'+match[1];break;}
      if(child.exitCode!==null)throw new Error('Fixture startup failed: '+output);
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(base,'development fixture starts');
    assert.equal((await fetch(base+'/api/health')).status,200);
    for(const suffix of ['', '-wal', '-shm']) {
      for(const path of ['/'+relative(project,filename+suffix),'/@fs'+filename+suffix]) {
        const response=await fetch(base+path);
        assert.ok([403,404].includes(response.status),path+': '+response.status);
        assert.ok(!(await response.text()).includes('SQLite format 3'));
      }
    }
  } finally {if(child.exitCode===null)child.kill('SIGTERM');await closed;rmSync(folder,{recursive:true,force:true});}
});
