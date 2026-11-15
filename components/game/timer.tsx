'use client';

import { Timer as TimerIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Timer({ start, deadline, serverNow, receivedAt, compact = false, progressLabel = '本轮剩余时间' }:
{ start: number; deadline: number; serverNow: number; receivedAt: number; compact?: boolean; progressLabel?: string }) {
  const total = deadline - start;
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - serverNow));
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    function tick() {
      setRemaining(Math.max(0, deadline - serverNow - (performance.now() - receivedAt)));
    }
    function visibility() {
      clearInterval(timer);
      if (document.hidden) return;
      tick();
      timer = setInterval(tick, 125);
    }
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      clearInterval(timer);
    };
  }, [deadline, serverNow, receivedAt]);
  const seconds = Math.ceil(remaining / 1000);
  return <div className={`round-timer ${seconds <= 5 ? 'timer-urgent' : ''} ${compact ? 'timer-compact' : ''}`}>
    <span className="timer-label" role="timer" aria-live="off" aria-label={`剩余 ${seconds} 秒`}><TimerIcon aria-hidden="true" size={17} />{seconds} 秒</span>
    {!compact && <progress aria-label={progressLabel} max={total} value={Math.min(total, remaining)} />}
  </div>;
}
