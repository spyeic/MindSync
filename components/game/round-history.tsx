'use client';

import { Check, Hourglass, Link2 } from 'lucide-react';
import type { Pair, RevealedRound } from '@/lib/protocol';

export function RoundHistory({ history, names }: { history: RevealedRound[]; names: Pair<string> }) {
  const latest = history.at(-1)?.number;
  return <section className="panel timeline-panel" aria-labelledby="round-history">
    <div className="section-line"><h2 id="round-history">联想轨迹</h2><span className="muted text-sm">{history.length} 轮已揭晓</span></div>
    <div className="timeline-players"><span><i className="seat-dot seat-a" />{names[0]}</span><span><i className="seat-dot seat-b" />{names[1]}</span></div>
    {history.length === 0
      ? <div className="timeline-empty"><Link2 aria-hidden="true" size={22} /><p>第一组联想将在这里揭晓</p></div>
      : <ol className="timeline-list" role="list" aria-label="各轮词语">
        {history.map(({ number, words, result }) => <li key={number} className={`timeline-row ${number === latest ? 'latest' : ''}`} data-result={result}>
          <div className="round-tag"><span>第 {number} 轮</span>{result === 'matched' && <Check aria-label="匹配成功" size={14} />}</div>
          <div className="word-pair">
            {words.map((word, index) => <div className={`word-card word-seat-${index}`} key={index} data-missing={word === null}>
              <span className="sr-only">{names[index]}：</span>{word ?? <><Hourglass aria-hidden="true" size={15} />未提交</>}
            </div>)}
          </div>
        </li>)}
      </ol>}
  </section>;
}
