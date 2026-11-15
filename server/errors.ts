import { ZodError } from 'zod';
import type { Failure } from '../lib/protocol.ts';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function describeError(error: unknown): { status: number; reply: Failure } {
  if (error instanceof AppError) {
    return { status: error.status, reply: { ok: false, code: error.code, error: error.message } };
  }
  if (error instanceof ZodError) {
    return { status: 400, reply: { ok: false, code: 'INVALID_INPUT', error: error.issues[0]?.message ?? '请检查输入。' } };
  }
  console.error('MindSync unexpected error:', error);
  return { status: 500, reply: { ok: false, code: 'INTERNAL', error: '服务暂时不可用，请稍后重试。' } };
}
