import { AudioLines } from 'lucide-react';
import Link from 'next/link';

export function Mark({ className }: { className?: string }) {
  return <span className={`brand-mark ${className ?? ''}`}><AudioLines aria-hidden="true" size={21} strokeWidth={2.6} /></span>;
}

export function Brand() {
  return <Link href="/" className="brand" aria-label="MindSync — 心有灵犀，首页">
    <Mark /><span>MindSync<span className="brand-dot">.</span></span>
  </Link>;
}
