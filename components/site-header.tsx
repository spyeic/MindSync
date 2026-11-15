'use client';

import { BookOpen, History, Moon, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { Brand } from './branding';
import { Button } from './ui/button';

export function SiteHeader() {
  const path = usePathname();
  const help = useRef<HTMLDialogElement>(null);
  function toggleTheme() {
    function applyTheme() {
      const root = document.documentElement;
      const next = getComputedStyle(root).colorScheme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('mindsync-theme', next); } catch { /* Theme still applies to this page. */ }
    }

    if (typeof document.startViewTransition !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme();
      return;
    }
    void document.startViewTransition(applyTheme).ready.catch(() => {
      // A subsequent toggle can skip this animation while the theme update still runs.
    });
  }
  return <header className="site-header">
    <div className="shell header-inner">
      <Brand />
      <nav aria-label="主导航" className="header-nav">
        <Button variant="ghost" className="nav-item" onClick={() => help.current?.showModal()}>
          <BookOpen aria-hidden="true" size={16} /> <span>游戏玩法</span>
        </Button>
        <Link className="nav-item nav-link" href="/history" aria-current={path.startsWith('/history') ? 'page' : undefined}>
          <History aria-hidden="true" size={16} /> <span>历史记录</span>
        </Link>
        <span className="nav-divider" aria-hidden="true" />
        <Button variant="outline" size="icon" aria-label="切换深浅主题" title="切换深浅主题"
          onClick={toggleTheme}>
          <Moon className="theme-moon" aria-hidden="true" size={17} />
          <Sun className="theme-sun" aria-hidden="true" size={17} />
        </Button>
      </nav>
    </div>
    <dialog className="dialog" ref={help} aria-labelledby="rules-title">
      <form method="dialog" className="dialog-close"><Button type="submit" variant="ghost" size="icon" aria-label="关闭"><X size={20} aria-hidden="true" /></Button></form>
      <h2 id="rules-title">游戏玩法</h2>
      <ol className="rules-list">
        <li><strong>邀请搭档</strong><span>创建房间，把邀请链接或房间码发给一位朋友。</span></li>
        <li><strong>各自联想</strong><span>第一轮自由联想。每人独立提交一个词，双方提交后一起揭晓。</span></li>
        <li><strong>逐渐靠近</strong><span>根据最近一组完整词语继续联想，直到想到同一个词。超时的一轮也计入回合数。</span></li>
        <li><strong>心有灵犀</strong><span>英文大小写和简繁体会统一比较。疑似错别字由双方确认。</span></li>
      </ol>
      <form method="dialog"><Button type="submit" autoFocus className="w-full">知道了</Button></form>
    </dialog>
  </header>;
}
