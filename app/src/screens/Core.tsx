// Growth OS Mobile — 相談 ／ Journey ／ Capability Map ／ 受信ボックス ／ 通達
//
// 中心は「評価」ではなく「判断のループ」。
// 到達は2段（Growth OS の条件 → Support の実務判断）が揃ったときだけ。
// 片方だけは保留で、落ちたのではなく預けてある状態として本人にも見せる。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer , type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import {
  consults, ask, replyTo, myJourney, supportDecide, hold, axes, params, values, markRead,
  softDelete, restore, postNotice,
  inboxRows, canReply, askAbout, storeSettings, currentCP, cpConditions, holdCards,
  type Consult, type Journey, type CP, type Axis, type Param, type Val,
  type InboxRow, type StoreSettings, type CondRow,
} from '../lib/core';

const day = (s: string) => s.slice(5, 10).replace('-', '/');

// ============================================================
// 相談と返答（区分02）
// ============================================================

export function Consults(p: { canReply: boolean; onBack: () => void ; nav?: NavSlots}) {
  const [list, setList] = useState<Consult[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => consults().then(setList);
  useEffect(() => { load(); }, []);

  return (
    <Screen {...p.nav} bar={<Bar title="相談" right={p.canReply ? '担当分' : 'plain'} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      {!p.canReply && (
        <>
          <H>答えではなく、問いが返ります。</H>
          <P>
            うまくいかないことを書いてください。手順ではなく、
            <b style={{ fontWeight: 660, color: c.text }}>確かめ方が返ってきます。</b>
          </P>
          <Spacer />
          <div style={{ display: 'grid', gap: 12 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="カットの基準点が決まらない"
              style={{ width: '100%', minHeight: 50, padding: '0 15px', borderRadius: r.input,
                       border: `1.5px solid ${c.teal}`, background: c.input, font: 'inherit',
                       fontSize: 16, fontWeight: 620, outline: 'none' }} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="指名が続く先輩と自分の差が、どこにあるのか分かりません。"
              style={{ width: '100%', minHeight: 90, padding: '13px 15px', borderRadius: r.input,
                       border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                       fontSize: 13, lineHeight: 1.8, resize: 'vertical', outline: 'none' }} />
            <Button disabled={!title.trim() || !body.trim() || busy} onClick={async () => {
              setBusy(true); await ask({ title: title.trim(), body: body.trim() });
              setBusy(false); setTitle(''); setBody(''); load();
            }}>担当のSupportに相談する</Button>
          </div>
          <Spacer />
        </>
      )}

      <Kicker>{p.canReply ? '担当分の相談' : 'これまでの相談'}</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {list === null ? <P>読み込んでいます…</P> : list.length === 0 ? (
          <Card tone="flat"><div style={{ ...t.small, color: c.weaker }}>
            まだありません。{p.canReply && '担当していないスタッフの相談は、ここにも出ません。'}
          </div></Card>
        ) : list.map((x) => (
          <Card key={x.id}>
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <b style={{ fontSize: 14, fontWeight: 660 }}>{x.title}</b>
              <span style={{ fontSize: 11, color: c.label }}>{day(x.created_at)}</span>
            </div>
            <p style={{ margin: '9px 0 0', ...t.small, color: c.weak }}>{x.body}</p>

            {x.reply_body ? (
              <div style={{ marginTop: 12, padding: '13px 15px', borderRadius: r.input,
                            background: c.tealBg, border: `1px solid ${c.tealLine}` }}>
                <div style={{ ...t.field, color: c.tealText }}>返答</div>
                <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.8, color: c.tealDeep }}>
                  {x.reply_body}
                </p>
              </div>
            ) : p.canReply ? (
              openId === x.id ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                    placeholder="どこで違和感に気づいた？　その時どう判断した？"
                    style={{ width: '100%', minHeight: 80, padding: '13px 15px',
                             borderRadius: r.input, border: `1.5px solid ${c.teal}`,
                             background: c.input, font: 'inherit', fontSize: 13,
                             lineHeight: 1.8, resize: 'vertical', outline: 'none' }} />
                  <Warn>
                    答えではなく<b style={{ fontWeight: 700 }}>問いを1つ返します</b>。
                    手順を渡すと、判断の機会が消えます。
                  </Warn>
                  <Button disabled={!draft.trim() || busy} onClick={async () => {
                    setBusy(true); await replyTo(x.id, draft.trim());
                    setBusy(false); setDraft(''); setOpenId(null); load();
                  }}>返答する</Button>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <Button variant="outline" onClick={() => { setOpenId(x.id); setDraft(''); }}>
                    返答する
                  </Button>
                </div>
              )
            ) : (
              <div style={{ marginTop: 10, fontSize: 11.5, color: c.weaker }}>返答待ちです。</div>
            )}
          </Card>
        ))}
      </div>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// Journey と Checkpoint（2段の到達判断）
// ============================================================

export function JourneyScreen(p: {
  canDecide: boolean; staffId?: string; supportName?: string | null;
  onBack: () => void; onHolds?: () => void; nav?: NavSlots;
}) {
  const [j, setJ] = useState<Journey | null>(null);
  const [cp, setCp] = useState<CP | null>(null);
  const [all, setAll] = useState<CP[]>([]);
  const [conds, setConds] = useState<CondRow[]>([]);
  const [past, setPast] = useState(false);      // これまでの到達シート
  const [ask, setAsk] = useState(false);        // 声をかける（相談シート）

  const sup = p.supportName ?? '担当のSupport';

  const load = async () => {
    const x = await myJourney(p.staffId);
    setJ(x);
    const { cp: cur, all: list } = await currentCP(p.staffId);
    setCp(cur); setAll(list);
    setConds(cur ? await cpConditions(cur) : []);
  };
  useEffect(() => { load(); }, [p.staffId]);

  const reached = all.filter((x) => (x as unknown as { reached_at: string | null }).reached_at);
  const title = cp?.code ?? 'CP';

  // ---- Journey がまだ無い / 未到達CPが1つも無い ----
  if (j && !cp) return (
    <Screen {...p.nav} bar={<Bar title={title} right={p.staffId ? '担当スタッフ' : undefined} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
      {all.length === 0 ? (
        <>
          <H>向かう先を、まだ決めていません。</H>
          <Spacer h={18} />
          <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
            Checkpoint は{sup}と一緒に置きます。次の面談で決まります。
          </div></Card>
          <Spacer h={14} />
          {/* 塗りボタンは置かない — 本人だけでは進まないため */}
          <Button variant="ghost" onClick={() => setAsk(true)}>{sup}に声をかける</Button>
        </>
      ) : (
        <>
          <H>いま、次の Checkpoint がありません。</H>
          <Spacer h={18} />
          <Card tone="teal">
            <Kicker tone="teal">到達 {reached.length}件</Kicker>
            <div style={{ marginTop: 11, display: 'grid', gap: 7 }}>
              {reached.map((x) => (
                <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between',
                                         gap: 10, fontSize: 12.5, color: c.tealDeep }}>
                  <span>{x.code} · {x.title}</span>
                  <span style={{ color: c.weaker }}>
                    {day((x as unknown as { reached_at: string }).reached_at)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Spacer h={14} />
          <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
            次を置くのは{sup}です。急ぎません。
          </div></Card>
        </>
      )}
      <Spacer />
      {ask && <ConsultSheet subject="Checkpoint の相談"
        onClose={() => setAsk(false)} onSent={() => setAsk(false)} />}
    </Screen>
  );

  if (!j || !cp) return (
    <Screen {...p.nav} bar={<Bar title="CP" />}><Spacer h={30} /><P>読み込んでいます…</P></Screen>
  );

  const os = !!cp.os_passed_at, decided = !!cp.support_decided_at;
  const left = conds.filter((x) => !x.met).reduce((n, x) => n + (x.need - x.got), 0);

  return (
    <Screen {...p.nav} bar={<Bar title={title} right={p.staffId ? '担当スタッフ' : undefined} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{cp.title}</H>

      {/* ---- 1段目 · GROWTH OS ---- */}
      <Spacer h={18} />
      <Card tone={os ? 'teal' : 'flat'}>
        <div style={{ display: 'flex', alignItems: 'baseline',
                      justifyContent: 'space-between', gap: 10 }}>
          <Kicker tone={os ? 'teal' : undefined}>
            {os ? 'GROWTH OS' : 'GROWTH OS · 集まっているもの'}
          </Kicker>
          {os && <span style={{ fontSize: 11, fontWeight: 700, color: c.tealText }}>通過</span>}
        </div>

        <div style={{ marginTop: 13, display: 'grid', gap: 10 }}>
          {conds.map((x) => (
            <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                                     gap: 10, alignItems: 'center' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid',
                             placeItems: 'center', fontSize: 10, fontWeight: 700,
                             background: x.met ? c.tealFill : 'transparent', color: '#fff',
                             border: x.met ? 0 : `1.5px solid ${c.toggleOff}` }}>
                {x.met ? '✓' : ''}
              </span>
              <span style={{ fontSize: 13.5, color: c.weak }}>{x.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.weaker }}>
                {x.got} / {x.need}
              </span>
            </div>
          ))}
        </div>

        {!os && (
          <p style={{ margin: '13px 0 0', fontSize: 12.5, lineHeight: 1.8, color: c.weak }}>
            {left === 1 ? 'あと1件です。' : `あと${left}件で、${sup}の判断に進みます。`}
          </p>
        )}
      </Card>

      {/* ---- 2段目 · SUPPORT。1段目が通るまで出さない（押せないボタンを見せない）---- */}
      {os && (
        <>
          <Spacer h={12} />
          <Card tone={decided ? 'teal' : 'warm'}>
            <Kicker tone={decided ? 'teal' : undefined}>SUPPORT</Kicker>
            {decided ? (
              <>
                <div style={{ marginTop: 11, fontSize: 13.5, fontWeight: 640,
                              color: c.tealDeep }}>到達と判断されました</div>
                <p style={{ margin: '9px 0 0', ...t.small, color: c.tealDeep, lineHeight: 1.85 }}>
                  「{cp.support_note}」
                </p>
              </>
            ) : p.canDecide ? (
              <CpDecide cp={cp} onDone={load} />
            ) : (
              <p style={{ margin: '11px 0 0', ...t.small, color: c.warmDeep, lineHeight: 1.85 }}>
                条件は揃っています。{sup}が見ています。
              </p>
            )}
          </Card>
        </>
      )}

      {!os && !decided && (
        <>
          <Spacer h={12} />
          <div style={{ ...t.small, color: c.weaker, lineHeight: 1.8 }}>
            両方が揃ったときだけ到達です。片方だけは
            <b style={{ fontWeight: 660, color: c.text }}>落ちたのではなく、預けてある状態</b>です。
          </div>
        </>
      )}

      {/* ---- これまでの到達 ---- */}
      {reached.length > 0 && (
        <>
          <Spacer />
          <button onClick={() => setPast(true)}
            style={{ width: '100%', minHeight: 42, cursor: 'pointer', font: 'inherit',
                     fontSize: 12.5, fontWeight: 640, color: c.weak, background: 'transparent',
                     border: `1.5px dashed ${c.dash}`, borderRadius: r.input }}>
            これまでの到達（{reached.length}件）
          </button>
        </>
      )}

      <Spacer />

      {past && (
        <Sheet onClose={() => setPast(false)}>
          <h2 style={{ ...t.h2, margin: 0 }}>これまでの到達</h2>
          <div style={{ marginTop: 18, display: 'grid', gap: 11 }}>
            {reached.map((x) => (
              <Card key={x.id} tone="flat">
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 13.5, fontWeight: 660 }}>{x.code} · {x.title}</b>
                  <span style={{ fontSize: 11, color: c.label }}>
                    {day((x as unknown as { reached_at: string }).reached_at)}
                  </span>
                </div>
                {x.support_note && (
                  <p style={{ margin: '9px 0 0', ...t.small, color: c.weak }}>
                    「{x.support_note}」
                  </p>
                )}
              </Card>
            ))}
          </div>
          <Spacer h={16} />
          <Button variant="ghost" onClick={() => setPast(false)}>閉じる</Button>
        </Sheet>
      )}
      {ask && <ConsultSheet subject={`${cp.code} · ${cp.title}`}
        onClose={() => setAsk(false)} onSent={() => setAsk(false)} />}
    </Screen>
  );
}

// 2段目の判断。Support だけが押せる（RLS でも担保されている）
function CpDecide(q: { cp: CP; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 13, display: 'grid', gap: 9 }}>
      <Button variant="outline" disabled={busy} onClick={async () => {
        const note = prompt('本人に見えるひとことを書いてください');
        if (!note?.trim()) return;
        setBusy(true); await supportDecide(q.cp.id, note.trim()); setBusy(false); q.onDone();
      }}>到達と判断する</Button>
      <Button variant="ghost" disabled={busy} onClick={async () => {
        const why = prompt('まだ早いと判断した理由');
        if (!why?.trim()) return;
        const add = prompt('足すものを1つだけ書いてください');
        if (!add?.trim()) return;
        setBusy(true); await hold(q.cp.id, why.trim(), add.trim()); setBusy(false); q.onDone();
      }}>まだ早い（理由を書いて保留に）</Button>
    </div>
  );
}

