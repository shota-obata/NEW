// Growth OS Mobile — Support（担当スタッフ ／ 共有された記録）
//
// 担当外は1件も返らない。絞り込みはサーバ（RLS）がやるので、
// ここで staff_id を条件に入れていない。
// 記録を開くと、開いた事実が本人に見える（就業規則 第5条第1項）。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Spacer, type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { assignedStaff, sharedRecords, markViewed, myViewed, attention, needsAction,
         type Staff, type Attention } from '../lib/support';
import { storeSettings, myJourney, setCurrentPosition, checkpoints,
         type StoreSettings, type Journey, type CP } from '../lib/core';
import { consultations, type Consultation } from '../lib/support';
import { listImages, imageUrl, viewers, type Record_, type Img } from '../lib/staff';
import { replyToRecord } from '../lib/core';

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

export function SupportHome(p: {
  name: string | null; onOpen: (id: string) => void; onSettings: () => void;
  onStaff: (id: string) => void; onList: () => void;
  nav?: NavSlots;
}) {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [recs, setRecs] = useState<(Record_ & { staff_id: string })[] | null>(null);

  const [seenIds, setSeenIds] = useState<string[] | null>(null);
  const [att, setAtt] = useState<Attention[] | null>(null);
  const [st, setSt] = useState<StoreSettings | null>(null);

  useEffect(() => {
    assignedStaff().then(setStaff);
    sharedRecords().then(setRecs);
    myViewed().then(setSeenIds);
    attention().then(setAtt);
    storeSettings().then(setSt);
  }, []);

  const hot     = (att ?? []).filter(needsAction);
  const waiting = (att ?? []).filter((a) => a.stalled);

  // 自分がまだ開いていないもの。古い順に片づける形にする。
  // 既読の一覧が届くまでは数えない — 届く前に数えると全部が未読に見えて、
  // カードが出てから消える
  const unread = (recs === null || seenIds === null ? [] : recs)
    .filter((x) => !seenIds!.includes(x.id))
    .slice().sort((a, b) => (a.shared_at ?? '').localeCompare(b.shared_at ?? ''));

  const nameOf = (id: string) => staff?.find((s) => s.id === id)?.display_name ?? '—';

  return (
    <Screen {...p.nav} bar={<Bar title="Support" right={p.name ?? undefined} />}
      footer={<Button variant="ghost" onClick={p.onSettings}>設定</Button>}>

      {/* 未読カード。ここでいう未読は「共有された記録」であって、
          通達（inbox_items）ではない。通達の未読は受信ピルの丸だけで示す。 */}
      {unread.length > 0 && (
        <><Spacer h={18} />
        <Card tone="teal">
          <Kicker tone="teal">共有された記録 · 未読 {unread.length} 件</Kicker>
          <div style={{ marginTop: 9, ...t.small, color: c.tealDeep, lineHeight: 1.85 }}>
            {unread.map((x) => nameOf(x.staff_id)).filter((v, i, a) => a.indexOf(v) === i).join('・')}
            {' '}から届いています。
            <b style={{ fontWeight: 660 }}>開くと、開いた事実が本人に見えます。</b>
          </div>
          <Spacer h={12} />
          <Button onClick={() => p.onOpen(unread[0].id)}>いちばん古いものから開く</Button>
        </Card></>
      )}

      <H>{recs === null ? ' ' : recs.length === 0 ? '共有された記録は、まだありません。' : '共有された記録'}</H>

      {recs === null ? <P>読み込んでいます…</P> : recs.length === 0 ? (
        <P>
          担当のスタッフが記録を共有すると、ここに出ます。
          <b style={{ fontWeight: 660, color: c.text }}>開くと、開いた事実が本人に見えます。</b>
        </P>
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
                <div style={{ marginTop: 6, fontSize: 12, color: c.weaker }}>
                  {nameOf(x.staff_id)}
                  {x.salon_shared && ' · サロンにも出しています'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 判断が待っています — 1段目が通って、2段目が止まっているもの */}
      {waiting.length > 0 && (
        <>
          <Spacer />
          <Kicker>判断が待っています</Kicker>
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {waiting.map((a) => (
              <Card key={a.staff.id} tone="warm">
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>
                    {a.staff.display_name} · {a.stalled}
                  </b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: c.warmText }}>
                    1段目 通過
                  </span>
                </div>
                <div style={{ marginTop: 13, display: 'grid', gap: 8 }}>
                  <Button variant="outline" onClick={() => p.onStaff(a.staff.id)}>
                    2段目の判断へ
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* 担当スタッフ — 要対応のみ・最大3件。件数バッジは付けない（数で急かさない）*/}
      <Spacer />
      <Kicker>いま見るところ</Kicker>
      <div style={{ marginTop: 12 }}>
        {att === null ? <P>…</P> : att.length === 0 ? (
          <Card tone="flat">
            <div style={{ ...t.small, color: c.weak }}>
              まだ担当がありません。担当の割り当ては運営者と双方の同意で決まります。
            </div>
          </Card>
        ) : hot.length === 0 ? (
          <Card tone="flat">
            <div style={{ ...t.small, color: c.weak }}>
              いま手を入れるところはありません。
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 9 }}>
            {hot.slice(0, 3).map((a) => (
              <button key={a.staff.id} onClick={() => p.onStaff(a.staff.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         padding: '15px 17px', borderRadius: r.card, background: c.card,
                         border: `1.5px solid ${c.teal}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>{a.staff.display_name}</b>
                  <span style={{ font: t.mono, color: c.label }}>{a.staff.person_code}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: c.weaker }}>
                  {[a.unread > 0 && '未読の記録',
                    a.unreplied > 0 && '未返答の相談',
                    a.stalled && `${a.stalled} の判断`]
                    .filter(Boolean).join('・')}
                </div>
              </button>
            ))}
            {hot.length > 3 && (
              <button onClick={p.onList}
                style={{ width: '100%', minHeight: 42, cursor: 'pointer', font: 'inherit',
                         fontSize: 12.5, fontWeight: 640, color: c.weak,
                         background: 'transparent', border: `1.5px dashed ${c.dash}`,
                         borderRadius: r.input }}>
                他 {hot.length - 3}名
              </button>
            )}
          </div>
        )}
      </div>

      {/* 相談の見え方（店舗設定の要約）*/}
      <Spacer h={14} />
      <Card tone="flat">
        <Kicker>相談の見え方</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.9 }}>
          あなたには<b style={{ fontWeight: 660, color: c.text }}>担当分の本文まで</b>見えます（固定）。
          <br />Management には{
            st?.consultation_visibility === 'full' ? '本文まで渡ります。'
            : st?.consultation_visibility === 'none' ? '件数も渡りません。'
            : '傾向だけが渡ります（本文は渡りません）。'}
        </div>
      </Card>

      <Spacer h={14} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          担当していないスタッフの記録は、ここにも検索にも出ません。
          他店舗に入っても同じです（担当関係がないと1件も返りません）。
        </div>
      </Card>
      <Spacer h={8} />
    </Screen>
  );
}

// ============================================================
// 共有された記録（Support から見る）
// ============================================================

export function SharedRecord(p: { id: string; onBack: () => void }) {
  const [rec, setRec] = useState<Record_ | null>(null);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<{ at: string; name: string }[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // 開いた事実を先に残す。読んでから記録するのでは、
      // 途中で閉じたときに「見たのに残らない」が生まれる
      await markViewed(p.id);
      const { data } = await import('../lib/api').then((m) =>
        m.sb.from('practice_records').select('*').eq('id', p.id).maybeSingle());
      setRec(data as Record_);
      setImgs(await listImages(p.id));
      setSeen(await viewers(p.id));
    })();
  }, [p.id]);

  useEffect(() => {
    imgs.forEach((i) => {
      if (urls[i.id]) return;
      imageUrl(i.storage_path).then((u) => u && setUrls((s) => ({ ...s, [i.id]: u })));
    });
  }, [imgs]);

  if (!rec) return (
    <Screen bar={<Bar title="共有された記録" />}><Spacer h={30} /><P>読み込んでいます…</P></Screen>
  );

  const F: [keyof Record_, string][] = [
    ['question', '今回の問い'], ['fact', '起きたこと（事実）'],
    ['misjudgement', 'ズレた判断'], ['reflection', '反省'],
    ['next_gain', '次回への経験値の貯め方'],
  ];

  return (
    <Screen bar={<Bar title="共有された記録" right={md(rec.recorded_on)} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{rec.title}</H>

      {imgs.length > 0 && (
        <>
          <Spacer h={18} />
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {imgs.map((i) => (
              <div key={i.id} style={{ width: 74, height: 74, flex: '0 0 auto',
                       borderRadius: r.thumb, border: `1px solid ${c.line}`,
                       background: c.flat, overflow: 'hidden' }}>
                {urls[i.id] && <img src={urls[i.id]} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
            ))}
          </div>
        </>
      )}

      <Spacer h={20} />
      <div style={{ display: 'grid', gap: 18 }}>
        {F.map(([k, label]) => {
          const v = rec[k] as string | null;
          const warm = k === 'misjudgement' || k === 'reflection';
          return (
            <div key={k}>
              <div style={t.field}>{label}</div>
              <div style={{ marginTop: 7, padding: '13px 15px', borderRadius: r.input,
                            background: warm ? c.warmBg : c.card,
                            border: `1px solid ${warm ? c.warmLine : c.cardLine}`,
                            fontSize: 13, lineHeight: 1.8,
                            color: v ? (warm ? c.warmDeep : c.text) : c.label }}>
                {v || '（書かれていません）'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 返答。1記録につき1つ。往復が続くなら相談（consultations）へ移る（U）*/}
      <Spacer h={22} />
      {rec.support_reply ? (
        <Card tone="teal">
          <Kicker tone="teal">返答しました</Kicker>
          <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.85, color: c.tealDeep }}>
            {rec.support_reply}
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: c.weaker }}>
            {rec.replied_at?.slice(5, 16).replace('T', ' ')} · 本人の受信ボックスにも届いています
          </div>
        </Card>
      ) : (
        <div>
          <div style={t.field}>返答</div>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5}
            placeholder="答えではなく、次の問いを返してください。"
            style={{ width: '100%', marginTop: 7, padding: '13px 15px', borderRadius: r.input,
                     border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                     fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                     resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ marginTop: 11 }}>
            <Button disabled={busy || !reply.trim()} onClick={async () => {
              setBusy(true);
              const ok = await replyToRecord(p.id, reply.trim());
              setBusy(false);
              if (ok) setRec({ ...rec, support_reply: reply.trim(),
                               replied_at: new Date().toISOString() });
            }}>返答する</Button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
            返答までの日数は、平均レスポンスに数えます（起点は共有された時刻）。
          </p>
        </div>
      )}

      {/* 開いた事実は本人にも見える。ここで自分の名前が並ぶのが正しい */}
      <Spacer h={22} />
      <Card tone="flat">
        <Kicker>この記録を見た人</Kicker>
        <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
          {seen.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                                  gap: 10, fontSize: 12.5 }}>
              <span>{v.name}</span>
              <span style={{ color: c.weaker }}>{v.at.slice(5, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
          あなたが開いたことは、本人に見えています（就業規則 第5条第1項）。
        </p>
      </Card>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// スタッフ（一覧 → 詳細）
//
// 一覧は担当全員。1名でも飛ばさない — タブの意味が人数で変わると、
// 次に2名になったとき使い方を学び直すことになる。
// ============================================================

export function StaffList(p: {
  onOpen: (id: string) => void; nav?: NavSlots;
}) {
  const [att, setAtt] = useState<Attention[] | null>(null);
  useEffect(() => { attention().then(setAtt); }, []);

  return (
    <Screen {...p.nav} bar={<Bar title="スタッフ" />}>
      <H>{att === null ? ' ' : '担当しているスタッフ'}</H>

      <Spacer h={16} />
      {att === null ? <P>読み込んでいます…</P> : att.length === 0 ? (
        <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
          まだ担当がありません。担当の割り当ては運営者と双方の同意で決まります。
        </div></Card>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 9 }}>
            {att.map((a) => (
              <button key={a.staff.id} onClick={() => p.onOpen(a.staff.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         padding: '15px 17px', borderRadius: r.card, background: c.card,
                         border: needsAction(a) ? `1.5px solid ${c.teal}`
                                                : `1px solid ${c.cardLine}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>{a.staff.display_name}</b>
                  <span style={{ font: t.mono, color: c.label }}>{a.staff.person_code}</span>
                </div>
                {a.scope === 'limited' && (
                  <div style={{ marginTop: 7 }}>
                    <span style={{ padding: '4px 9px', borderRadius: r.pill, fontSize: 10,
                                   fontWeight: 700, color: c.warmText, background: c.warmBg,
                                   border: `1px solid ${c.warmLine}` }}>
                      応援 · 範囲つき
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {att.length === 1 && (
            <>
              <Spacer h={12} />
              <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
                担当は1名です。
              </div></Card>
            </>
          )}
        </>
      )}
      <Spacer />
    </Screen>
  );
}

// ============================================================
// スタッフ詳細
//
// Growth OSから の中立ボックスは、優先順に見て当てはまった最初の1つだけ。
// 複数並べると「この人は問題が多い」という読み方になる（第3便 Z-2）。
// ============================================================

export function StaffDetail(p: {
  staffId: string; onBack: () => void; onOpenRecord: (id: string) => void;
  onNotice: () => void; onNewCp: () => void; onNextQuestion: (cpId: string) => void;
  nav?: NavSlots;
}) {
  const [att, setAtt] = useState<Attention | null>(null);
  const [recs, setRecs] = useState<(Record_ & { staff_id: string })[]>([]);
  const [cons, setCons] = useState<Consultation[]>([]);
  const [j, setJ] = useState<Journey | null>(null);
  const [pos, setPos] = useState('');
  const [cps, setCps] = useState<(CP & { reached_at: string | null })[]>([]);

  useEffect(() => {
    myJourney(p.staffId).then(async (x) => {
      setJ(x); setPos(x?.current_position ?? '');
      if (x) setCps(await checkpoints(x.id) as (CP & { reached_at: string | null })[]);
    });
    attention().then((xs) => setAtt(xs.find((x) => x.staff.id === p.staffId) ?? null));
    sharedRecords().then((xs) => setRecs(xs.filter((x) => x.staff_id === p.staffId)));
    consultations().then((xs) => setCons(xs.filter((x) => x.staff_id === p.staffId)));
  }, [p.staffId]);

  // 優先順。当てはまった最初の1つだけを出す
  const thirty = Date.now() - 30 * 86400000;
  const recent = recs.filter((x) => x.shared_at && Date.parse(x.shared_at) > thirty);
  const unreplied = cons.filter((x) => !x.replied_at);

  const view =
    recent.length === 0 && recs.length >= 0 && att
      ? { head: '30日、記録が来ていません。',
          body: '書けない理由の方が先にあります。声をかけるより、何が起きているかを聞いてください。' }
    : unreplied.length >= 3
      ? { head: '返していない相談が、たまっています。',
          body: `${unreplied.length}件、返答が止まっています。` }
    : att?.stalled
      ? { head: '判断が、あなたの側で止まっています。',
          body: `${att.stalled} の2段目が止まっています。` }
      : null;

  return (
    <Screen {...p.nav} bar={<Bar title={att?.staff.display_name ?? 'スタッフ'}
      right={att?.staff.person_code} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{view ? view.head : 'いま、急ぐものはありません。'}</H>

      {/* 状態の指摘。指摘が無いときは箱を残さない（探させることになる）*/}
      {view && (
        <>
          <Spacer h={16} />
          <Card tone="flat">
            <Kicker>GROWTH OSから</Kicker>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.85, color: c.weak }}>
              {view.body}
            </div>
          </Card>
        </>
      )}

      {/* 現在地。書けるのは担当のSupportだけ（第5便 AL）。
          どこへ行きたいかは本人が書く（Vision は Map の最上部）。
          現在地は自分では見えにくいので、他人が書く */}
      <Spacer />
      <Kicker>いまの現在地</Kicker>
      <div style={{ marginTop: 12 }}>
        <textarea value={pos} onChange={(e) => setPos(e.target.value)}
          onBlur={() => { if (j && pos.trim() !== (j.current_position ?? '')) {
            setCurrentPosition(j.id, pos.trim()); } }}
          placeholder="基準点を位置で覚えている段階"
          style={{ width: '100%', minHeight: 68, padding: '13px 15px', borderRadius: r.input,
                   border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                   fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                   resize: 'vertical', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 9, ...t.small, color: c.weaker }}>
          本人の Capability Map に、そのまま出ます。
          {j?.vision
            ? <> 本人が書いた向かう先は「{j.vision}」です。</>
            : <> 本人はまだ向かう先を書いていません。</>}
        </div>
      </div>

      {/* 相談。担当分は本文まで */}
      <Spacer />
      <Kicker>相談</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {cons.length === 0 ? (
          <Card tone="flat"><div style={{ ...t.small, color: c.weaker }}>
            まだ相談はありません。
          </div></Card>
        ) : cons.slice(0, 3).map((x) => (
          <Card key={x.id} tone={x.replied_at ? 'plain' : 'teal'}>
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <b style={{ fontSize: 13.5, fontWeight: 660 }}>{x.title}</b>
              <span style={{ fontSize: 11, color: c.label }}>
                {x.replied_at ? '返答済み' : '未返答'}
              </span>
            </div>
            <p style={{ margin: '9px 0 0', ...t.small, color: c.weak }}>{x.body}</p>
          </Card>
        ))}
      </div>

      {/* この人の記録 */}
      <Spacer />
      <Kicker>共有された記録</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {recs.length === 0 ? (
          <Card tone="flat"><div style={{ ...t.small, color: c.weaker }}>
            まだありません。
          </div></Card>
        ) : recs.map((x) => (
          <button key={x.id} onClick={() => p.onOpenRecord(x.id)}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                     padding: '14px 16px', borderRadius: r.card, background: c.card,
                     border: `1px solid ${c.cardLine}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <b style={{ fontSize: 13.5, fontWeight: 640, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</b>
              <span style={{ fontSize: 11, color: c.label, flex: '0 0 auto' }}>
                {md(x.recorded_on)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Checkpoint を置く／次の問いを渡す。CP は Support が置く */}
      <Spacer />
      <Kicker>Checkpoint</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {cps.length === 0 ? (
          <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
            まだ Checkpoint がありません。本人だけでは進みません。
          </div></Card>
        ) : cps.map((x) => (
          <Card key={x.id} tone={x.reached_at ? 'teal' : 'plain'}>
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <b style={{ fontSize: 13.5, fontWeight: 660 }}>{x.code} · {x.title}</b>
              <span style={{ fontSize: 11, color: x.reached_at ? c.tealText : c.label }}>
                {x.reached_at ? '到達' : x.os_passed_at ? '判断待ち' : '進行中'}
              </span>
            </div>
            {x.reached_at && (
              <div style={{ marginTop: 11 }}>
                <Button variant="outline" onClick={() => p.onNextQuestion(x.id)}>
                  次の問いを渡す
                </Button>
              </div>
            )}
          </Card>
        ))}
        <Button variant="outline" onClick={p.onNewCp}>Checkpoint を置く</Button>
      </div>

      {/* 設計に返す */}
      <Spacer />
      <Button variant="outline" onClick={p.onNotice}>Managementへ通達する</Button>
      <Spacer />
    </Screen>
  );
}
