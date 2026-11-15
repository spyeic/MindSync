import { isIP } from 'node:net';
import { resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';

export const loopback = (address: string | undefined) => Boolean(address && (
  address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
));

function localHttpHost(hostname: string) {
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return true;
  if (isIP(hostname) !== 4) return false;
  const [first, second] = hostname.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function readConfig(env: NodeJS.ProcessEnv, dev: boolean) {
  const port = z.coerce.number().int().min(1).max(65535).parse(env.PORT ?? 3000);
  const host = z.string().min(1).parse(env.HOST ?? '127.0.0.1');
  const publicUrl = parseOrigin(env.PUBLIC_BASE_URL ?? `http://localhost:${port}`);
  const trustProxy = z.enum(['true', 'false']).parse(env.TRUST_PROXY ?? 'false') === 'true';
  if (!dev && publicUrl.protocol !== 'https:' && !localHttpHost(publicUrl.hostname)) {
    throw new Error('PUBLIC_BASE_URL must use HTTPS for public production access');
  }

  const origins = new Set([publicUrl.origin]);
  if (['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname) || dev) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://[::1]:${port}`);
  }
  for (const origin of (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const parsed = parseOrigin(origin);
    if (!dev && parsed.protocol !== 'https:' && !localHttpHost(parsed.hostname)) {
      throw new Error('Additional public origins must use HTTPS in production');
    }
    origins.add(parsed.origin);
  }
  return {
    host, port, publicUrl, origins, trustProxy,
    secureCookie: publicUrl.protocol === 'https:',
    databasePath: resolve(env.DATABASE_PATH || './mindsync.db'),
  };
}

function parseOrigin(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.username || url.password || url.hash || url.search) {
    throw new Error('Expected an HTTP(S) origin without a path, credentials, query, or fragment');
  }
  return url;
}

export type Config = ReturnType<typeof readConfig>;

export function clientAddress(req: IncomingMessage, config: Config) {
  const peer = req.socket.remoteAddress;
  const forwarded = req.headers['x-forwarded-for'];
  if (config.trustProxy && loopback(peer) && typeof forwarded === 'string') {
    // The local proxy must overwrite the header with a single verified client address.
    const address = forwarded.trim();
    if (isIP(address)) return address;
  }
  return peer ?? 'unknown';
}

export function isAllowedOrigin(req: IncomingMessage, config: Config, allowSameOriginGet = false) {
  if (req.headers.origin !== undefined) return config.origins.has(req.headers.origin);
  if (!allowSameOriginGet || req.method !== 'GET' || req.headers.upgrade !== undefined) return false;
  if (req.headers['sec-fetch-site'] === 'same-origin') return true;
  // Plain HTTP LAN requests omit Fetch Metadata. Validate their Referer against the allowlist.
  if (req.headers['sec-fetch-site'] !== undefined || !req.headers.referer) return false;
  try {
    return config.origins.has(new URL(req.headers.referer).origin);
  } catch {
    return false;
  }
}
