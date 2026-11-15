'use client';

import { ArrowLeft, ArrowRight, UserCheck, UserMinus, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { errorText } from '@/lib/client-api';
import type { GameCommand } from '@/lib/protocol';
import { NicknameField } from '../forms';
import { Button, buttonVariants } from '../ui/button';
import { GameBoard } from './game-board';
import { Lobby } from './lobby';
import { useRoom } from './use-room';
import { useGameViewport } from './use-game-viewport';

function JoinRoom({ code, identity, busy, join }: {
  code: string; identity: string; busy: boolean; join: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState(identity);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    join(nickname);
  }
  return <section className="panel join-screen" aria-labelledby="join-title">
    <h1 id="join-title">加入房间</h1>
    <p className="muted">你的搭档邀请你加入 <strong className="code-label">{code}</strong>。</p>
    <form className="form-stack" method="post" onSubmit={submit}>
      <NicknameField value={nickname} change={setNickname} />
      <Button type="submit" disabled={busy}>加入游戏 <ArrowRight aria-hidden="true" size={16} /></Button>
    </form>
  </section>;
}

export function RoomScreen({ code }: { code: string }) {
  const { state, needsJoin, identity, error, connected, command, join, reload, presenceNotice } = useRoom(code);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function attempt(work: () => Promise<void>) {
    if (busy) return false;
    setBusy(true);
    setActionError('');
    try {
      await work();
      return true;
    } catch (failure) {
      setActionError(errorText(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const run = (payload: GameCommand) => attempt(() => command(payload));
  const game = state?.room.game;
  const playing = Boolean(game && game.phase !== 'FINISHED');
  useGameViewport(playing);
  const announcement = game?.pause ? '有玩家离开，游戏已暂停。60 秒内双方回到房间即可继续。'
    : game?.phase === 'FINISHED' ? (game.matched ? '心有灵犀，匹配成功。' : game.endedEarly ? '本局提前结束。' : '已用完本局回合。')
    : game?.phase === 'MATCH_REVIEW' ? '这两个词语可能相同，请确认。'
      : game?.phase === 'REVEALING' ? '本轮词语已揭晓。'
        : game?.phase === 'PLAYING' ? `第 ${game.number} 轮开始。` : '';

  return <main id="main" className={`shell inner-page room-page${playing ? ' room-page--playing' : ''}`}>
    <div className="page-bar room-page-bar">
      <Link href="/" className="back-link"><ArrowLeft aria-hidden="true" size={16} /> 首页</Link>
      <span className="code-label">{code}</span>
      {state && <span className={`network ${connected ? 'connected' : ''}`} role="status">
        {connected ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
        {connected ? '已连接' : '正在连接'}
      </span>}
      <div className="presence-notice" role="status" aria-label="搭档在线状态">
        {presenceNotice && <div className="presence-message" data-online={presenceNotice.online}>
          {presenceNotice.online ? <UserCheck size={17} aria-hidden="true" /> : <UserMinus size={17} aria-hidden="true" />}
          <span><bdi>{presenceNotice.name}</bdi> {presenceNotice.online ? '回来了' : '离开了房间'}</span>
        </div>}
      </div>
    </div>
    <p role="status" className="sr-only">{announcement}</p>
    {(error || actionError) && <div className="error-banner" role="alert">{error || actionError}</div>}
    {state
      ? state.room.game
        ? <GameBoard room={state.room} game={state.room.game} receivedAt={state.receivedAt} connected={connected} busy={busy} run={run} />
        : <Lobby room={state.room} connected={connected} busy={busy} run={run} />
      : needsJoin ? <JoinRoom code={code} identity={identity} busy={busy} join={(nickname) => void attempt(() => join(nickname))} />
      : error ? <div className="panel empty-state"><h1>暂时无法进入房间</h1><div className="result-actions">
        <Button variant="outline" onClick={reload}>重试</Button><Link href="/" className={buttonVariants()}>返回首页</Link>
      </div></div>
      : <div className="panel empty-state" role="status">正在加载房间…</div>}
  </main>;
}
