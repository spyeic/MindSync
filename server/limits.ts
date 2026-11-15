import { AppError } from './errors.ts';

export class RateLimits {
  private readonly buckets = new Map<string, { count: number; until: number }>();

  hit(key: string, max: number, windowMs = 60_000) {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (current && current.until > now) {
      if (current.count >= max) throw new AppError(429, 'RATE_LIMIT', '操作太频繁，请稍后再试。');
      current.count++;
      return;
    }
    if (this.buckets.size >= 20_000) {
      this.prune();
      if (this.buckets.size >= 20_000) throw new AppError(429, 'RATE_LIMIT', '服务繁忙，请稍后再试。');
    }
    this.buckets.set(key, { count: 1, until: now + windowMs });
  }

  prune() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.until <= now) this.buckets.delete(key);
  }
}
