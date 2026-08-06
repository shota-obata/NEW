// Growth OS Mobile — 相談 ／ Journey ／ Capability Map ／ 受信ボックス ／ 通達
//
// 中心は「評価」ではなく「判断のループ」。
// 到達は2段（Growth OS の条件 → Support の実務判断）が揃ったときだけ。
// 片方だけは保留で、落ちたのではなく預けてある状態として本人にも見せる。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer , type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import {
  consults, ask, replyTo, myJourney, ensureJourney, setPosition, checkpoints,
  addCheckpoint, supportDecide, hold, axes, params, values, inbox, markRead,
  softDelete, restore, notices, postNotice,
  type Consult, type Journey, type CP, type Axis, type Param, type Val,
  type Inbox, type Notice,
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

export function JourneyScreen(p: { canDecide: boolean; staffId?: string; onBack: () => void ; nav?: NavSlots}) {
  const [j, setJ] = useState<Journey | null>(null);
  const [cps, setCps] = useState<CP[]>([]);
  const [vision, setVision] = useState('');
  const [pos, setPos] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const x = await myJourney(p.staffId);
    setJ(x); setVision(x?.vision ?? ''); setPos(x?.current_position ?? '');
    if (x) setCps(await checkpoints(x.id));
  };
  useEffect(() => { load(); }, [p.staffId]);

  const ro = !!p.staffId;   // 他人のJourneyは読むだけ

  return (
    <Screen {...p.nav} bar={<Bar title="Journey" right={ro ? '担当スタッフ' : undefined} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{ro ? 'このスタッフの向かう先' : 'どこへ向かっていますか。'}</H>
      <Spacer h={18} />
      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 7 }}>
          <span style={t.field}>Vision</span>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)}
            readOnly={ro}
            onBlur={async () => { if (!ro && vision.trim()) { await ensureJourney(vision.trim()); load(); } }}
            placeholder="骨格が違っても、同じ基準で似合わせを説明できる"
            style={area} />
        </label>
        {j && (
          <label style={{ display: 'grid', gap: 7 }}>
            <span style={t.field}>いまの現在地</span>
            <textarea value={pos} onChange={(e) => setPos(e.target.value)}
              readOnly={ro}
              onBlur={() => !ro && pos.trim() && setPosition(j.id, pos.trim())}
              placeholder="基準点を位置で覚えている段階" style={area} />
          </label>
        )}
      </div>

      {j && (
        <>
          <Spacer />
          <Kicker>Checkpoint</Kicker>
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {cps.map((x) => <CpCard key={x.id} cp={x} canDecide={p.canDecide} onDone={load} />)}
            {!ro && <Button variant="outline" disabled={busy} onClick={async () => {
              const code = `CP${cps.length + 1}`;
              const title = prompt(`${code} は何を確かめますか`);
              if (!title?.trim()) return;
              setBusy(true); await addCheckpoint(j.id, code, title.trim());
              setBusy(false); load();
            }}>Checkpoint を足す</Button>}
          </div>
        </>
      )}
      <Spacer />
    </Screen>
  );
}

function CpCard(q: { cp: CP; canDecide: boolean; onDone: () => void }) {
  const { cp } = q;
  const os = !!cp.os_passed_at, sup = !!cp.support_decided_at;
  const reached = os && sup;
  const [busy, setBusy] = useState(false);

  return (
    <Card tone={reached ? 'teal' : sup || os ? 'warm' : 'plain'}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <b style={{ fontSize: 14, fontWeight: 660 }}>{cp.code} · {cp.title}</b>
        <span style={{ fontSize: 11, fontWeight: 700,
                       color: reached ? c.tealText : sup || os ? c.warmText : c.label }}>
          {reached ? '到達' : os || sup ? '保留' : '進行中'}
        </span>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <Step ok={os} label="1段目 · Growth OS の条件" sub={os ? '条件が揃っています' : `Evidence ${cp.required_evidence}件が要ります`} />
        <Step ok={sup} label="2段目 · Support の判断" sub={sup ? (cp.support_note ?? '実務で成立と判断') : 'まだ判断されていません'} />
      </div>

      {!reached && (
        <p style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
          両方が揃ったときだけ到達です。片方だけは<b style={{ fontWeight: 660 }}>落ちたのではなく、預けてある状態</b>です。
        </p>
      )}

      {q.canDecide && !sup && (
        <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
          <Button variant="outline" disabled={busy} onClick={async () => {
            const note = prompt('本人に見えるひとことを書いてください');
            if (!note?.trim()) return;
            setBusy(true); await supportDecide(cp.id, note.trim()); setBusy(false); q.onDone();
          }}>到達と判断する</Button>
          <Button variant="ghost" disabled={busy} onClick={async () => {
            const why = prompt('まだ早いと判断した理由');
            if (!why?.trim()) return;
            const add = prompt('足すものを1つだけ書いてください');
            if (!add?.trim()) return;
            setBusy(true); await hold(cp.id, why.trim(), add.trim()); setBusy(false); q.onDone();
          }}>まだ早い（理由を書いて保留に）</Button>
        </div>
      )}
    </Card>
  );
}

