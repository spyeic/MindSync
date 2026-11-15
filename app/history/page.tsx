import { HistoryScreen } from '@/components/history-screen';

export const metadata = { title: '历史记录', robots: { index: false, follow: false } };

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string; order?: string }> }) {
  const params = await searchParams;
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1));
  const order = params.order === 'oldest' ? 'oldest' : 'newest';
  return <HistoryScreen page={page} order={order} />;
}
