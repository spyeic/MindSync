'use client';

import { Dices } from 'lucide-react';
import { useId } from 'react';
import type { Settings } from '@/lib/protocol';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function NicknameField({ value, change }: { value: string; change: (name: string) => void }) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>你的昵称</label>
    <div className="input-with-action">
      <Input id={id} name="nickname" value={value} onChange={(e) => change(e.target.value)}
        maxLength={128} autoComplete="nickname" placeholder="留空使用随机昵称" />
      <Button variant="ghost" size="icon" aria-label="随机昵称" title="随机昵称" onClick={() => {
        const names = ['橘子', '云朵', '松果', '海盐', '小鹿', '流星', '月亮', '纸船'];
        change(`${names[Math.floor(Math.random() * names.length)]}${10 + Math.floor(Math.random() * 90)}`);
      }}><Dices size={17} aria-hidden="true" /></Button>
    </div>
  </div>;
}

export function SettingsFields({ settings }: { settings: Settings }) {
  const id = useId();
  return <fieldset className="settings-fields">
    <legend>对局设置</legend>
    <div className="settings-grid">
      <div className="field">
        <label htmlFor={`${id}-seconds`}>每轮时间（秒）</label>
        <Input id={`${id}-seconds`} name="seconds" type="number" inputMode="numeric" min={10} max={120} required defaultValue={settings.seconds} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-rounds`}>最大回合</label>
        <Input id={`${id}-rounds`} name="maxRounds" type="number" inputMode="numeric" min={1} max={50} required defaultValue={settings.maxRounds} />
      </div>
    </div>
  </fieldset>;
}

export function readSettings(form: HTMLFormElement): Settings {
  const data = new FormData(form);
  return { seconds: Number(data.get('seconds')), maxRounds: Number(data.get('maxRounds')) };
}
