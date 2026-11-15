import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { readConfig, isAllowedOrigin } from '../../server/config.ts';
import { createRequestId } from '../../lib/client-api.ts';
import { z } from 'zod';

describe('LAN access', () => {
  it('creates valid request identifiers without secure-context randomUUID', () => {
    expect(z.uuid().parse(createRequestId())).toMatch(/^[a-f0-9-]{36}$/);
    expect(createRequestId()).not.toBe(createRequestId());
  });

  it.each(['10.20.50.50', '172.16.1.2', '172.31.255.254', '192.168.1.2'])('allows HTTP for explicit private address %s', (host) => {
    const config = readConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: `http://${host}:3000` }, false);
    expect(config.secureCookie).toBe(false);
    expect(config.origins.has(`http://${host}:3000`)).toBe(true);
  });

  it.each(['172.32.1.2', '8.8.8.8', 'example.com'])('requires HTTPS for public address %s', (host) => {
    expect(() => readConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: `http://${host}:3000` }, false)).toThrow('HTTPS');
  });

  it('checks the actual allowed referrer for polling GETs without Fetch Metadata', () => {
    const config = readConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://10.20.50.50:3000' }, false);
    const request = (headers: IncomingMessage['headers'], method = 'GET') => ({ headers, method }) as IncomingMessage;
    expect(isAllowedOrigin(request({ referer: 'http://10.20.50.50:3000/room/ABC' }), config, true)).toBe(true);
    expect(isAllowedOrigin(request({ referer: 'http://evil.example/' }), config, true)).toBe(false);
    expect(isAllowedOrigin(request({ referer: 'invalid' }), config, true)).toBe(false);
    expect(isAllowedOrigin(request({}), config, true)).toBe(false);
    expect(isAllowedOrigin(request({ referer: 'http://10.20.50.50:3000/', 'sec-fetch-site': 'cross-site' }), config, true)).toBe(false);
    expect(isAllowedOrigin(request({ origin: 'http://evil.example', referer: 'http://10.20.50.50:3000/' }), config, true)).toBe(false);
    expect(isAllowedOrigin(request({ referer: 'http://10.20.50.50:3000/', upgrade: 'websocket' }), config, true)).toBe(false);
    expect(isAllowedOrigin(request({ referer: 'http://10.20.50.50:3000/' }, 'POST'), config, true)).toBe(false);
  });
});
