import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientEvents, ServerEvents } from '../lib/protocol.ts';
import { clientAddress, isAllowedOrigin, type Config } from './config.ts';
import { AppError, describeError } from './errors.ts';
import type { GameEngine } from './game.ts';
import type { RateLimits } from './limits.ts';
import type { SessionService } from './session.ts';
import { commandSchema, watchSchema } from './validation.ts';

type SocketData = { playerId: string; room?: { id: string; code: string }; expiresAt: number };
type AppSocket = Socket<ClientEvents, ServerEvents, Record<never, never>, SocketData>;
const channel = (roomId: string) => `game:${roomId}`;

export function attachRealtime(http: HttpServer, config: Config, engine: GameEngine, sessions: SessionService, limits: RateLimits) {
  const io = new Server<ClientEvents, ServerEvents, Record<never, never>, SocketData>(http, {
    serveClient: false,
    maxHttpBufferSize: 4096,
    pingInterval: 20_000,
    pingTimeout: 15_000,
    cors: { origin: [...config.origins], credentials: true },
    destroyUpgrade: false,
    allowRequest(req, callback) {
      try {
        if (!isAllowedOrigin(req, config, true)) return callback('Origin denied', false);
        limits.hit(`handshake:${clientAddress(req, config)}`, 120);
        if (!sessions.read(req.headers.cookie)) return callback('Session required', false);
        callback(null, true);
      } catch {
        callback('Handshake denied', false);
      }
    },
  });

  // Engine.IO also accepts upgrades and polling requests for already-open transports.
  io.engine.use((req: IncomingMessage, _res: ServerResponse, next: (error?: Error) => void) => {
    if (!isAllowedOrigin(req, config, true)) return next(new Error('Origin denied'));
    next();
  });

  io.use((socket, next) => {
    const session = sessions.read(socket.request.headers.cookie);
    if (!session) return next(new Error('SESSION_REQUIRED'));
    socket.data.playerId = session.id;
    socket.data.expiresAt = session.expiresAt;
    next();
  });

  function occupants(code: string) {
    const roomId = engine.roomId(code);
    if (!roomId) return [];
    const ids = io.sockets.adapter.rooms.get(channel(roomId));
    return Array.from(ids ?? []).flatMap((id) => {
      const socket = io.sockets.sockets.get(id);
      return socket && socket.data.expiresAt > Date.now() ? [socket] : [];
    });
  }

  function snapshot(code: string, playerId: string) {
    const online = new Set(occupants(code).map((socket) => socket.data.playerId));
    return engine.view(code, playerId, new URL(`/room/${code}`, config.publicUrl).href, (id) => online.has(id));
  }

  function syncPresence(code: string) {
    const online = new Set(occupants(code).map((socket) => socket.data.playerId));
    engine.syncPresence(code, (id) => online.has(id));
  }

  function broadcast(code: string) {
    syncPresence(code);
    for (const socket of occupants(code)) {
      socket.emit('room:state', snapshot(code, socket.data.playerId));
    }
  }

  function respond<T>(socket: AppSocket, ack: Ack<T>, work: () => T) {
    if (typeof ack !== 'function') return;
    try {
      if (socket.data.expiresAt <= Date.now()) throw new AppError(401, 'SESSION_REQUIRED', '访客会话已过期，请刷新页面。');
      limits.hit(`socket:${socket.data.playerId}`, 140);
      ack({ ok: true, data: work() });
    } catch (error) {
      ack(describeError(error).reply);
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:watch', (payload, ack) => {
      respond(socket, ack, () => {
        limits.hit(`watch:${socket.data.playerId}`, 60);
        const { code } = watchSchema.parse(payload);
        const member = engine.member(code, socket.data.playerId);
        if (!member) throw new AppError(403, 'ROOM_FORBIDDEN', '你没有这个房间的席位。');
        syncPresence(code);
        if (!engine.member(code, socket.data.playerId)) throw new AppError(403, 'ROOM_FORBIDDEN', '你没有这个房间的席位。');
        const previous = socket.data.room;
        if (previous && previous.id !== member.roomId) {
          void socket.leave(channel(previous.id));
          broadcast(previous.code);
        }
        socket.data.room = { id: member.roomId, code };
        void socket.join(channel(member.roomId));
        broadcast(code);
        return snapshot(code, socket.data.playerId);
      });
    });
    socket.on('room:command', (payload, ack) => {
      respond(socket, ack, () => {
        const room = socket.data.room;
        if (!room || room.id !== engine.roomId(room.code)) throw new AppError(403, 'ROOM_FORBIDDEN', '请先进入房间。');
        const { code } = room;
        try {
          engine.command(code, socket.data.playerId, commandSchema.parse(payload));
        } finally {
          broadcast(code);
        }
        return null;
      });
    });
    socket.on('disconnect', () => {
      if (socket.data.room) broadcast(socket.data.room.code);
    });
  });

  return { io, broadcast, snapshot };
}

export type Realtime = ReturnType<typeof attachRealtime>;
