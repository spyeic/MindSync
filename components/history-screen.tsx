'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, History, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorText, guest, request } from '@/lib/client-api';
import type { GameDetail, HistoryPage } from '@/lib/protocol';
import { duration } from '@/lib/utils';
import { RoundHistory } from './game/round-history';
import { Button, buttonVariants } from './ui/button';

function useHistory<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ path: string; attempt: number; data?: T; error?: string }>();
  useEffect(() => {
    let active = true;
    void guest().then(() => request<T>(path)).then((reply) => {
      if (active) setResult({ path, attempt, data: reply });
    }).catch((failure: unknown) => {
      if (active) setResult({ path, attempt, error: errorText(failure) });
    });
    return () => { active = false; };
  }, [path, attempt]);
  const loading = result?.path !== path || result.attempt !== attempt;
  function retry() { setAttempt((count) => count + 1); }
  return { data: result?.data, error: loading ? '' : result.error ?? '', loading, retry };
}

function DateLabel({ at }: { at: number }) {
  const date = new Date(at);
  return <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}</time>;
}

function HistoryLoading({ error, retry }: { error: string; retry: () => void }) {
  return <div className="panel empty-state">
    {error ? <><p role="alert" className="error mb-3">{error}</p><Button variant="outline" onClick={retry}>重试</Button></>
      : <p role="status">正在读取对局…</p>}
  </div>;
}

function HistoryPagination({ page, hasMore, href }: { page: number; hasMore: boolean; href: (page: number) => string }) {
  if (page === 1 && !hasMore) return null;
  return <nav className="pagination" aria-label="历史分页">
    {page > 1 && <Link href={href(page - 1)} className={buttonVariants({ variant: 'outline' })}>上一页</Link>}
    <span className="muted text-sm">第 {page} 页</span>
    {hasMore && <Link href={href(page + 1)} className={buttonVariants({ variant: 'outline' })}>下一页</Link>}
  </nav>;
}

export function HistoryScreen({ page, order }: { page: number; order: HistoryPage['order'] }) {
  const router = useRouter();
  const { data, error, loading, retry } = useHistory<HistoryPage>(`/api/history?page=${page}&order=${order}`);
  const newestFirst = order === 'newest';
  const sortLabel = newestFirst ? '倒序' : '正序';
  const sortDescription = newestFirst ? '从最新到最早' : '从最早到最新';
  const SortIcon = newestFirst ? ArrowDown : ArrowUp;
  return <main id="main" className="shell inner-page">
    <div className="page-bar"><Link href="/" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> 首页</Link></div>
    <div className="section-line history-heading">
      <h1>历史记录</h1>
      <Button variant="outline" aria-label={`${sortLabel}，${sortDescription}，切换排序`}
        onClick={() => router.push(`/history?order=${newestFirst ? 'oldest' : 'newest'}`, { scroll: false })}>
        <SortIcon size={16} aria-hidden="true" />{sortLabel}
      </Button>
    </div>
    <p className="sr-only" role="status">{data && !loading ? `对局按时间${sortDescription}排列` : ''}</p>
    {!data ? <HistoryLoading error={error} retry={retry} />
      : <>{data.items.length === 0
        ? <div className="panel empty-state"><History size={24} className="mx-auto mb-3 muted" aria-hidden="true" />
          <h2>{page === 1 ? '还没有已结算的对局' : '没有更多对局'}</h2>
          {page === 1 && <Link href="/#play" className={buttonVariants({ className: 'mt-4' })}>开始游戏</Link>}
        </div>
        : <ol className="history-list" role="list" aria-label="已结算的对局" aria-busy={loading}>{data.items.map((game) => <li key={game.id}>
          <Link className="panel history-item" href={`/history/${game.id}`}>
            <div><strong>和 <bdi>{game.names[1 - game.seat]}</bdi> 的对局</strong>
              <span className="history-status" data-matched={game.matched}>{game.endedEarly ? '提前结束' : game.matched ? '匹配成功' : '未匹配'}</span>
              <span className="history-meta"><DateLabel at={game.finishedAt} /><span>{game.roundsUsed} 轮</span>
                {game.matchWords && <span>{[...new Set(game.matchWords)].join(' · ')}</span>}</span>
            </div><ArrowRight size={18} aria-hidden="true" className="muted" />
          </Link>
        </li>)}</ol>}
        <HistoryPagination page={data.page} hasMore={data.hasMore}
          href={(target) => `/history?page=${target}&order=${data.order}`} />
      </>}
  </main>;
}

export function HistoryDetailScreen({ id }: { id: string }) {
  const { data, error, retry } = useHistory<GameDetail>(`/api/history/${id}`);
  return <main id="main" className="shell inner-page">
    <div className="page-bar"><Link href="/history" className="back-link">
      <ArrowLeft size={16} aria-hidden="true" /> 返回历史记录
    </Link></div>
    {data ? <div className="history-detail">
      <section className="panel game-result" aria-labelledby="detail-title">
        {data.matched && <span className="panel-icon"><Sparkles size={22} aria-hidden="true" /></span>}
        <h1 id="detail-title">{data.matched ? '心有灵犀！' : data.endedEarly ? '本局提前结束' : '对局详情'}</h1>
        {data.matchWords ? <p className="match-word">{[...new Set(data.matchWords)].join(' · ')}</p> : <p className="muted">本局未匹配。</p>}
        <p className="muted">{data.names[0]} × {data.names[1]} · {data.roundsUsed} / {data.maxRounds} 轮 · {duration(data.finishedAt - data.startedAt)}</p>
        <p className="muted text-sm"><DateLabel at={data.finishedAt} /></p>
      </section>
      <RoundHistory history={data.history} names={data.names} />
    </div> : <HistoryLoading error={error} retry={retry} />}
  </main>;
}
