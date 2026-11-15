import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return <main id="main" className="shell inner-page">
    <section className="panel empty-state">
      <h1>找不到这个页面</h1>
      <p className="muted my-3">请检查链接或房间码。</p>
      <Link href="/" className={buttonVariants()}>返回首页</Link>
    </section>
  </main>;
}
