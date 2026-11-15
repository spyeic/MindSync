import type { Reply } from './protocol';

export class ClientError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export function errorText(error: unknown) {
  return error instanceof ClientError ? error.message : '连接暂时不可用，请稍后重试。';
}

export function createRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
  const reply = await response.json() as Reply<T>;
  if (!reply.ok) throw new ClientError(reply.code, reply.error);
  return reply.data;
}

let session: Promise<{ nickname: string }> | undefined;
export function guest(): Promise<{ nickname: string }> {
  if (!session) {
    const initialize = () => request<{ nickname: string }>('/api/session', {});
    const pending = (async () => navigator.locks ? navigator.locks.request('mindsync-guest', initialize) : initialize())();
    session = pending.catch((error: unknown) => { session = undefined; throw error; });
  }
  return session;
}
