import type express from 'express';
import { BlockList, isIP } from 'node:net';

const loopbackHost = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

export function parseAuthOrigin(origin: string) {
  const site = new URL(origin);
  if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.pathname !== '/' || site.search || site.hash ||
      (site.protocol === 'http:' && !loopbackHost(site.hostname))) {
    throw new Error('AUTH_ORIGIN must be an HTTPS origin without credentials, path, query or fragment. HTTP is local-only.');
  }
  return site;
}

export function proxyTrust(cidrs = '') {
  const list = new BlockList();
  if (cidrs.trim()) for (const entry of cidrs.split(',')) {
    const [address, prefix, ...rest] = entry.trim().split('/');
    const family = isIP(address), bits = family === 4 ? 32 : 128;
    if (!family || rest.length || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > bits))) {
      throw new Error('TRUST_PROXY_CIDRS must contain explicit IP addresses/CIDRs; booleans, hop counts and /0 are unsafe.');
    }
    list.addSubnet(address, prefix === undefined ? bits : Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
  }
  // Use Node's IP matcher, avoiding dependency range parsing and trusting no hop by default.
  return (address: string) => {
    const family = isIP(address);
    return !!family && list.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
}

export function transportSecurity(origin: string): express.RequestHandler {
  const site = parseAuthOrigin(origin);
  const localPeer = proxyTrust('127.0.0.0/8,::1/128');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (site.protocol === 'http:') {
      // Development HTTP stays on loopback, including the socket and request Host.
      const peer = req.socket.remoteAddress || '';
      if (!localPeer(peer) || !loopbackHost(req.hostname)) {
        return res.status(403).json({ error: 'HTTPS is required.' });
      }
      return next();
    }
    if (req.secure && (!req.headers['x-forwarded-proto'] || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    if (['GET', 'HEAD'].includes(req.method) && req.originalUrl.startsWith('/')) {
      // Never build redirects from Host or X-Forwarded-Host supplied by the caller.
      return res.redirect(308, site.origin + req.originalUrl);
    }
    return res.status(403).json({ error: 'HTTPS is required. No data was changed.' });
  };
}

export function serverOrigin(origin: string | undefined, host: string, port: string | number) {
  const site = parseAuthOrigin(origin || 'http://localhost:' + port);
  if (site.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('Public listeners require an explicit HTTPS AUTH_ORIGIN. Local HTTP must bind to loopback.');
  }
  return site.origin;
}
