'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ClientError, errorText, guest, request } from '@/lib/client-api';
import type { ClientEvents, GameCommand, RoomView, ServerEvents } from '@/lib/protocol';

type GameSocket = Socket<ServerEvents, ClientEvents>;
type Access = { needsJoin: true } | { needsJoin: false; room: RoomView };
export type SyncedRoom = { room: RoomView; receivedAt: number };
type PresenceNotice = { name: string; online: boolean };

export function useRoom(code: string) {
  const socket = useRef<GameSocket>(null);
  const [identity, setIdentity] = useState('');
  const [state, setState] = useState<SyncedRoom>();
  const [needsJoin, setNeedsJoin] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [presenceNotice, setPresenceNotice] = useState<PresenceNotice>();

  useEffect(() => {
    if (!presenceNotice?.online) return;
    const timeout = setTimeout(() => {
      setPresenceNotice((current) => current === presenceNotice ? undefined : current);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [presenceNotice]);

  useEffect(() => {
    let active = true;
    let pageHidden = false;
    const inviteUrl = new URL(`/room/${encodeURIComponent(code)}`, window.location.origin).href;
    let connection: GameSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let opponentOnline: boolean | undefined;
    const update = (room: RoomView) => {
      if (active) setState({ room: { ...room, inviteUrl }, receivedAt: performance.now() });
    };
    const updateLive = (room: RoomView) => {
      if (!active || pageHidden) return;
      update(room);
      const opponent = room.players[1 - room.seat];
      if (!opponent) {
        opponentOnline = undefined;
        setPresenceNotice(undefined);
        return;
      }
      if (opponentOnline !== undefined && opponentOnline !== opponent.online) {
        setPresenceNotice({ name: opponent.name, online: opponent.online });
      }
      // An occupied seat may be broadcast before the guest opens their first socket.
      if (opponent.online || opponentOnline !== undefined) opponentOnline = opponent.online;
    };
    const leavePage = () => {
      pageHidden = true;
      connection?.disconnect();
    };
    const restorePage = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      pageHidden = false;
      connection?.connect();
    };
    window.addEventListener('pagehide', leavePage);
    window.addEventListener('pageshow', restorePage);
    async function initialize() {
      try {
        const session = await guest();
        const access = await request<Access>(`/api/rooms/${code}`);
        if (!active) return;
        setIdentity(session.nickname);
        setNeedsJoin(access.needsJoin);
        setError('');
        if (access.needsJoin) return;
        opponentOnline = access.room.players[1 - access.room.seat]?.online;
        update(access.room);
        connection = io({ autoConnect: false, reconnectionDelayMax: 3500 });
        const client = connection;
        socket.current = client;
        const watch = () => {
          client.timeout(5000).emit('room:watch', { code }, (err, reply) => {
            if (!active || !client.connected) return;
            if (err) {
              retry = setTimeout(watch, 1000);
              return;
            }
            if (!reply.ok) {
              setConnected(false);
              if (reply.code === 'ROOM_FORBIDDEN') {
                setState(undefined);
                setNeedsJoin(true);
                client.disconnect();
              } else {
                setError(reply.error);
              }
              return;
            }
            updateLive(reply.data);
            setConnected(true);
            setError('');
          });
        };
        client.on('connect', watch);
        client.on('room:state', updateLive);
        client.on('disconnect', () => {
          clearTimeout(retry);
          opponentOnline = undefined;
          if (active) {
            setConnected(false);
            setPresenceNotice(undefined);
          }
        });
        client.on('connect_error', () => {
          if (active) {
            setConnected(false);
            if (!client.active) setError('访客会话无法恢复，请刷新页面。');
          }
        });
        if (!pageHidden) client.connect();
      } catch (failure) {
        if (active) setError(errorText(failure));
      }
    }
    void initialize();
    return () => {
      active = false;
      window.removeEventListener('pagehide', leavePage);
      window.removeEventListener('pageshow', restorePage);
      clearTimeout(retry);
      connection?.disconnect();
      socket.current = null;
    };
  }, [code, attempt]);

  const join = useCallback(async (nickname: string) => {
    await request(`/api/rooms/${code}/join`, { nickname });
    setNeedsJoin(false);
    setAttempt((count) => count + 1);
  }, [code]);

  const command = useCallback(async (payload: GameCommand) => {
    const client = socket.current;
    if (!client?.connected || !connected) throw new ClientError('DISCONNECTED', '正在重新连接，请稍后重试。');
    const reply = await client.timeout(5000).emitWithAck('room:command', payload);
    if (!reply.ok) throw new ClientError(reply.code, reply.error);
  }, [connected]);

  const reload = () => { setError(''); setConnected(false); setAttempt((count) => count + 1); };
  return { state, needsJoin, connected, identity, error, join, command, reload, presenceNotice };
}
