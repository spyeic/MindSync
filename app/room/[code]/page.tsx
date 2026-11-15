import { notFound } from 'next/navigation';
import { RoomScreen } from '@/components/game/room-screen';
import { roomCodePattern } from '@/lib/room-code';

export const metadata = { title: '双人房间', robots: { index: false, follow: false } };

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  if (!roomCodePattern.test(normalized)) notFound();
  return <RoomScreen key={normalized} code={normalized} />;
}
