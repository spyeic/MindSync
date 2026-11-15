import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Reply } from '../lib/protocol.ts';
import { clientAddress, isAllowedOrigin, type Config } from './config.ts';
import { AppError, describeError } from './errors.ts';
import type { GameEngine } from './game.ts';
import type { RateLimits } from './limits.ts';
import type { Realtime } from './realtime.ts';
import type { SessionService } from './session.ts';
import { createSchema, joinSchema, roomCodeSchema } from './validation.ts';

function send<T>(res: ServerResponse, status: number, reply: Reply<T>) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' });
  res.end(JSON.stringify(reply));
}

async function readJson(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError(415, 'JSON_REQUIRED', '请求必须使用 JSON。');
  }
  const maxBytes = 4096;
  if (Number(req.headers['content-length']) > maxBytes) throw new AppError(413, 'BODY_LIMIT', '请求内容太大。');
  const buffers: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new AppError(413, 'BODY_LIMIT', '请求内容太大。');
    buffers.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString('utf8')) as unknown;
  } catch {
    throw new AppError(400, 'BAD_JSON', '无法读取请求内容。');
  }
}

export function createApi(config: Config, engine: GameEngine, sessions: SessionService, realtime: Realtime, limits: RateLimits) {
  return async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    try {
      const ip = clientAddress(req, config);
      limits.hit(`http:${ip}`, 240);
      const path = url.pathname;
      const post = req.method === 'POST';
      if (post && !isAllowedOrigin(req, config)) throw new AppError(403, 'ORIGIN', '请求来源未获允许。');
      if (!post && req.method !== 'GET') throw new AppError(405, 'METHOD', '不支持此请求方法。');
      if (req.headers.origin && !config.origins.has(req.headers.origin)) {
        throw new AppError(403, 'ORIGIN', '请求来源未获允许。');
      }
      const success = <T>(data: T, status = 200) => send(res, status, { ok: true, data });
      if (path === '/api/health' && !post) return success({ ready: true });
      if (path === '/api/session' && post) {
        const existing = sessions.read(req.headers.cookie);
        if (!existing) limits.hit(`session:${ip}`, 36);
        const session = sessions.ensure(req.headers.cookie);
        if (session.cookie) res.setHeader('Set-Cookie', session.cookie);
        req.resume();
        return success({ nickname: session.nickname });
      }
      const player = sessions.read(req.headers.cookie);
      if (!player) throw new AppError(401, 'SESSION_REQUIRED', '请先初始化访客会话。');

      if (path === '/api/rooms' && post) {
        limits.hit(`create:${player.id}`, 12);
        limits.hit(`create-ip:${ip}`, 32);
        const input = createSchema.parse(await readJson(req));
        return success({ code: engine.create(player.id, input.nickname || player.nickname, input.settings, input.requestId) }, 201);
      }
      const room = /^\/api\/rooms\/([^/]+)(\/join)?$/.exec(path);
      if (room && ((!room[2] && !post) || (room[2] && post))) {
        const code = roomCodeSchema.parse(room[1]);
        if (!engine.member(code, player.id)) {
          limits.hit(`lookup:${player.id}`, 8);
          limits.hit(`lookup-ip:${ip}`, 40);
        }
        if (post) {
          const input = joinSchema.parse(await readJson(req));
          engine.join(code, player.id, input.nickname || player.nickname);
          realtime.broadcast(code);
          return success({ code });
        }
        return success(engine.canJoin(code, player.id) ? { needsJoin: true as const } :
          { needsJoin: false as const, room: realtime.snapshot(code, player.id) });
      }
      if (!post && path === '/api/history') {
        const page = z.coerce.number().int().min(1).max(1_000_000).parse(url.searchParams.get('page') ?? 1);
        const order = z.enum(['newest', 'oldest']).parse(url.searchParams.get('order') ?? 'newest');
        return success(engine.history(player.id, page, order));
      }
      if (!post && path.startsWith('/api/history/')) {
        return success(engine.detail(z.uuid().parse(path.slice('/api/history/'.length)), player.id));
      }
      throw new AppError(404, 'NOT_FOUND', '找不到请求的内容。');
    } catch (error) {
      if (res.destroyed) return;
      const { status, reply } = describeError(error);
      if (status === 429) res.setHeader('Retry-After', '60');
      if (status === 413) {
        res.setHeader('Connection', 'close');
        req.resume();
      }
      send(res, status, reply);
    }
  };
}
