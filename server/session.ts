import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { Store } from './db.ts';
import { players, sessions } from './schema.ts';

const maxAge = 180 * 24 * 60 * 60;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const names = ['橘子', '云朵', '松果', '海盐', '小鹿', '流星', '月亮', '桃子', '泡芙', '纸船'];

export class SessionService {
  private readonly cookieName: string;
  private readonly store: Store;
  private readonly secure: boolean;

  constructor(store: Store, secure: boolean) {
    this.store = store;
    this.secure = secure;
    this.cookieName = secure ? '__Host-mindsync' : 'mindsync';
  }

  read(cookie: string | undefined) {
    const token = cookie?.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return this.store.db.select({ id: players.id, nickname: players.nickname, expiresAt: sessions.expiresAt, tokenHash: sessions.tokenHash })
      .from(sessions).innerJoin(players, eq(players.id, sessions.playerId))
      .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, Date.now()))).get();
  }

  ensure(cookie: string | undefined) {
    const existing = this.read(cookie);
    if (existing) return { nickname: existing.nickname, cookie: null };
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const nickname = `${names[randomInt(names.length)]}${randomInt(10, 100)}`;
    const now = Date.now();
    this.store.db.transaction((tx) => {
      tx.insert(players).values({ id, nickname, createdAt: now }).run();
      tx.insert(sessions).values({ tokenHash: hash(token), playerId: id, expiresAt: now + maxAge * 1000 }).run();
    });
    return {
      nickname,
      cookie: `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secure ? '; Secure' : ''}`,
    };
  }

  prune() {
    this.store.db.delete(sessions).where(lte(sessions.expiresAt, Date.now())).run();
  }
}
