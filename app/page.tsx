import { HomeActions } from '@/components/home-actions';

export default function Home() {
  return <main id="main" className="shell home">
    <h1 className="home-title">
      <span lang="en">MindSync<span className="brand-dot" aria-hidden="true">.</span></span>
      <span className="home-title-zh">心有灵犀</span>
    </h1>
    <p className="home-slogan" lang="en">Two minds. One word.</p>
    <HomeActions />
  </main>;
}