// ============================================================
// 保留中（Staff 6）— 落ちたのではなく、預けてある状態
// ============================================================

export function Holds(p: { onBack: () => void; nav?: NavSlots }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof holdCards>> | null>(null);
  const [ask, setAsk] = useState<string | null>(null);

  useEffect(() => { holdCards().then(setRows); }, []);

  const live = (rows ?? []).filter((x) => !x.resolved_at);
  const done = (rows ?? []).filter((x) => x.resolved_at);

  return (
    <Screen {...p.nav} bar={<Bar title="保留中" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>落ちたのではなく、預けてある状態です。</H>

      <Spacer h={18} />
      {rows === null ? <P>読み込んでいます…</P> : live.length === 0 ? (
        <Card tone="flat">
          <Kicker>保留中</Kicker>
          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: c.weak }}>
            いま預かっているものはありません。
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 11 }}>
          {live.map((h) => (
            <Card key={h.id} tone="warm">
              <Kicker>{h.cp ? `${h.cp.code} · ${h.cp.title}` : '保留'}</Kicker>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div>
                  <div style={t.field}>Supportの理由</div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.8,
                              color: c.warmDeep }}>{h.reason}</p>
                </div>
                <div>
                  <div style={t.field}>足すもの</div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.8,
                              color: c.warmDeep }}>{h.add_what}</p>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Button variant="ghost" onClick={() =>
                  setAsk(h.cp ? `${h.cp.code} · ${h.add_what}` : h.add_what)}>
                  この保留について相談する
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <Spacer />
          <Kicker>過去の保留</Kicker>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {done.map((h) => (
              <Card key={h.id} tone="flat">
                <div style={{ ...t.small, color: c.weaker }}>
                  {h.cp ? `${h.cp.code} · ` : ''}{h.add_what}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Spacer h={14} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          保留の件数・回数は Capability Map にも Journey にも出しません。
        </div>
      </Card>
      <Spacer />

      {ask && <ConsultSheet subject={ask}
        onClose={() => setAsk(null)} onSent={() => setAsk(null)} />}
    </Screen>
  );
}

const Chip = (q: { children: React.ReactNode }) => (
  <span style={{ padding: '5px 10px', borderRadius: r.pill, fontSize: 10,
                 fontWeight: 700, letterSpacing: '.02em', color: c.chipText,
                 background: c.chipBg, border: `1px solid ${c.line}` }}>
    {q.children}
  </span>
);

const area: React.CSSProperties = {
  width: '100%', minHeight: 74, padding: '13px 15px', borderRadius: r.input,
  border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
  fontSize: 13, lineHeight: 1.8, resize: 'vertical', outline: 'none',
};

// ============================================================
// Capability Map
// ============================================================

export function CapMap(p: { staffId?: string; onBack: () => void ; nav?: NavSlots}) {
  const [ax, setAx] = useState<Axis[]>([]);
  const [tab, setTab] = useState<'area' | 'step'>('area');
  const [ps, setPs] = useState<Param[]>([]);
  const [vs, setVs] = useState<Val[]>([]);

  useEffect(() => { axes().then(setAx); values(p.staffId).then(setVs); }, [p.staffId]);
  useEffect(() => {
    const a = ax.find((x) => x.code === tab); if (a) params(a.id).then(setPs);
  }, [ax, tab]);

  const valOf = (id: string) => vs.find((v) => v.param_id === id);

  // 色は3つだけ。「未検証」は検証中と同じ配色に破線罫線を足す。
  // 色を増やすと、状態が4段階の「評価」に見える（第2便 L）
  const tone = (st?: string): [string, string, string] =>
    st === '接続済み' ? [c.tealText, c.tealBg, c.tealLine]
    : st === '検証中' ? [c.weaker, c.flat, c.line]
    : [c.warmText, c.warmBg, c.warmLine];

  const Row = (q: { param: Param; sub?: boolean }) => {
    const v = valOf(q.param.id);
    const st = v?.status ?? '未接続';
    const [fg, bg, ln] = tone(st);
    const unverified = !!v?.unverified;
    const chips = q.param.sources ?? [];

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline',
                      justifyContent: 'space-between', gap: 10 }}>
          <b style={{ fontSize: q.sub ? 12.5 : 14.5, fontWeight: q.sub ? 600 : 640 }}>
            {q.param.name}
          </b>
          <span style={{ padding: '4px 9px', borderRadius: r.pill, fontSize: 10.5,
                         fontWeight: 700, color: fg, background: bg, flex: '0 0 auto',
                         border: unverified ? `1px dashed ${c.dash}` : `1px solid ${ln}` }}>
            {unverified ? '未検証' : st}
          </span>
        </div>

        {/* バーは value そのまま。取る値は 0/25/50/75/100 の5段階だけ */}
        <div style={{ position: 'relative', height: q.sub ? 4 : 6, marginTop: q.sub ? 6 : 9,
                      borderRadius: r.pill, background: c.line }}>
          <div style={{ position: 'absolute', inset: 0, width: `${v?.value ?? 0}%`,
                        borderRadius: r.pill,
                        background: st === '未接続' ? c.warmBar : c.teal }} />
        </div>

        {/* ソースチップは定義側の「どこから来る値か」。記録の題名は出さない（第3便 Y）*/}
        {!q.sub && chips.length > 0 && (
          <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.slice(0, 3).map((sname) => <Chip key={sname}>{sname}</Chip>)}
            {chips.length > 3 && <Chip>他 {chips.length - 3}件</Chip>}
          </div>
        )}

        {!q.sub && st === '未接続' && (
          <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.7, color: c.weaker }}>
            まだ記録が1件も繋がっていません。
          </div>
        )}
        {!q.sub && unverified && (
          <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.7, color: c.weaker }}>
            導入時の初期値のまま、90日動いていません{v?.basis ? `（${v.basis}）` : ''}。
          </div>
        )}
      </div>
    );
  };

  return (
    <Screen {...p.nav} bar={<Bar title="Capability Map" right="点数ではありません" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        {(['area', 'step'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: 1, minHeight: 42, borderRadius: r.input, cursor: 'pointer',
                     font: 'inherit', fontSize: 12.5, fontWeight: 700,
                     border: tab === k ? 0 : `1px solid ${c.toggleOff}`,
                     background: tab === k ? c.tealFill : 'transparent',
                     color: tab === k ? '#fff' : c.weaker }}>
            {k === 'area' ? '能力領域' : '判断工程'}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
        {ps.filter((x) => !x.parent_id).map((x) => {
          const subs = ps.filter((s) => s.parent_id === x.id);
          return (
            <div key={x.id}>
              <Row param={x} />
              {subs.length > 0 && (
                <div style={{ marginTop: 10, paddingLeft: 12,
                              borderLeft: `2px solid ${c.line}`, display: 'grid', gap: 10 }}>
                  {subs.map((sp) => <Row key={sp.id} param={sp} sub />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Spacer />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          これは点数ではありません。<b style={{ fontWeight: 660, color: c.text }}>根拠の接続度</b>です。
          記録を共有すると繋がりが1本増え、状態が動きます。
          数値が動くのは Checkpoint に到達したときだけです。スタッフ間では共有されません。
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 受信ボックス
// ============================================================

export function InboxScreen(p: {
  onBack: () => void; onOpenRecord?: (id: string) => void; nav?: NavSlots;
}) {
  const [items, setItems] = useState<InboxRow[] | null>(null);
  const [trash, setTrash] = useState(false);
  const [ask, setAsk] = useState<InboxRow | null>(null);   // 相談シート（A の入口1）

  const load = () => { inboxRows(trash).then(setItems); };
  useEffect(() => { load(); }, [trash]);

  return (
    <Screen {...p.nav} bar={<Bar title="受信" right={trash ? '消去済み' : undefined} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <div style={{ marginTop: 20, display: 'flex', gap: 5, padding: 4,
                    borderRadius: r.input, background: c.segBg }}>
        {[[false, '受信'], [true, '消去済み']].map(([v, l]) => (
          <button key={String(v)} onClick={() => setTrash(v as boolean)}
            style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 12, fontWeight: 700,
                     background: trash === v ? c.card : 'transparent',
                     color: trash === v ? c.text : c.weaker }}>{l as string}</button>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 9 }}>
        {items === null ? <P>読み込んでいます…</P> : items.length === 0 ? (
          <Card tone="flat"><div style={{ ...t.small, color: c.weaker }}>
            {trash ? '消去済みはありません。' : '受信はありません。'}
          </div></Card>
        ) : items.map((x) => {
          const unread = !x.read_at && !trash;
          return (
            <Card key={x.id} tone={unread ? 'teal' : 'plain'}>
              <div style={{ display: 'flex', alignItems: 'baseline',
                            justifyContent: 'space-between', gap: 10 }}>
                {/* 送信元は9種。第2便 P ／ 第3便 AB の表をそのまま出す */}
                <span style={{ ...t.field, color: unread ? c.tealText : c.weaker }}>
                  {x.from}
                </span>
                <span style={{ fontSize: 11, color: c.label }}>
                  {trash ? '30日で自動消去' : day(x.created_at)}
                </span>
              </div>

              {x.title && (
                <div style={{ marginTop: 8, fontSize: 14.5, fontWeight: 640 }}>{x.title}</div>
              )}
              {x.body && (
                <p style={{ margin: '8px 0 0', ...t.small, color: c.weak }}>{x.body}</p>
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {trash ? (
                  <Button variant="ghost" onClick={async () => { await restore(x.id); load(); }}>戻す</Button>
                ) : (
                  <>
                    {/* 返信できるのは「次の問い」だけ。催促を会話にしない（T） */}
                    {canReply(x.source_kind) && (
                      <Button variant="outline" onClick={() => setAsk(x)}>返信する</Button>
                    )}
                    {x.source_kind === 'record_reply' && p.onOpenRecord && x.source_id && (
                      <Button variant="outline"
                        onClick={() => p.onOpenRecord!(x.source_id as string)}>記録を開く</Button>
                    )}
                    {!x.read_at && (
                      <Button variant="ghost" onClick={async () => { await markRead(x.id); load(); }}>
                        既読にする
                      </Button>
                    )}
                    <Button variant="ghost" onClick={async () => { await softDelete(x.id); load(); }}>
                      消去
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Spacer />

      {ask && (
        <ConsultSheet subject={ask.title || '次の問い'}
          onClose={() => setAsk(null)}
          onSent={async () => { setAsk(null); await markRead(ask.id); load(); }} />
      )}
    </Screen>
  );
}

// ============================================================
// 相談シート（Staff 7）— 独立した画面ではない。必ず何かに紐づく。
// title は本人に入力させない。紐づいた先の名前をシステムが入れる。
// ============================================================

export function ConsultSheet(p: {
  subject: string; supportId?: string | null;
  onClose: () => void; onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<StoreSettings | null>(null);

  useEffect(() => { storeSettings().then(setSt); }, []);

  // 注記は必ず店舗設定の値と一致させる。ここがずれると、
  // 「本文はSupportまで」と読んで書いたものがManagementに渡る
  const note = st?.consultation_visibility === 'full'
    ? '本文が渡るのは担当のSupportまでです。Management にも本文が渡ります。'
    : '本文が渡るのは担当のSupportまでです。Management には、相談があったことと傾向だけが渡ります。';

  return (
    <Sheet onClose={p.onClose}>
      <h2 style={{ ...t.h2, margin: 0 }}>この1件について、聞きます。</h2>

      <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: r.input,
                    background: c.flat, fontSize: 11.5, lineHeight: 1.65, color: c.weak }}>
        <b style={{ fontWeight: 660, color: c.text }}>{p.subject}</b> について
        <br />担当のSupportに届きます
      </div>

      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
        placeholder="うまく言えなくても、そのまま書いてください。"
        style={{ width: '100%', marginTop: 14, padding: '13px 15px', borderRadius: r.input,
                 border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                 fontSize: 13, lineHeight: 1.75, color: c.text, outline: 'none',
                 resize: 'vertical', boxSizing: 'border-box' }} />

      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.7, color: c.weaker }}>
        {note}
      </p>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <Button disabled={busy || !body.trim()} onClick={async () => {
          setBusy(true);
          const ok = await askAbout({ title: p.subject, body: body.trim(),
                                      support_id: p.supportId ?? null });
          setBusy(false);
          if (ok) p.onSent();
        }}>送る</Button>
        <Button variant="ghost" onClick={p.onClose}>やめる</Button>
      </div>
    </Sheet>
  );
}

// 下から出るシート。画面遷移させない（相談は往復の一部で、目的地ではない）
export function Sheet(p: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={p.onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex',
               alignItems: 'flex-end', background: 'rgba(20,20,19,.34)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '86dvh', overflow: 'auto',
                 padding: '22px 24px 34px', background: c.bg,
                 borderRadius: `${r.sheet}px ${r.sheet}px 0 0` }}>
        {p.children}
      </div>
    </div>
  );
}

// ============================================================
// 通達をつくる
// ============================================================

export function PostNotice(p: { kind: 'support_to_mgmt' | 'mgmt_to_all' | 'mgmt_to_support'; onBack: () => void ; nav?: NavSlots}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const T = {
    support_to_mgmt: { h: '現場の判断を、設計の議題に上げます。', r: 'Staffには表示されません' },
    mgmt_to_all: { h: '全員に、同じ文面が届きます。', r: '宛先は絞れません' },
    mgmt_to_support: { h: '指導者へ、傾向として渡します。', r: '返答文は引用できません' },
  }[p.kind];

  return (
    <Screen {...p.nav} bar={<Bar title="通達をつくる" right={T.r} />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          <Button disabled={!title.trim() || !body.trim() || busy || done} onClick={async () => {
            setBusy(true);
            const ok = await postNotice({ kind: p.kind, title: title.trim(), body: body.trim() });
            setBusy(false); if (ok) setDone(true);
          }}>{done ? '送信しました' : busy ? '送っています…' : '通達する'}</Button>
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>
      <H>{T.h}</H>
      <Spacer h={18} />
      <div style={{ display: 'grid', gap: 12 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="題名"
          style={{ width: '100%', minHeight: 50, padding: '0 15px', borderRadius: r.input,
                   border: `1.5px solid ${c.teal}`, background: c.input, font: 'inherit',
                   fontSize: 16, fontWeight: 620, outline: 'none' }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="本文"
          style={{ ...area, minHeight: 120 }} />
      </div>
      <Spacer />
      {p.kind === 'mgmt_to_all' && (
        <Warn>
          <b style={{ fontWeight: 700 }}>宛先は絞れません。</b>
          人数も期限も書けません。既読は人数だけが見え、読んでいない人を名指しできません。
        </Warn>
      )}
      {p.kind === 'mgmt_to_support' && (
        <Warn>
          <b style={{ fontWeight: 700 }}>個別の返答文は引用できません。</b>
          渡せるのは傾向を示す数値だけです（就業規則 第6条第5項）。
        </Warn>
      )}
      <Spacer />
    </Screen>
  );
}
