'use client';

import { ArrowRight, DoorOpen, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRequestId, errorText, guest, request } from '@/lib/client-api';
import { DEFAULT_SETTINGS } from '@/lib/protocol';
import { numericRoomCodePattern } from '@/lib/room-code';
import { NicknameField, readSettings, SettingsFields } from './forms';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function HomeActions() {
  const router = useRouter();
  const create = useRef<HTMLDialogElement>(null);
  const join = useRef<HTMLDialogElement>(null);
  const key = useRef<string>(undefined);
  const [nickname, setNickname] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void guest().then((session) => {
      if (active) setNickname((value) => value ?? session.nickname);
    }).catch(() => { /* Retry when the player takes an action. */ });
    return () => { active = false; };
  }, []);

  function open(ref: typeof create) {
    setError('');
    ref.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>, mode: 'create' | 'join') {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const code = String(fields.get('code') ?? '');
    const settings = mode === 'create' ? readSettings(form) : undefined;
    setBusy(true);
    setError('');
    try {
      await guest();
      if (mode === 'create') {
        key.current ??= createRequestId();
        const room = await request<{ code: string }>('/api/rooms', { requestId: key.current, nickname: nickname ?? '', settings });
        create.current?.close();
        key.current = undefined;
        router.push(`/room/${room.code}`);
      } else {
        await request(`/api/rooms/${encodeURIComponent(code)}/join`, { nickname: nickname ?? '' });
        join.current?.close();
        router.push(`/room/${code}`);
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="home-actions" id="play" aria-label="开始游戏">
      <Button onClick={() => open(create)}><Plus size={18} aria-hidden="true" />创建房间</Button>
      <Button variant="outline" onClick={() => open(join)}><DoorOpen size={18} aria-hidden="true" />加入房间</Button>
    </section>
    <dialog className="dialog" ref={create} aria-labelledby="create-title" onCancel={(e) => { if (busy) e.preventDefault(); }}>
      <form method="dialog" className="dialog-close"><Button type="submit" variant="ghost" size="icon" aria-label="关闭" disabled={busy}><X size={20} aria-hidden="true" /></Button></form>
      <h2 id="create-title">创建房间</h2>
      <form method="post" aria-labelledby="create-title" className="form-stack" onSubmit={(e) => void submit(e, 'create')}>
        <NicknameField value={nickname ?? ''} change={setNickname} />
        <SettingsFields settings={DEFAULT_SETTINGS} />
        <p className="error" role="alert">{error}</p>
        <Button type="submit" disabled={busy}>{busy ? '正在创建…' : '创建并进入房间'} <ArrowRight size={16} aria-hidden="true" /></Button>
      </form>
    </dialog>
    <dialog className="dialog" ref={join} aria-labelledby="join-title" onCancel={(e) => { if (busy) e.preventDefault(); }}>
      <form method="dialog" className="dialog-close"><Button type="submit" variant="ghost" size="icon" aria-label="关闭" disabled={busy}><X size={20} aria-hidden="true" /></Button></form>
      <h2 id="join-title">加入房间</h2>
      <form method="post" aria-labelledby="join-title" className="form-stack" onSubmit={(e) => void submit(e, 'join')}>
        <div className="field">
          <label htmlFor="join-code">房间码（4 位数字）</label>
          <Input id="join-code" name="code" type="text" inputMode="numeric" placeholder="例如 0836" className="code-input"
            pattern={numericRoomCodePattern} maxLength={4} required autoComplete="off" autoCapitalize="none"
            autoCorrect="off" spellCheck={false} enterKeyHint="next" />
        </div>
        <NicknameField value={nickname ?? ''} change={setNickname} />
        <p className="error" role="alert">{error}</p>
        <Button type="submit" disabled={busy}>{busy ? '正在加入…' : '进入房间'} <ArrowRight size={16} aria-hidden="true" /></Button>
      </form>
    </dialog>
  </>;
}
