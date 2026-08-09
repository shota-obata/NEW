// Growth OS Mobile — パーソナルスペース（区分01）
//
// Support にも Management にも、存在も件数も返らない。
// 「表」は本人が相手を選んで開示できる。「裏」は開示の導線を作らない。
//
// 「裏」に開示先を作れないことは、DB のトリガが守っている。
// 画面に開示ボタンを置かないだけでは、APIを直接叩けば作れてしまう。
//
// 共有端末では「裏」を消さない。消すと、無かったことになる。
// 出さないことを、出さない場所に書く。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Spacer, type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import {
  notes, addNote, saveNote, removeNote, shareNote, unshareNote, noteShares,
  isSharedDevice, type Note,
} from '../lib/core';

export function Personal(p: { onBack: () => void; nav?: NavSlots }) {
  const [side, setSide] = useState<'surface' | 'private'>('surface');
  const [rows, setRows] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const shared = isSharedDevice();
  const hidden = side === 'private' && shared;

  const [limit, setLimit] = useState(20);

  const load = () => { notes(side).then(setRows); };
  useEffect(() => { setRows(null); setLimit(20); load(); }, [side]);

  return (
    <Screen {...p.nav} bar={<Bar title="パーソナルスペース" right="あなただけ" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>パーソナルスペース</H>
      <P>
        あなただけの場所です。
        <b style={{ fontWeight: 660, color: c.text }}>ここに書いたものは、あなたが開示しない限り誰にも出ません。</b>
      </P>

      {/* 表 / 裏 */}
      <div style={{ marginTop: 20, display: 'flex', gap: 5, padding: 4,
                    borderRadius: r.input, background: c.segBg }}>
        {([['surface', '表'], ['private', '裏']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSide(k)}
            style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 12.5, fontWeight: 700,
                     background: side === k ? c.card : 'transparent',
                     color: side === k ? c.text : c.weaker }}>{label}</button>
        ))}
      </div>

      <div style={{ marginTop: 10, ...t.small, color: c.weaker, lineHeight: 1.75 }}>
        {side === 'surface'
          ? '開示する相手を、1件ずつ選べます。'
          : '開示する導線がありません。ここに書いたものは、誰にも渡せません。'}
      </div>

      {/* 共有端末では「裏」を出さない。消さずに、出さないと書く */}
      {hidden ? (
        <>
          <Spacer h={18} />
          <Card tone="warm">
            <div style={{ ...t.small, color: c.warmDeep, lineHeight: 1.9 }}>
              <b style={{ fontWeight: 660 }}>この端末では「裏」を開きません。</b>
              {' '}共有の端末に登録されています。あなた個人の端末から開いてください。
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* 書く */}
          <Spacer h={18} />
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            placeholder={side === 'surface'
              ? 'あとで見せるかもしれないこと'
              : '誰にも見せないこと'}
            style={{ width: '100%', padding: '13px 15px', borderRadius: r.input,
                     border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                     fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                     resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ marginTop: 10 }}>
            <Button disabled={!draft.trim() || busy} onClick={async () => {
              setBusy(true);
              if (await addNote(side, draft.trim())) setDraft('');
              setBusy(false); load();
            }}>書き留める</Button>
          </div>

          {/* 読む */}
          <Spacer />
          {rows === null ? <P>読み込んでいます…</P> : rows.length === 0 ? (
            <Card tone="flat"><div style={{ ...t.small, color: c.weaker }}>
              まだ何もありません。
            </div></Card>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 9 }}>
                {rows.slice(0, limit).map((n) => (
                  <NoteCard key={n.id} note={n} canShare={side === 'surface'} onDone={load} />
                ))}
              </div>
              {rows.length > limit && (
                <div style={{ marginTop: 11 }}>
                  <Button variant="ghost" onClick={() => setLimit((v) => v + 20)}>
                    もっと読む
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Spacer />
      <Card tone="flat">
        <Kicker>ここが守られている理由</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.9 }}>
          「裏」に開示先を作れないことは、この画面ではなく
          <b style={{ fontWeight: 660, color: c.text }}>データベースが守っています。</b>
          {' '}画面にボタンを置かないだけでは、別の入口から作れてしまうからです。
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}

function NoteCard(q: { note: Note; canShare: boolean; onDone: () => void }) {
  const [body, setBody] = useState(q.note.body);
  const [shown, setShown] = useState(false);

  useEffect(() => { if (q.canShare) noteShares(q.note.id).then((n) => setShown(n > 0)); },
            [q.note.id, q.canShare]);

  return (
    <Card tone={shown ? 'teal' : 'plain'}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
        onBlur={() => body.trim() !== q.note.body && saveNote(q.note.id, body.trim())}
        rows={3}
        style={{ width: '100%', padding: 0, border: 0, background: 'transparent',
                 font: 'inherit', fontSize: 13, lineHeight: 1.85, color: c.text,
                 outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />

      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 11, color: c.label }}>
          {q.note.updated_at.slice(5, 16).replace('T', ' ')}
        </span>
        {q.canShare && !shown && (
          <button onClick={async () => { if (await shareNote(q.note.id)) setShown(true); }}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 11.5, color: c.tealText }}>
            担当のSupportに見せる
          </button>
        )}
        {shown && (
          <button onClick={async () => { if (await unshareNote(q.note.id)) setShown(false); }}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 11.5, color: c.tealText }}>
            見せています · やめる
          </button>
        )}
        <button onClick={async () => { await removeNote(q.note.id); q.onDone(); }}
          style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                   font: 'inherit', fontSize: 11.5, color: c.weaker }}>消す</button>
      </div>
    </Card>
  );
}
