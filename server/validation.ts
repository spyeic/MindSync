import { z } from 'zod';
import { roomCodePattern } from '../lib/room-code.ts';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const visibleText = (max: number, label: string) => z.string()
  .max(512, `${label}太长了。`)
  .refine((value) => !/[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(value), `${label}包含不支持的控制字符。`)
  .refine((value) => value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, '').length > 0, `请输入${label}。`)
  .refine((value) => Array.from(segmenter.segment(value.trim())).length <= max, `${label}最多 ${max} 个字符。`);

export const wordSchema = visibleText(20, '词语');
export const nicknameSchema = z.union([z.literal(''), visibleText(16, '昵称').transform((value) => value.trim())]);
export const settingsSchema = z.strictObject({
  seconds: z.number().int().min(10).max(120),
  maxRounds: z.number().int().min(1).max(50),
});
export const roomCodeSchema = z.string().max(32).trim()
  .regex(roomCodePattern, '请输入四位数字房间码。');
export const createSchema = z.strictObject({ requestId: z.uuid(), nickname: nicknameSchema, settings: settingsSchema });
export const joinSchema = z.strictObject({ nickname: nicknameSchema });
export const watchSchema = z.strictObject({ code: roomCodeSchema });
const roundTarget = { gameId: z.uuid(), round: z.number().int().min(1).max(50) };

export const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('settings'), settings: settingsSchema }),
  z.strictObject({ action: z.literal('start') }),
  z.strictObject({ action: z.literal('submit'), ...roundTarget, word: wordSchema }),
  z.strictObject({ action: z.literal('review'), ...roundTarget, accept: z.boolean() }),
  z.strictObject({ action: z.literal('end'), gameId: z.uuid() }),
  z.strictObject({ action: z.literal('new-game'), gameId: z.uuid() }),
]);
