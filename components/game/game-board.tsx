'use client';

import { Check, Flag, HeartHandshake, Hourglass, RotateCcw, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { GameCommand, GameView, Pair, RoomView } from '@/lib/protocol';
import { duration } from '@/lib/utils';
import { Button, buttonVariants } from '../ui/button';
import { Input } from '../ui/input';
import { Players, RoomInvite } from './lobby';
import { RoundHistory } from './round-history';
import { Timer } from './timer';

type GameProps = {
  room: RoomView; game: GameView; receivedAt: number; connected: boolean; busy: boolean;
  run: (command: GameCommand) => Promise<boolean>;
};

function WordInput({ room, game, connected, busy, run }: GameProps) {
  const [word, setWord] = useState('');
  const id = useId();
  const submitted = game.submitted[room.seat];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted || !connected || busy || game.pause) return;
    await run({ action: 'submit', gameId: game.id, round: game.number, word });
  }
  return <form className="word-form" method="post" aria-labelledby={`${id}-label`} onSubmit={(e) => void submit(e)}>
    <label id={`${id}-label`} htmlFor={id}>你的词语</label>
    <div className="word-controls">
      <Input id={id} name="word" required maxLength={512} value={word} onChange={(event) => setWord(event.target.value)}
        disabled={submitted || !connected || Boolean(game.pause)} aria-describedby={`${id}-help`} placeholder="写下想到的第一个词…"
        autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" />
      <Button type="submit" disabled={submitted || !connected || busy || Boolean(game.pause)}>
        {submitted ? <Check size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        {submitted ? '已提交' : '提交词语'}
      </Button>
    </div>
    <p id={`${id}-help`} className="muted text-sm" role="status">
      {game.pause ? '游戏已暂停，等待双方回到房间。' : submitted ? '已提交，等待对方。' : game.submitted[1 - room.seat] ? '对方已提交。最多 20 个字符。' : '最多 20 个字符。双方提交后一起揭晓。'}
    </p>
  </form>;
}

function Result({ room, game, connected, busy, run }: GameProps) {
  const words = game.matched ? game.history.at(-1)?.words : undefined;
  return <section className={`panel game-result ${game.matched ? 'win' : ''}`} aria-labelledby="result-title">
    <span className="panel-icon">{game.matched ? <Sparkles size={24} aria-hidden="true" /> : <Flag size={24} aria-hidden="true" />}</span>
    <h1 id="result-title">{game.matched ? '心有灵犀！' : game.endedEarly ? '本局提前结束' : '这局结束了'}</h1>
    {words ? <p className="match-word">{words[0]}{words[0] !== words[1] && <> <span aria-hidden="true">·</span> {words[1]}</>}</p>
      : <p className="muted">本局未匹配。</p>}
    <p className="muted">{game.names[0]} <span aria-hidden="true">×</span> {game.names[1]} · {game.number} 轮 · {duration((game.finishedAt ?? game.startedAt) - game.startedAt)}</p>
    <Players players={room.players} seat={room.seat} />
    <div className="result-actions">
      {room.seat === 0 && <Button disabled={busy || !connected || !room.players.every(Boolean)} onClick={() => void run({ action: 'new-game', gameId: game.id })}>
        <RotateCcw size={16} aria-hidden="true" />新开一局
      </Button>}
      <Link className={buttonVariants({ variant: 'outline' })} href="/history">查看历史记录</Link>
      <Link className={buttonVariants({ variant: 'ghost' })} href="/">返回首页</Link>
    </div>
    {!room.players.every(Boolean) && <p className="muted">请重新邀请一位搭档后开局。</p>}
  </section>;
}

function RoundPrompt(props: GameProps) {
  const { room, game, receivedAt, connected, busy, run } = props;
  const latest = game.history.at(-1);
  if (game.phase === 'MATCH_REVIEW' && latest && game.transitionAt !== null) {
    const voted = game.review[room.seat] !== null;
    return <section className="panel prompt-panel" aria-labelledby="review-title">
      <div className="section-line"><h2 id="review-title">这两个词语可能相同</h2>
        {!game.pause && <Timer start={game.transitionAt - 15000} deadline={game.transitionAt} serverNow={room.serverNow} receivedAt={receivedAt} compact />}
      </div>
      <div className="word-pair prompt-words">{latest.words.map((word, index) =>
        <div key={index} className={`word-card word-seat-${index}`}>{word}</div>)}</div>
      <p className="muted" role="status">{voted ? '已认可，等待搭档确认。' : '双方都认可才算匹配成功。'}</p>
      <div className="result-actions">{[
        { accept: true, text: '认可' }, { accept: false, text: '不认可' },
      ].map(({ accept, text }) => <Button key={text} disabled={voted || busy || !connected || Boolean(game.pause)} variant={accept ? 'default' : 'outline'}
        onClick={() => void run({ action: 'review', gameId: game.id, round: game.number, accept })}>{text}</Button>)}</div>
    </section>;
  }
  if (game.phase === 'REVEALING') {
    return <section className="panel prompt-panel reveal-panel" aria-labelledby="reveal-title">
      <span className="panel-icon"><Sparkles aria-hidden="true" size={21} /></span>
      <h2 id="reveal-title">{latest?.result === 'timeout' ? '本轮时间到' : '本轮词语已揭晓'}</h2>
      <p className="muted">{game.pause ? '游戏已暂停，等待双方回到房间。' : game.number === room.settings.maxRounds ? '正在生成对局结果…' : '下一轮即将开始。'}</p>
    </section>;
  }
  return <section className="panel prompt-panel" aria-labelledby="prompt-title">
    <div className="section-line"><h2 id="prompt-title">{game.prompt ? '看到这两个词，你会想到什么？' : '自由联想'}</h2>
      <HeartHandshake className="muted shrink-0" size={20} aria-hidden="true" />
    </div>
    {game.prompt
      ? <div className="word-pair prompt-words">{game.prompt.map((word, index) => <div key={index} className={`word-card word-seat-${index}`}>{word}</div>)}</div>
      : <p className="muted">{game.number === 1 ? '第一轮，写下你想到的任意一个词。' : '还没有完整的词语对，继续自由联想。'}</p>}
    <WordInput key={`${game.id}:${game.number}`} {...props} />
  </section>;
}

