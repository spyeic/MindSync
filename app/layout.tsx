import type { Metadata, Viewport } from 'next';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MindSync — 心有灵犀', template: '%s · MindSync' },
  description: '双人在线词语联想游戏。两颗心，一拍即合。',
  icons: { icon: '/mindsync.svg' },
};
export const viewport: Viewport = { colorScheme: 'light dark', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning>
    <head>
      {/* Apply the saved choice before the first paint. The local script contains only the theme initializer. */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="/theme.js" />
    </head>
    <body>
      <a href="#main" className="skip-link">跳到主要内容</a>
      <SiteHeader />
      {children}
      <footer className="site-footer"><div className="shell footer-inner">
        <span>MindSync <span aria-hidden="true">·</span> 心有灵犀</span><span lang="en">Two minds. One word.</span>
      </div></footer>
    </body>
  </html>;
}
