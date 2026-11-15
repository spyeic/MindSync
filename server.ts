import { createServer } from 'node:http';
import nextEnv from '@next/env';
import { createRequire } from 'node:module';
import { createApi } from './server/api.ts';
import { readConfig } from './server/config.ts';
import { openDatabase } from './server/db.ts';
import { GameEngine } from './server/game.ts';
import { RateLimits } from './server/limits.ts';
import { attachRealtime } from './server/realtime.ts';
import { SessionService } from './server/session.ts';

const next: typeof import('next/dist/server/next.js').default = createRequire(import.meta.url)('next');

async function main() {
  const dev = process.argv.includes('--dev');
  Object.assign(process.env, { NODE_ENV: dev ? 'development' : 'production' });
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  process.umask(0o077);
  nextEnv.loadEnvConfig(process.cwd(), dev);
  const config = readConfig(process.env, dev);
  const store = openDatabase(config.databasePath);
  const engine = new GameEngine(store);
  const sessions = new SessionService(store, config.secureCookie);
  const limits = new RateLimits();
  engine.sweep();
  engine.recoverPresence();
  sessions.prune();

  const app = next({ dev, webpack: dev, hostname: config.host, port: config.port });
  await app.prepare();
  const render = app.getRequestHandler();
  const http = createServer({ requestTimeout: 20_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://internal.invalid'); } catch { res.writeHead(400).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      void api(req, res, url);
    } else {
      void render(req, res).catch((error: unknown) => {
        console.error('Next.js request failed:', error);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    }
  });
  const realtime = attachRealtime(http, config, engine, sessions, limits);
  const api = createApi(config, engine, sessions, realtime, limits);
  http.on('upgrade', (req, socket) => {
    const path = req.url?.split('?', 1)[0];
    if (path === '/socket.io/' || (dev && (path === '/_next/hmr' || path === '/_next/webpack-hmr'))) return;
    socket.destroy();
  });
  const sweep = setInterval(() => {
    try {
      for (const code of engine.sweep()) realtime.broadcast(code);
    } catch (error) {
      console.error('Deadline sweep failed:', error);
    }
  }, 200).unref();
  const maintenance = setInterval(() => {
    limits.prune();
    try { sessions.prune(); } catch (error) { console.error('Session cleanup failed:', error); }
  }, 60_000).unref();

  http.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
  http.listen(config.port, config.host, () => {
    console.log(`MindSync ready at http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${config.port}`);
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(sweep);
    clearInterval(maintenance);
    setTimeout(() => process.exit(1), 8000).unref();
    await realtime.io.close();
    await app.close();
    store.sqlite.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
}

void main().catch((error: unknown) => {
  console.error('MindSync startup failed:', error);
  process.exit(1);
});
