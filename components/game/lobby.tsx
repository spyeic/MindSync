'use client';

import { Check, Clipboard, Crown, Link2, Play, Settings2, Users } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { GameCommand, PlayerView, RoomView } from '@/lib/protocol';
import { readSettings, SettingsFields } from '../forms';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function Players({ players, seat, submitted }: {
  players: RoomView['players']; seat: RoomView['seat']; submitted?: [boolean, boolean];
}) {
  function playerCard(player: PlayerView | null, index: number) {
    return <div className="player-card" key={index}>
      <span className={`player-avatar avatar-${index}`} aria-hidden="true">{index === 0 ? 'A' : 'B'}</span>
      <div className="player-text"><strong>{player?.name ?? '等待玩家加入'}{index === seat && <small>（你）</small>}</strong>
        <span><i className={`presence-dot ${player?.online ? 'online' : ''}`} />{player ? player.online ? '在线' : '离线' : '空席位'}
          {index === 0 && <><Crown aria-hidden="true" size={13} /> 房主</>}
        </span>
      </div>
      {submitted?.[index] && <Check className="submitted-check" size={17} aria-label="已提交" />}
    </div>;
  }
  return <div className="players-grid">{players.map(playerCard)}</div>;
}

export function RoomInvite({ room }: { room: RoomView }) {
  const [copy, setCopy] = useState('');
  const invite = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);

  async function copyText(input: HTMLInputElement | null, label: string) {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input.value);
      setCopy(`已复制${label}`);
    } catch {
      input.focus();
      input.select();
      setCopy(`请手动复制${label}`);
    }
  }

  return (
      <section className="panel share-panel" aria-labelledby="invite-title">
        <div className="section-line"><h2 id="invite-title">邀请朋友</h2><Link2 aria-hidden="true" size={18} className="muted" /></div>
        <div className="field"><label htmlFor="invite-code">房间码</label>
          <div className="share-field">
            <Input ref={code} id="invite-code" className="code-input" readOnly value={room.code} />
            <Button size="icon" variant="outline" aria-label="复制房间码" title="复制房间码" onClick={() => void copyText(code.current, '房间码')}><Clipboard size={16} aria-hidden="true" /></Button>
          </div>
        </div>
        <div className="field"><label htmlFor="invite-link">邀请链接</label>
          <div className="share-field">
            <Input ref={invite} id="invite-link" readOnly value={room.inviteUrl} />
            <Button size="icon" variant="outline" aria-label="复制邀请链接" title="复制邀请链接" onClick={() => void copyText(invite.current, '邀请链接')}><Clipboard size={16} aria-hidden="true" /></Button>
          </div>
        </div>
        <p className="copy-status" role="status">{copy}</p>
      </section>
  );
}

export function Lobby({ room, connected, busy, run }: {
  room: RoomView; connected: boolean; busy: boolean; run: (command: GameCommand) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const both = room.players.every(Boolean);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run({ action: 'settings', settings: readSettings(event.currentTarget) })) setEditing(false);
  }

  return <div className="lobby-grid">
    <section className="panel lobby-main" aria-labelledby="lobby-title">
      <span className="panel-icon"><Users aria-hidden="true" size={22} /></span>
      <h1 id="lobby-title">{both ? '准备开始' : '等一位搭档'}</h1>
      <p className="muted" role="status">{both ? '两位玩家已就位，由房主开启第一轮。' : '把房间码或邀请链接发给你的朋友。'}</p>
      <Players players={room.players} seat={room.seat} />
      <Button className="w-full" disabled={!both || !connected || busy || room.seat !== 0}
        onClick={() => void run({ action: 'start' })}>
        <Play aria-hidden="true" size={17} />{room.seat === 0 ? '开始游戏' : '等待房主开始'}
      </Button>
    </section>
    <div className="lobby-side">
      <RoomInvite room={room} />
      <section className="panel" aria-labelledby="settings-title">
        <div className="section-line"><h2 id="settings-title">对局设置</h2>{room.seat === 0 &&
          <Button size="icon" variant="ghost" aria-expanded={editing} aria-label="编辑对局设置" title="编辑对局设置" onClick={() => setEditing((value) => !value)}><Settings2 size={17} aria-hidden="true" /></Button>}
        </div>
        {editing
          ? <form className="form-stack" method="post" onSubmit={(event) => void save(event)}><SettingsFields settings={room.settings} />
            <Button type="submit" size="small" disabled={!connected || busy}>保存设置</Button></form>
          : <dl className="settings-summary"><div><dt>每轮时间</dt><dd>{room.settings.seconds} 秒</dd></div><div><dt>最大回合</dt><dd>{room.settings.maxRounds} 轮</dd></div></dl>}
      </section>
    </div>
  </div>;
}
