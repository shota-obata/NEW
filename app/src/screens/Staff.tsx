// Growth OS Mobile — Staff の芯（Home ／ Practice記録 ／ 共有）
//
// 空は空として出す。サーバが返さなかったものを、それらしく埋めない。
// 初日は本当に0件なので、0件のときに何をすればいいかだけを示す。

import { useEffect, useRef, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer , type NavSlots } from '../ui/kit';
import { c, t, r, serif } from '../ui/tokens';
import { myHolds } from '../lib/core';
import { ConsultSheet } from './Core';
import {
  myRecords, myStore, storeState, createRecord, saveRecord, getRecord,
  listImages, uploadImage, imageUrl, removeImage, share, unshare, viewers,
  type Record_, type Img,
} from '../lib/staff';

const today = () => new Date().toISOString().slice(0, 10);
const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

// ============================================================
// Home
// ============================================================

export function Home(p: { name: string | null; onOpen: (id: string) => void; onNew: () => void;
                          onSettings: () => void; onHolds: () => void;
                          nav?: NavSlots }) {
  const [recs, setRecs] = useState<Record_[] | null>(null);
  const [st, setSt] = useState<{ open: boolean; closedDay: boolean } | null>(null);
  const [hd, setHd] = useState<{ id: string; reason: string; add_what: string }[]>([]);

  useEffect(() => {
    myRecords(5).then(setRecs);
    myHolds().then(setHd);
    myStore().then((s) => s && storeState(s.id).then(setSt));
  }, []);

  const shared = recs?.filter((x) => x.shared_at) ?? [];
  const drafts = recs?.filter((x) => !x.shared_at) ?? [];

  return (
    <Screen {...p.nav} bar={<Bar title="Home" right={p.name ? `${p.name} · ${md(today())}` : undefined} />}
      footer={<Button onClick={p.onNew}>記録を書く</Button>}>

      {/* 定休日・時間外は、義務ではないことを先に伝える */}
      {st && st.closedDay && (
        <><Spacer h={18} /><Warn>
          <b style={{ fontWeight: 700 }}>今日は定休日です。</b>
          記録は書けますが、会社が求めるものではありません。必要ペースにも数えません。
        </Warn></>
      )}
      {st && !st.open && !st.closedDay && (
        <><Spacer h={18} /><Card tone="flat">
          <div style={{ ...t.small, color: c.weak }}>
            <b style={{ fontWeight: 660, color: c.text }}>いまは営業時間外です。</b>
            {' '}記録は書けますが、義務ではありません（就業規則 第2条第3項）。
          </div>
        </Card></>
      )}

      <H>{recs === null ? ' ' : recs.length === 0 ? '最初の1件を書くところから。' : '今日の一手'}</H>

      {recs === null ? (
        <P>読み込んでいます…</P>
      ) : recs.length === 0 ? (
        <>
          <P>
            まだ記録がありません。うまくいった日ではなく、
            <b style={{ fontWeight: 660, color: c.text }}>判断がズレた日</b>を1件書くと、
            そこから始まります。
          </P>
          <Spacer />
          <Card tone="teal">
            <Kicker tone="teal">書くこと</Kicker>
            <div style={{ marginTop: 10, ...t.small, color: c.tealDeep, lineHeight: 1.9 }}>
              今回の問い ／ 起きたこと（事実）／ ズレた判断 ／ 反省 ／ 次回への貯め方。
              <br />全部を埋めなくて構いません。**題名だけでも保存できます。**
            </div>
          </Card>
        </>
      ) : (
        <>
          <Spacer h={14} />
          <div style={{ display: 'grid', gap: 9 }}>
            {recs.map((x) => (
              <button key={x.id} onClick={() => p.onOpen(x.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         padding: '15px 17px', borderRadius: r.card, background: c.card,
                         border: `1px solid ${c.cardLine}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>{x.title}</b>
                  <span style={{ fontSize: 11, color: c.label, flex: '0 0 auto' }}>
                    {md(x.recorded_on)}
                  </span>
                </div>
                <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Tag on={!!x.shared_at}>{x.shared_at ? '共有済み' : '下書き'}</Tag>
                  {x.salon_shared && <Tag>サロンに出した</Tag>}
                  {!x.counts_to_pace && <Tag warn>定休日</Tag>}
                  {x.images_pending && <Tag warn>画像が未保存</Tag>}
                </div>
              </button>
            ))}
          </div>
          <Spacer />
          <Card tone="flat">
            <div style={{ ...t.small, color: c.weak }}>
              下書き {drafts.length} 件 ／ 共有済み {shared.length} 件。
              共有すると担当のSupportに届き、Capability Map にも反映されます。
            </div>
          </Card>
        </>
      )}

      {/* 保留中。0件でも消さない。
          消すと、保留になった瞬間に新しい箱が生えることになり、
          「落ちた」ように見える。預けてある状態が常にそこにある形にする。 */}
      <Spacer />
      <button onClick={p.onHolds}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                 padding: '15px 17px', borderRadius: r.card,
                 background: c.flat, border: `1px solid ${c.cardLine}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline',
                      justifyContent: 'space-between', gap: 10 }}>
          <b style={{ fontSize: 13.5, fontWeight: 640 }}>保留中</b>
          <span style={{ fontSize: 11, color: c.label }}>
            {hd.length === 0 ? 'いまはありません' : `${hd.length} 件`}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
          {hd.length === 0
            ? '「まだ早い」と預かったものは、ここに置かれます。'
            : hd[0].add_what}
        </div>
      </button>

      {/* 一度読めば済むもの・たまにしか使わないものは設定へ。
          日常の画面に置くと、それ自体が判断になる（10c と同じ考え方） */}
      <Spacer />
      <Button variant="ghost" onClick={p.onSettings}>設定</Button>
      <Spacer h={8} />
    </Screen>
  );
}

const Tag = (q: { children: React.ReactNode; on?: boolean; warn?: boolean }) => (
  <span style={{ padding: '4px 9px', borderRadius: r.pill, fontSize: 10.5, fontWeight: 700,
                 background: q.warn ? c.warmBg : q.on ? c.tealBg : c.flat,
                 color: q.warn ? c.warmText : q.on ? c.tealText : c.weaker,
                 border: `1px solid ${q.warn ? c.warmLine : q.on ? c.tealLine : c.line}` }}>
    {q.children}
  </span>
);

// ============================================================
// Practice記録
// ============================================================

const FIELDS: [keyof Record_, string, string][] = [
  ['question', '今回の問い', '骨格が違っても、基準点をそのまま使えるか'],
  ['fact', '起きたこと（事実）', '2回目のチェックで違和感。そのまま切り進めた。'],
  ['misjudgement', 'ズレた判断', '基準点を「位置」で覚えていた'],
  ['reflection', '反省', '違和感に気づいた時点で止めるべきだった'],
  ['next_gain', '次回への経験値の貯め方', '骨格タイプ別に、角度で合わせる手順を1つ作る'],
];

export function Practice(p: { id: string | null; storeId: string | null; onBack: () => void ; nav?: NavSlots}) {
  const [rec, setRec] = useState<Record_ | null>(null);
  const [title, setTitle] = useState('');
  const [imgs, setImgs] = useState<Img[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [viewed, setViewed] = useState<{ at: string; name: string }[]>([]);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!p.id) return;
    getRecord(p.id).then((x) => { setRec(x); setTitle(x?.title ?? ''); });
    listImages(p.id).then(setImgs);
    viewers(p.id).then(setViewed);
  }, [p.id]);

  useEffect(() => {
    imgs.forEach((i) => {
      if (urls[i.id]) return;
      imageUrl(i.storage_path).then((u) => u && setUrls((s) => ({ ...s, [i.id]: u })));
    });
  }, [imgs]);

  // 新規作成
  if (!p.id) return (
    <NewRecord storeId={p.storeId} onBack={p.onBack} />
  );

  if (!rec) return (
    <Screen {...p.nav} bar={<Bar title="Practice記録" />}><Spacer h={30} /><P>読み込んでいます…</P></Screen>
  );

  const patch = async (k: keyof Record_, v: string) => {
    setRec({ ...rec, [k]: v } as Record_);
    await saveRecord(rec.id, { [k]: v } as Partial<Record_>);
  };

  return (
    <Screen {...p.nav} bar={<Bar title="Practice記録" right={rec.shared_at ? '共有済み' : '下書き'} />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          {rec.shared_at ? (
            <Button variant="outline" onClick={async () => {
              await unshare(rec.id); setRec({ ...rec, shared_at: null, salon_shared: false });
            }}>共有をやめる</Button>
          ) : (
            <>
              <Button disabled={busy} onClick={async () => {
                setBusy(true); await share(rec.id, false); setBusy(false);
                setRec({ ...rec, shared_at: new Date().toISOString() });
              }}>担当のSupportに共有する</Button>
              <Button variant="ghost" disabled={busy} onClick={async () => {
                setBusy(true); await share(rec.id, true); setBusy(false);
                setRec({ ...rec, shared_at: new Date().toISOString(), salon_shared: true });
              }}>サロンにも出す（氏名なしで共有）</Button>
            </>
          )}
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>

      <div style={{ marginTop: 18, fontSize: 11, color: c.weaker }}>
        {rec.recorded_on}
        {!rec.counts_to_pace && ' · 定休日（必要ペースに数えません）'}
        {rec.off_hours && rec.counts_to_pace && ' · 時間外'}
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== rec.title && patch('title', title.trim())}
        style={{ width: '100%', marginTop: 10, border: 0, background: 'transparent',
                 fontFamily: serif, fontWeight: 400, fontSize: 23, lineHeight: 1.45,
                 letterSpacing: '-.02em', color: c.text, outline: 'none' }} />

      {rec.images_pending && (
        <><Spacer h={14} /><Warn>
          <b style={{ fontWeight: 700 }}>画像が保存できていません。</b>
          文章は保存されています。容量が空いたあと、もう一度追加してください。
        </Warn></>
      )}

      <Spacer h={20} />
      <Strip kind="before" recordId={rec.id} imgs={imgs} urls={urls}
             onChange={() => listImages(rec.id).then(setImgs)} onMsg={setMsg} />
      <Spacer h={14} />
      <Strip kind="after" recordId={rec.id} imgs={imgs} urls={urls}
             onChange={() => listImages(rec.id).then(setImgs)} onMsg={setMsg} />

      {msg && <><Spacer h={12} /><Warn>{msg}</Warn></>}

      <Spacer h={22} />
      <div style={{ display: 'grid', gap: 16 }}>
        {FIELDS.map(([k, label, ph]) => {
          const warm = k === 'misjudgement' || k === 'reflection';
          return (
            <label key={k} style={{ display: 'grid', gap: 7 }}>
              <span style={t.field}>{label}</span>
              <textarea
                defaultValue={(rec[k] as string) ?? ''}
                placeholder={ph}
                onBlur={(e) => patch(k, e.target.value)}
                style={{ width: '100%', minHeight: 74, padding: '13px 15px', borderRadius: r.input,
                         background: warm ? c.warmBg : c.input,
                         border: `1px solid ${warm ? c.warmLine : c.line}`,
                         font: 'inherit', fontSize: 13, lineHeight: 1.8,
                         color: warm ? c.warmDeep : c.text, resize: 'vertical', outline: 'none' }} />
            </label>
          );
        })}
      </div>

      {/* Support の返答。ここが本体で、受信ボックスには本文を複製しない（U-2）*/}
      {rec.support_reply && (
        <>
          <Spacer h={16} />
          <Card tone="teal">
            <Kicker tone="teal">SUPPORTから · 返答</Kicker>
            <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.85, color: c.tealDeep }}>
              {rec.support_reply}
            </p>
            <div style={{ marginTop: 10, fontSize: 11, color: c.weaker }}>
              {rec.replied_at?.slice(5, 16).replace('T', ' ')}
            </div>
          </Card>
        </>
      )}

      {/* 相談の入口2。相談は独立した投稿ではなく、この1件に紐づく往復 */}
      {rec.shared_at && (
        <>
          <Spacer h={14} />
          <Button variant="ghost" onClick={() => setAsk(true)}>この件で相談する</Button>
        </>
      )}

      {/* 誰がいつ見たか。就業規則 第5条第1項で本人に開示する */}
      <Spacer h={22} />
      <Card tone="flat">
        <Kicker>この記録を見た人</Kicker>
        {viewed.length === 0 ? (
          <div style={{ marginTop: 10, ...t.small, color: c.weaker }}>
            まだ誰も見ていません。
          </div>
        ) : (
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {viewed.map((v, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                                    fontSize: 12.5 }}>
                <span>{v.name}</span>
                <span style={{ color: c.weaker }}>{v.at.slice(5, 16).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Spacer />

      {ask && <ConsultSheet subject={rec.title}
        onClose={() => setAsk(false)} onSent={() => setAsk(false)} />}
    </Screen>
  );
}

// 新規作成（題名だけで保存できる）
function NewRecord(p: { storeId: string | null; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Screen bar={<Bar title="記録を書く" right={today()} />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          <Button disabled={!title.trim() || busy || !p.storeId} onClick={async () => {
            if (!p.storeId) return;
            setBusy(true);
            const rec = await createRecord({ title: title.trim(), recorded_on: today(), store_id: p.storeId });
            setBusy(false);
            if (rec) p.onBack();
          }}>{busy ? '作っています…' : 'この題名で始める'}</Button>
          <Button variant="ghost" onClick={p.onBack}>やめる</Button>
        </div>
      }>
      <H>何について書きますか。</H>
      <P>題名だけで保存できます。中身は後から足せます。</P>
      <Spacer h={20} />
      <textarea value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="骨格違いで、基準点をそのまま使えるか"
        style={{ width: '100%', minHeight: 92, padding: '14px 16px', borderRadius: r.input,
                 background: c.input, border: `1.5px solid ${c.teal}`, font: 'inherit',
                 fontSize: 16, lineHeight: 1.7, color: c.text, resize: 'vertical', outline: 'none' }} />
    </Screen>
  );
}

// 画像ストリップ（kindごと最大5枚）
function Strip(q: {
  kind: 'before' | 'after'; recordId: string; imgs: Img[];
  urls: Record<string, string>; onChange: () => void; onMsg: (m: string | null) => void;
}) {
  const mine = q.imgs.filter((i) => i.kind === q.kind);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={t.field}>{q.kind}（最大5枚）</span>
        <span style={{ fontSize: 11, color: c.label }}>{mine.length} / 5</span>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {mine.map((i) => (
          <button key={i.id} onClick={async () => { await removeImage(i); q.onChange(); }}
            title="タップで削除"
            style={{ width: 74, height: 74, flex: '0 0 auto', borderRadius: r.thumb, padding: 0,
                     border: `1px solid ${c.line}`, background: c.flat, overflow: 'hidden',
                     cursor: 'pointer' }}>
            {q.urls[i.id]
              ? <img src={q.urls[i.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ font: t.mono, color: c.weaker }}>…</span>}
          </button>
        ))}
        {mine.length < 5 && (
          <button onClick={() => ref.current?.click()} disabled={busy}
            style={{ width: 74, height: 74, flex: '0 0 auto', borderRadius: r.thumb,
                     border: `1.5px dashed ${c.dash}`, background: 'transparent',
                     color: c.weaker, fontSize: 22, cursor: 'pointer' }}>
            {busy ? '…' : '＋'}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true); q.onMsg(null);
          const res = await uploadImage(q.recordId, q.kind, f);
          setBusy(false);
          if (res.ok) q.onChange();
          else q.onMsg(
            res.reason === 'limit' ? `${q.kind} は最大5枚です。`
            : res.reason === 'quota' ? '保存容量がいっぱいです。文章は保存されています。運営者に連絡してください。'
            : '画像を保存できませんでした。通信を確かめて、もう一度お試しください。');
          q.onChange();
        }} />
    </div>
  );
}
