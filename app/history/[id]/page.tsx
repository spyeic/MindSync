import { notFound } from 'next/navigation';
import { HistoryDetailScreen } from '@/components/history-screen';

export const metadata = { title: '对局详情', robots: { index: false, follow: false } };

export default async function HistoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) notFound();
  return <HistoryDetailScreen key={id} id={id} />;
}