const Step = (q: { ok: boolean; label: string; sub: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'start' }}>
    <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid',
                   placeItems: 'center', fontSize: 10, fontWeight: 700, flex: '0 0 auto',
                   background: q.ok ? c.tealFill : 'transparent', color: '#fff',
                   border: q.ok ? 0 : `1.5px solid ${c.radioOff}` }}>{q.ok ? '✓' : ''}</span>
    <span style={{ display: 'grid', gap: 3 }}>
      <b style={{ fontSize: 12.5, fontWeight: 640 }}>{q.label}</b>
      <small style={{ fontSize: 11.5, lineHeight: 1.6, color: c.weaker }}>{q.sub}</small>
    </span>
  </div>
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
  const tone = (s?: string) =>
    s === '接続済み' ? [c.tealText, c.tealBg, c.tealLine]
    : s === '検証中' ? [c.weaker, c.flat, c.line]
    : s === '未検証' ? [c.warmText, c.warmBg, c.warmLine]
    : [c.warmText, c.warmBg, c.warmLine];

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
          const v = valOf(x.id);
          const [fg, bg, ln] = tone(v?.effective_status);
          const subs = ps.filter((s) => s.parent_id === x.id);
          return (
            <div key={x.id}>
              <div style={{ display: 'flex', alignItems: 'baseline',
                            justifyContent: 'space-between', gap: 10 }}>
                <b style={{ fontSize: 14.5, fontWeight: 640 }}>{x.name}</b>
                <span style={{ padding: '4px 9px', borderRadius: r.pill, fontSize: 10.5,
                               fontWeight: 700, color: fg, background: bg,
                               border: `1px solid ${ln}` }}>
                  {v?.effective_status ?? '未接続'}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, marginTop: 9,
                            borderRadius: r.pill, background: c.line }}>
                <div style={{ position: 'absolute', inset: 0, width: `${v?.value ?? 0}%`,
                              borderRadius: r.pill,
                              background: v?.effective_status === '接続済み' ? c.teal : c.warmBar }} />
              </div>
              {v?.source === 'initial_estimate' && (
                <div style={{ marginTop: 7, fontSize: 11, color: c.warmText }}>
                  導入時の初期値です{v.basis ? `（${v.basis}）` : ''}
                  {v.unverified && ' · 3か月動いていません'}
                </div>
              )}
              {x.sources.length === 0 && (
                <div style={{ marginTop: 7, fontSize: 11, color: c.weaker }}>
                  ソースが未設定です。数値は動きません。
                </div>
              )}
              {subs.length > 0 && (
                <div style={{ marginTop: 10, paddingLeft: 12,
                              borderLeft: `2px solid ${c.line}`, display: 'grid', gap: 9 }}>
                  {subs.map((s) => {
                    const sv = valOf(s.id);
                    return (
                      <div key={s.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: c.weaker }}>
                            {sv?.effective_status ?? '未接続'}
                          </span>
                        </div>
                        <div style={{ height: 4, marginTop: 6, borderRadius: r.pill,
                                      background: c.line, position: 'relative' }}>
                          <div style={{ position: 'absolute', inset: 0, width: `${sv?.value ?? 0}%`,
                                        borderRadius: r.pill, background: c.teal }} />
                        </div>
                      </div>
                    );
                  })}
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
          記録が 増えるほど動きます。スタッフ間では共有されません。
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 受信ボックス
// ============================================================

export function InboxScreen(p: { onBack: () => void ; nav?: NavSlots}) {
  const [items, setItems] = useState<Inbox[] | null>(null);
  const [ns, setNs] = useState<Notice[]>([]);
  const [trash, setTrash] = useState(false);

  const load = () => { inbox(trash).then(setItems); notices().then(setNs); };
  useEffect(() => { load(); }, [trash]);

  const label: Record<string, string> = {
    notice: '通達', os_suggestion: 'Growth OS', nudge: '催促',
    agreement_request: '同意の依頼', policy_update: '規定の更新', storage_alert: '保存容量',
  };

  return (
    <Screen {...p.nav} bar={<Bar title="受信" right={trash ? '消去済み' : 'plain'} />}
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
          const n = ns.find((y) => y.id === x.source_id);
          return (
            <Card key={x.id} tone={!x.read_at && !trash ? 'teal' : 'plain'}>
              <div style={{ display: 'flex', alignItems: 'baseline',
                            justifyContent: 'space-between', gap: 10 }}>
                <span style={{ ...t.field, color: !x.read_at && !trash ? c.tealText : c.label }}>
                  {label[x.source_kind] ?? x.source_kind}
                </span>
                <span style={{ fontSize: 11, color: c.label }}>
                  {trash ? '30日で自動消去' : day(x.created_at)}
                </span>
              </div>
              {n && (
                <>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 640 }}>{n.title}</div>
                  <p style={{ margin: '8px 0 0', ...t.small, color: c.weak }}>{n.body}</p>
                </>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                {trash ? (
                  <Button variant="ghost" onClick={async () => { await restore(x.id); load(); }}>戻す</Button>
                ) : (
                  <>
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
    </Screen>
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