function EndGame({ game, connected, busy, run }: GameProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const disabled = busy || !connected;
  return <>
    <Button variant="ghost" className="end-game-button" disabled={disabled} aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}>结束本局</Button>
    <dialog className="dialog end-game-dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onClose={(event) => {
        const choice = event.currentTarget.returnValue;
        event.currentTarget.returnValue = '';
        if (choice === 'end' && !disabled) void run({ action: 'end', gameId: game.id });
      }}>
      <h2 id={`${id}-title`}>结束本局？</h2>
      <p id={`${id}-description`} className="muted">确认后，双方会立即结算，并公开本轮已提交的词语。</p>
      <form method="dialog" className="result-actions">
        <Button type="submit" variant="outline" value="cancel" autoFocus>取消</Button>
        <Button type="submit" value="end" disabled={disabled}>确认结束</Button>
      </form>
    </dialog>
  </>;
}

function PlayerStatus({ room, game, receivedAt }: GameProps) {
  return <section className="panel round-header">
      <div className="section-line">
        <h1>第 {game.number} <small>/ {room.settings.maxRounds} 轮</small></h1>
        {game.pause
          ? <div className="pause-timer">
            <span className="muted text-sm" role="status">游戏已暂停</span>
            <Timer start={game.pause.startedAt} deadline={game.pause.deadline} serverNow={room.serverNow}
              receivedAt={receivedAt} progressLabel="等待玩家返回剩余时间" />
          </div>
          : game.phase === 'PLAYING'
          ? <Timer key={`${game.id}:${game.number}`} start={game.deadline - room.settings.seconds * 1000} deadline={game.deadline}
            serverNow={room.serverNow} receivedAt={receivedAt} />
          : <span className="muted phase-label"><Hourglass size={16} aria-hidden="true" />{game.phase === 'MATCH_REVIEW' ? '等待确认' : '揭晓中'}</span>}
      </div>
      <Players players={room.players} seat={room.seat} submitted={game.submitted} />
  </section>;
}

function ActiveGame(props: GameProps) {
  const { game } = props;
  const scrollArea = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const scrollRange = useRef<number>(undefined);
  const latest = game.history.at(-1)?.number;
  useEffect(() => {
    const area = scrollArea.current;
    if (!area || latest === undefined) return;
    const followLatest = () => {
      const limit = area.scrollHeight - area.clientHeight;
      scrollRange.current = limit;
      if (followingLatest.current) area.scrollTop = limit;
    };
    followLatest();
    const observer = new ResizeObserver(followLatest);
    observer.observe(area);
    for (const section of area.children) observer.observe(section);
    return () => observer.disconnect();
  }, [latest]);

  return <div className="game-stack">
    <div className="game-scroll" ref={scrollArea} role="region" aria-label="回合与联想轨迹" tabIndex={0}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        const limit = scrollHeight - clientHeight;
        // A change in layout can emit a scroll event before the resize observer runs.
        if (limit === scrollRange.current) followingLatest.current = limit - scrollTop <= 8;
      }}>
      <div className="game-sticky-header">
        <PlayerStatus {...props} />
        <div className="result-actions game-actions">
          <EndGame {...props} />
        </div>
      </div>
      <RoundHistory history={game.history} names={game.names} />
    </div>
    <RoundPrompt {...props} />
  </div>;
}

export function GameBoard(props: GameProps) {
  const { room, game } = props;
  const names: Pair<string> = game.names;
  if (game.phase === 'FINISHED') {
    return <div className="game-finished"><Result {...props} /><RoomInvite room={room} /><RoundHistory history={game.history} names={names} /></div>;
  }
  return <ActiveGame key={game.id} {...props} />;
}
