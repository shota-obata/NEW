// Growth OS Mobile — 相談 ／ Journey ／ Capability Map ／ 受信ボックス ／ 通達
//
// 中心は「評価」ではなく「判断のループ」。
// 到達は2段（Growth OS の条件 → Support の実務判断）が揃ったときだけ。
// 片方だけは保留で、落ちたのではなく預けてある状態として本人にも見せる。

import { Fragment, useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer, type NavSlots } from '../ui/kit';
import { c, t, r, serif } from '../ui/tokens';
import {
  myJourney, supportDecide, hold, params, values, markRead,
  softDelete, restore, postNotice,
  inboxRows, canReply, askAbout, storeSettings, currentCP, cpConditions, holdCards,
  shareTargets, shareWith, setVision, createCheckpoint, condLabel, FIELD_LABEL,
  axes, levelsOf, historyOf, stepMeaning, STEPS,
  picks, oneHand, band, focusRows, setFocus, clearFocus,
  adjustStep, writeLevel, nameOf, sourcesFor,
  type Level, type Picked, type Band, type Focus,
  nextQuestions, deliverQuestion, submitForReview, snoozeNudge,
  addParam, sourcePreview, SOURCE_LABEL,
  type ShareTargets, type CondDraft, type CondKind, type NextQDraft,
  type Journey, type CP, type Axis, type Param, type Val,
  type InboxRow, type StoreSettings, type CondRow,
} from '../lib/core';
import { agreeAssignment, declineAssignment } from '../lib/mgmt';

const day = (s: string) => s.slice(5, 10).replace('-', '/');

// ============================================================
// 相談と返答（区分02）
// ============================================================

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
  const [loaded, setLoaded] = useState(false);

  const sup = p.supportName ?? '担当のSupport';

  const load = async () => {
    const x = await myJourney(p.staffId);
    setJ(x); setLoaded(true);
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

  // Journey が無い＝担当がまだ決まっていない。
  // ここを「読み込んでいます…」のままにすると、永久に回り続ける
  if (!loaded) return (
    <Screen {...p.nav} bar={<Bar title="CP" />}><Spacer h={30} /><P>読み込んでいます…</P></Screen>
  );
  if (!j) return (
    <Screen {...p.nav} bar={<Bar title="CP" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
      <H>担当が決まると、ここが動きます。</H>
      <Spacer h={18} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak, lineHeight: 1.9 }}>
          Checkpoint は担当のSupportと一緒に置きます。
          担当の割り当ては運営者と双方の同意で決まるので、
          <b style={{ fontWeight: 660, color: c.text }}>あなたの側ですることはありません。</b>
          {' '}記録は担当が決まる前から書けます。
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
  if (!cp) return (
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

      {/* 1段目が通ったら、本人が出す。出すまで2段目に進まない。
          出す一拍を本人に持たせるのが目的なので、自動で渡さない */}
      {os && !cp.submitted_at && !p.canDecide && (
        <>
          <Spacer h={12} />
          <Card tone="warm">
            <Kicker>あなたが出すまで、進みません</Kicker>
            <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.85, color: c.warmDeep }}>
              条件は揃いました。
              <b style={{ fontWeight: 660 }}>出しても落ちません。</b>
              {' '}まだ早いと{sup}が思えば、足すものを1つ書いて預かるだけです。
            </p>
            <Spacer h={13} />
            <div style={{ display: 'grid', gap: 8 }}>
              <Button onClick={async () => { await submitForReview(cp.id); load(); }}>
                {sup}に見てもらう
              </Button>
              <Button variant="ghost" onClick={() => setAsk(true)}>
                不安なところを先に話したい
              </Button>
              <Button variant="ghost" onClick={async () => {
                await snoozeNudge(cp.id, 'cp_not_submitted'); load();
              }}>2週間後にもう一度声をかけてもらう</Button>
            </div>
          </Card>
        </>
      )}

      {/* ---- 2段目 · SUPPORT。本人が出すまで出さない ---- */}
      {os && (cp.submitted_at || p.canDecide) && (
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
              cp.submitted_at ? <CpDecide cp={cp} onDone={load} /> : (
                <p style={{ margin: '11px 0 0', ...t.small, color: c.warmDeep, lineHeight: 1.85 }}>
                  条件は揃っていますが、本人がまだ出していません。
                  こちらからは進めません。
                </p>
              )
            ) : (
              <>
                <p style={{ margin: '11px 0 0', ...t.small, color: c.warmDeep, lineHeight: 1.85 }}>
                  出しました。{sup}が見ています。
                </p>
                <div style={{ marginTop: 11 }}>
                  <Button variant="ghost" onClick={async () => {
                    await submitForReview(cp.id, false); load();
                  }}>やっぱり取り下げる</Button>
                </div>
              </>
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

// defs = 定義だけを見る面（Management）。
// 誰の値も出さない — Management に Capability Map の細目は見えない、を守る。
// 変えられるのは行の名称とソースだけ。
export function CapMap(p: {
  staffId?: string; isMgmt?: boolean; defs?: boolean;
  onBack: () => void; nav?: NavSlots;
}) {
  const [ps, setPs] = useState<Picked[] | null>(null);
  const [bd, setBd] = useState<Band | null>(null);
  const [j, setJ] = useState<Journey | null>(null);
  const [vision, setVis] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [all, setAll] = useState(false);          // 38行ぜんぶ
  const [row, setRow] = useState<{ param: Param; area: Axis } | null>(null);

  const load = async () => {
    const xs = await picks(p.staffId);
    setPs(xs);
    setNames(await nameOf(xs.map((x) => x.setBy).filter((x): x is string => !!x)));
    setBd(await band(p.staffId));
    if (!p.defs) myJourney(p.staffId).then((x) => { setJ(x); setVis(x?.vision ?? ''); });
  };
  useEffect(() => { load(); }, [p.staffId]);

  const hand = ps ? oneHand(ps) : null;

  if (all) return (
    <AllRows staffId={p.staffId} defs={p.defs} picks={ps ?? []}
      onOpen={(param, area) => setRow({ param, area })}
      onBack={() => { setAll(false); load(); }} nav={p.nav} />
  );

  return (
    <Screen {...p.nav} bar={<Bar title="Capability Map"
      right={p.defs ? '定義だけ' : '点数ではありません'} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      {/* ---- 向かう先。書けるのは本人だけ ---- */}
      {!p.defs && (
        <>
          <Spacer h={18} />
          <Kicker>向かう先</Kicker>
          {p.staffId ? (
            <p style={{ margin: '9px 0 0', font: `17px ${serif}`, lineHeight: 1.7 }}>
              {j?.vision || 'まだ書かれていません。'}
            </p>
          ) : (
            <textarea value={vision} onChange={(e) => setVis(e.target.value)}
              onBlur={() => { if (j && vision.trim() !== (j.vision ?? '')) setVision(j.id, vision.trim()); }}
              placeholder="まだ書いていません。"
              style={{ width: '100%', marginTop: 9, minHeight: 62, padding: '10px 12px',
                       borderRadius: r.input, border: `1px solid ${c.line}`, background: c.input,
                       font: `17px ${serif}`, lineHeight: 1.7, color: c.text,
                       outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          )}
          {!p.staffId && (
            <div style={{ marginTop: 8, ...t.small, color: c.weaker }}>
              担当のSupportも読みます。
            </div>
          )}
        </>
      )}

      {/* ---- 次に見るところ。開いた瞬間に立つのはこれ1枚だけ ---- */}
      {!p.defs && (
        <>
          <Spacer h={20} />
          {ps === null ? <P>読み込んでいます…</P> : !hand ? (
            <Card tone="flat">
              <div style={{ ...t.small, color: c.weak, lineHeight: 1.9 }}>
                まだ、どの部門も始まっていません。
                <b style={{ fontWeight: 660, color: c.text }}>開くのは担当のSupportです。</b>
              </div>
            </Card>
          ) : (
            <div style={{ padding: '24px 22px', borderRadius: 20,
                          background: c.tealBg, border: `1.5px solid ${c.teal}` }}>
              <div style={{ ...t.kicker, color: c.tealText }}>いま見ているところ</div>
              <div style={{ marginTop: 5, fontSize: 11.5, color: c.label }}>
                {hand.area.label}
              </div>
              <h2 style={{ margin: '9px 0 0', font: `29px ${serif}`, lineHeight: 1.3,
                           color: c.focusDeep }}>{hand.param.name}</h2>

              <div style={{ marginTop: 16, paddingTop: 15,
                            borderTop: `1px solid ${c.tealLine}`, display: 'grid', gap: 12 }}>
                <StepLine label="いま" step={hand.value} paramId={hand.param.id} />
                <StepLine label="次" step={Math.min(100, hand.value + 25)}
                  paramId={hand.param.id} />
              </div>

              {/* 指定の理由。自動のときは内箱ごと出さない */}
              {hand.reason && (
                <div style={{ marginTop: 15, padding: '12px 14px', borderRadius: r.input,
                              background: c.tealBg, border: `1px solid ${c.tealLine}` }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.75, color: c.tealDeep }}>
                    {hand.reason}
                  </div>
                </div>
              )}
              {hand.setBy && (
                <div style={{ marginTop: 9, fontSize: 10.5, color: c.focusSub }}>
                  {names[hand.setBy] ?? '—'}さんが {hand.setAt?.slice(5, 10).replace('-', '/')} に指しました
                </div>
              )}

              <div style={{ marginTop: 16, display: 'grid', gap: 9 }}>
                <Button onClick={() => setRow({ param: hand.param, area: hand.area })}>
                  段の中身を読む
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- いまいるところ。Support が書き、本人は読むだけ ---- */}
      {!p.defs && (
        <>
          <Spacer h={16} />
          <Card tone="flat">
            <Kicker>いまいるところ · 担当のSupportが書いています</Kicker>
            <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 1.75, color: c.weak }}>
              {j?.current_position || 'まだ書かれていません。'}
            </p>
          </Card>
        </>
      )}

      {/* ---- 全体（帯1本）。本数は帯の中に入れず凡例に出す ---- */}
      {!p.defs && bd && (
        <>
          <Spacer h={18} />
          <Kicker>全体</Kicker>
          <BandBar b={bd} />
          <div style={{ marginTop: 11, ...t.small, color: c.weaker, lineHeight: 1.8 }}>
            帯は<b style={{ fontWeight: 660, color: c.text }}>本数</b>です。長さを人と比べるものではありません。
            {bd.not > 0 && ` まだ開いていない行が ${bd.not} あります。`}
          </div>
        </>
      )}

      <Spacer />
      <Button variant="outline" onClick={() => setAll(true)}>38行ぜんぶを見る</Button>

      <Spacer />
      <div style={{ ...t.small, color: c.weaker, lineHeight: 1.85 }}>
        {p.defs
          ? '個人の Capability Map は運営者には見えません。ここは行の定義だけです。'
          : '数値が動くのは、Checkpoint に到達したときと、担当のSupportが調整したときだけです。記録を出した数では動きません。スタッフ間では共有されません。'}
      </div>
      <Spacer />

      {row && (
        <RowSheet param={row.param} area={row.area} staffId={p.staffId}
          onClose={() => { setRow(null); load(); }} />
      )}
    </Screen>
  );
}

void AddParamSheet;   // 行の追加は 38行ぜんぶ の中から使う（次のPRで繋ぐ）

// 一手カードの「いま · 25 手順として再現できる」＋定義文
function StepLine(q: { label: string; step: number; paramId: string }) {
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    levelsOf(q.paramId).then((ls) => setBody(ls.find((x) => x.step === q.step)?.body ?? null));
  }, [q.paramId, q.step]);

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 640, color: c.tealDeep }}>
        {q.label} · {q.step > 0 ? `${q.step} ${stepMeaning(q.step)}` : 'まだ始まっていません'}
      </div>
      {q.step > 0 && (
        <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.75,
                      color: body ? c.tealDeep : c.focusSub }}>
          {body ?? 'まだ書かれていません。'}
        </div>
      )}
    </div>
  );
}

// 全体の帯（16a）。高さ16px、本数は下の凡例に
const BandBar = (q: { b: Band; compact?: boolean }) => {
  const seg: [number, string, string][] = [
    [q.b.can,    c.band1, 'できる'],
    [q.b.choose, c.band2, '選べる'],
    [q.b.tell,   c.band3, '言える'],
    [q.b.not,    c.band0, 'まだ'],
  ];
  const total = seg.reduce((n, s) => n + s[0], 0) || 1;

  return (
    <>
      <div style={{ display: 'flex', gap: 2, marginTop: 11 }}>
        {seg.filter(([n]) => n > 0).map(([n, col, label]) => (
          <div key={label} style={{ flex: n, height: 16, borderRadius: 5, background: col,
                                    border: col === c.band0 ? `1px solid ${c.line}` : 0 }} />
        ))}
        {total === 0 && <div style={{ flex: 1, height: 16, borderRadius: 5, background: c.band0 }} />}
      </div>
      {!q.compact && (
        <div style={{ marginTop: 9, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {seg.map(([n, col, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5,
                                       fontSize: 11, color: c.weak }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: col,
                             border: col === c.band0 ? `1px solid ${c.line}` : 0 }} />
              {label} {n}
            </span>
          ))}
        </div>
      )}
    </>
  );
};

// ============================================================
// 38行ぜんぶ（4-1）
// ============================================================

function AllRows(q: {
  staffId?: string; defs?: boolean; picks: Picked[];
  onOpen: (p: Param, a: Axis) => void; onBack: () => void; nav?: NavSlots;
}) {
  const [mode, setMode] = useState<'step' | 'dept'>('step');
  const [rows, setRows] = useState<{ a: Axis; ps: Param[] }[]>([]);
  const [vs, setVs] = useState<Val[]>([]);
  const [open, setOpen] = useState<string | null>(null);   // 折り畳み
  const [only, setOnly] = useState<string | null>(null);   // 段側の絞り

  useEffect(() => {
    (async () => {
      const as = await axes();
      setVs(await values(q.staffId));
      const out: { a: Axis; ps: Param[] }[] = [];
      for (const a of as) out.push({ a, ps: (await params(a.id, q.staffId)).filter((x) => !x.parent_id) });
      setRows(out);
    })();
  }, [q.staffId]);

  const val = (id: string) => vs.find((v) => v.param_id === id)?.value ?? 0;
  const srcN = (id: string) => vs.find((v) => v.param_id === id)?.source_count ?? 0;
  const isNext = (id: string) => q.picks.some((x) => x.param.id === id);
  const bandOf = (ps: Param[]): Band => ps.reduce((b, x) => {
    const v = val(x.id);
    if (v >= 75) b.tell++; else if (v === 50) b.choose++;
    else if (v === 25) b.can++; else b.not++;
    return b;
  }, { can: 0, choose: 0, tell: 0, not: 0 });

  const started = rows.filter((x) => x.ps.some((p) => val(p.id) > 0));
  const notYet  = rows.filter((x) => x.ps.length > 0 && !x.ps.some((p) => val(p.id) > 0));

  return (
    <Screen {...q.nav} bar={<Bar title="38行ぜんぶ" right={`${rows.reduce((n, x) => n + x.ps.length, 0)} 行`} />}
      footer={<Button variant="outline" onClick={q.onBack}>戻る</Button>}>

      <div style={{ marginTop: 18, display: 'flex', gap: 5, padding: 4,
                    borderRadius: r.input, background: c.segBg }}>
        {([['step', '段でまとめる'], ['dept', '部門でまとめる']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)}
            style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 12, fontWeight: 700,
                     background: mode === k ? c.card : 'transparent',
                     color: mode === k ? c.text : c.weaker }}>{label}</button>
        ))}
      </div>

      {mode === 'step' ? (
        <>
          {/* 部門ごとの帯7本。押すとその部門に絞る */}
          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            {rows.filter((x) => x.ps.length > 0).map(({ a, ps }) => (
              <button key={a.id} onClick={() => setOnly(only === a.id ? null : a.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         background: 'transparent', border: 0, padding: 0,
                         opacity: only && only !== a.id ? 0.4 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 640 }}>{a.label}</span>
                  <span style={{ fontSize: 10.5, color: c.label }}>{ps.length} 行</span>
                </div>
                <BandBar b={bandOf(ps)} compact />
              </button>
            ))}
          </div>

          <Spacer />
          <div style={{ display: 'grid', gap: 11 }}>
            {STEPS.slice().reverse().concat([0 as never]).map((step) => {
              const list = rows
                .filter((x) => !only || x.a.id === only)
                .flatMap(({ a, ps }) => ps.filter((x) => val(x.id) === step).map((x) => ({ a, x })));
              if (list.length === 0) return null;
              return (
                <Card key={step} tone="plain"
                  style={step === 75 ? { border: `1px solid ${c.tealLine}` } : undefined}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span style={{ font: `19px ${serif}` }}>{step || '—'}</span>
                    <span style={{ flex: 1, fontSize: 12, color: c.weak }}>
                      {step ? stepMeaning(step) : 'まだ'}
                    </span>
                    <span style={{ fontSize: 10.5, color: c.label }}>{list.length} 行</span>
                  </div>
                  <div style={{ marginTop: 11, display: 'grid', gap: 1 }}>
                    {list.map(({ a, x }) => (
                      <button key={x.id} onClick={() => q.onOpen(x, a)}
                        style={{ width: '100%', textAlign: 'left', cursor: 'pointer',
                                 font: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                                 padding: '9px 10px', border: 0, borderRadius: r.input,
                                 background: isNext(x.id) ? c.tealBg : 'transparent' }}>
                        <span style={{ width: 82, flex: '0 0 auto', fontSize: 11, color: c.label }}>
                          {a.label}
                        </span>
                        <span style={{ flex: 1, fontSize: 13 }}>{x.name}</span>
                        {isNext(x.id) && (
                          <span style={{ padding: '2px 7px', borderRadius: r.pill, fontSize: 9.5,
                                         fontWeight: 700, color: c.tealText,
                                         border: `1px solid ${c.teal}` }}>次</span>
                        )}
                        <span style={{ color: c.label, fontSize: 14 }}>›</span>
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* 部門でまとめる。折り畳み。畳んだ行にも「次」を出す */}
          <div style={{ marginTop: 16, display: 'grid', gap: 9 }}>
            {started.map(({ a, ps }) => {
              const nx = q.picks.find((x) => x.area.id === a.id);
              const isOpen = open === a.id;
              return (
                <Card key={a.id} tone="plain">
                  <button onClick={() => setOpen(isOpen ? null : a.id)}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                             background: 'transparent', border: 0, padding: 0,
                             display: 'flex', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 13.5, fontWeight: 640 }}>{a.label}</b>
                    <span style={{ fontSize: 10.5, color: c.label }}>
                      記録 {ps.reduce((n, x) => n + srcN(x.id), 0)}
                    </span>
                    <span style={{ flex: 1 }} />
                    {!isOpen && nx && (
                      <span style={{ fontSize: 11.5, color: c.tealText }}>次 · {nx.param.name}</span>
                    )}
                    <span style={{ color: c.label, fontSize: 14 }}>{isOpen ? '⌃' : '⌄'}</span>
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: 12 }}>
                      <BandBar b={bandOf(ps)} compact />
                      <div style={{ marginTop: 12, display: 'grid',
                                    gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                        {ps.map((x) => (
                          <button key={x.id} onClick={() => q.onOpen(x, a)}
                            style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit',
                                     padding: '9px 11px', borderRadius: r.input, fontSize: 12,
                                     background: isNext(x.id) ? c.tealBg : c.flat,
                                     border: `1px solid ${isNext(x.id) ? c.teal : c.cardLine}` }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                              <span style={{ flex: 1 }}>{x.name}</span>
                              <span style={{ fontSize: 10.5, color: c.label }}>{val(x.id) || '—'}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {notYet.length > 0 && (
            <>
              <Spacer h={14} />
              <Card tone="flat">
                <Kicker>まだ始まっていません</Kicker>
                <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
                  {notYet.map(({ a, ps }) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between',
                                             gap: 10, fontSize: 12.5, color: c.weak }}>
                      <span>{a.label}</span>
                      <span style={{ color: c.weaker }}>{ps.length} 行</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 11, ...t.small, color: c.weaker, lineHeight: 1.8 }}>
                  開くのは担当のSupportです。開いていない部門も、何が待っているかは見えます。
                </div>
              </Card>
            </>
          )}
        </>
      )}
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 行のシート（4-2 Staff ／ 4-3 Support）
//
// 段は「今」（誰が上げたか）、指定は「次」（誰が指したか）。別物として出す。
// どちらも書いた人の名前を必ず出す。
// ============================================================

function RowSheet(q: {
  param: Param; area: Axis; staffId?: string; onClose: () => void;
}) {
  const [lv, setLv] = useState<Level[]>([]);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof historyOf>>>([]);
  const [val, setVal] = useState(0);
  const [fc, setFc] = useState<Focus | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [write, setWrite] = useState<number | null>(null);
  const [srcs, setSrcs] = useState<{ id: string; title: string; recorded_on: string }[]>([]);

  const isSupport = !!q.staffId;              // 他人の Map を開いている＝Support
  const target = q.staffId ?? me;

  const load = async () => {
    const { sb } = await import('../lib/api');
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id ?? null; setMe(uid);
    const who = q.staffId ?? uid; if (!who) return;

    setLv(await levelsOf(q.param.id));
    const h = await historyOf(who, q.param.id); setHist(h);
    setVal(h[0]?.value ?? 0);
    const f = (await focusRows(who)).find((x) => x.area_id === q.area.id) ?? null;
    setFc(f);
    setNames(await nameOf([
      ...h.map((x) => x.entered_by), f?.set_by ?? null,
      ...lv.map((x) => x.written_by),
    ].filter((x): x is string => !!x)));
    setSrcs(await sourcesFor(who, q.param.id));
  };
  useEffect(() => { load(); }, [q.param.id]);

  const body = (s: number) => lv.find((x) => x.step === s) ?? null;
  const isNext = fc?.param_id === q.param.id;
  const nextStep = Math.min(100, val + 25);

  return (
    <Sheet onClose={q.onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: c.label }}>
            {isSupport ? `${names[q.staffId!] ?? ''} · ` : ''}{q.area.label}
          </div>
          <h2 style={{ margin: '5px 0 0', fontSize: 16, fontWeight: 660 }}>{q.param.name}</h2>
        </div>
        <div style={{ font: `28px ${serif}`, color: val ? c.text : c.label }}>{val || '—'}</div>
      </div>

      {/* この行が「次に見るところ」なら、指定カード */}
      {isNext && (
        <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: r.input,
                      background: c.tealBg, border: `1px solid ${c.tealLine}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '2px 7px', borderRadius: r.pill, fontSize: 9.5,
                           fontWeight: 700, color: c.tealText,
                           border: `1px solid ${c.teal}` }}>次</span>
            <span style={{ fontSize: 11.5, color: c.tealText }}>
              {q.area.label}で次に見るところ
            </span>
          </div>
          {fc?.reason && (
            <div style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.75, color: c.tealDeep }}>
              {fc.reason}
            </div>
          )}
          {fc?.set_by && (
            <div style={{ marginTop: 8, fontSize: 10.5, color: c.focusSub }}>
              {names[fc.set_by] ?? '—'}さんが {fc.set_at.slice(5, 10).replace('-', '/')} に指しました
            </div>
          )}
        </div>
      )}

      {/* 4段を縦に並べる（上が100）*/}
      <Spacer h={16} />
      <div style={{ display: 'grid', gap: 8 }}>
        {[100, 75, 50, 25].map((s) => {
          const b = body(s);
          const here = s === val;
          const next = s === nextStep && !here;
          const done = s < val;
          return (
            <div key={s} style={{ padding: '13px 15px', borderRadius: r.input,
                        background: here ? c.chipBg : next ? c.card : 'transparent',
                        border: next ? `1.5px solid ${c.teal}`
                              : done ? `1px solid ${c.cardLine}`
                              : `1px dashed ${c.dash}`,
                        opacity: !here && !next && !done ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span style={{ font: `17px ${serif}` }}>{s}</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: here || next ? 640 : 500 }}>
                  {stepMeaning(s)}
                </span>
                {here && <span style={{ fontSize: 10.5, fontWeight: 700, color: c.weak }}>いま</span>}
                {done && <span style={{ fontSize: 10.5, color: c.weaker }}>通過</span>}
                {!b && isSupport && (
                  <span style={{ fontSize: 10, color: c.warmText }}>未記入</span>
                )}
              </div>

              {(here || next) && (
                <div style={{ marginTop: 9, padding: next ? '11px 13px' : 0,
                              borderRadius: r.input,
                              background: next ? c.tealBg : 'transparent' }}>
                  {next && (
                    <div style={{ ...t.kicker, color: c.tealText, marginBottom: 6 }}>ここが次です</div>
                  )}
                  <div style={{ fontSize: 12.5, lineHeight: 1.75,
                                color: b ? (next ? c.tealDeep : c.weak) : c.weaker }}>
                    {b?.body ?? 'まだ書かれていません。ここに上げると判断した人が書きます。'}
                  </div>
                  {b?.written_by && (
                    <div style={{ marginTop: 7, fontSize: 10.5, color: c.weaker }}>
                      {names[b.written_by] ?? '—'}さんが {b.written_at.slice(5, 10).replace('-', '/')} に書きました
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* これまで — 見たこと / 判断 / 当時の定義 */}
      <Spacer h={18} />
      <Kicker>これまで</Kicker>
      <div style={{ marginTop: 11, display: 'grid', gap: 12 }}>
        {hist.length === 0 ? (
          <div style={{ ...t.small, color: c.weaker }}>まだ動いていません。</div>
        ) : hist.map((h) => (
          <div key={h.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                          fontSize: 12.5 }}>
              <span>
                {h.source === 'support_adjust' && h.entered_by
                  ? `${names[h.entered_by] ?? '—'}さんが調整`
                  : SOURCE_TEXT[h.source] ?? h.source}
              </span>
              <span style={{ color: c.weaker }}>
                {h.created_at.slice(5, 10).replace('-', '/')} · {h.value}
              </span>
            </div>
            {h.basis && (
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr',
                            gap: '4px 9px', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
                {h.basis.split('\n').map((line, i) => {
                  const [k, ...rest] = line.split('｜');
                  return rest.length === 0 ? (
                    <span key={i} style={{ gridColumn: '1 / -1' }}>{line}</span>
                  ) : (
                    <Fragment key={i}>
                      <span style={{ color: c.label }}>{k}</span>
                      <span>{rest.join('｜')}</span>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* この行につながっている記録 */}
      {srcs.length > 0 && (
        <>
          <Spacer h={16} />
          <Kicker>この行につながっている記録</Kicker>
          <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
            {srcs.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between',
                                       gap: 10, fontSize: 12.5, color: c.weak }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis',
                               whiteSpace: 'nowrap' }}>{s.title}</span>
                <span style={{ color: c.weaker, flex: '0 0 auto' }}>
                  {s.recorded_on.slice(5).replace('-', '/')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- Support の差分（4-3）---- */}
      {isSupport ? (
        <>
          <Spacer h={16} />
          <Card tone="flat">
            <Kicker>ソース</Kicker>
            <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(q.param.sources ?? []).map((s) => <Chip key={s}>{SOURCE_LABEL[s] ?? s}</Chip>)}
            </div>
            <div style={{ marginTop: 11, ...t.small, color: c.weak, lineHeight: 1.85 }}>
              <b style={{ fontWeight: 660, color: c.text }}>名称は Management が決めます。</b>
              {' '}変えたいときは、Managementへ通達から伝えてください。
            </div>
          </Card>

          {/* 「次に見るところ」にする（27a）*/}
          <Spacer h={14} />
          <FocusBox param={q.param} area={q.area} staffId={q.staffId!} focus={fc}
            names={names} onDone={load} />

          <Spacer h={16} />
          <div style={{ display: 'grid', gap: 8 }}>
            <Button onClick={() => setAdjust(true)}>段を調整する</Button>
            {[25, 50, 75, 100].filter((s) => !body(s)).length > 0 && (
              <Button variant="outline"
                onClick={() => setWrite([25, 50, 75, 100].find((s) => !body(s))!)}>
                {[25, 50, 75, 100].find((s) => !body(s))} の段を書く
              </Button>
            )}
            <Button variant="ghost" onClick={q.onClose}>閉じる</Button>
          </div>
        </>
      ) : (
        <>
          <Spacer h={16} />
          <div style={{ ...t.small, color: c.weaker, lineHeight: 1.85 }}>
            段を動かすのは、担当のSupportです。
            <b style={{ fontWeight: 660, color: c.text }}>自分では動かせません。</b>
            {' '}ここに何が書かれるかは、そのまま見えます。
          </div>
          <Spacer h={14} />
          <Button variant="ghost" onClick={q.onClose}>閉じる</Button>
        </>
      )}

      {adjust && target && (
        <AdjustSheet param={q.param} staffId={target} now={val} levels={lv}
          onClose={() => setAdjust(false)}
          onDone={() => { setAdjust(false); load(); }} />
      )}
      {write !== null && (
        <WriteLevelSheet param={q.param} area={q.area} step={write}
          onClose={() => setWrite(null)}
          onDone={() => { setWrite(null); load(); }} />
      )}
    </Sheet>
  );
}

// 「この行を『次に見るところ』にする」（27a）
function FocusBox(q: {
  param: Param; area: Axis; staffId: string; focus: Focus | null;
  names: Record<string, string>; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = q.focus;
  const already = cur?.param_id === q.param.id;
  const left = 50 - reason.length;

  return (
    <div style={{ padding: '15px 16px', borderRadius: r.input,
                  background: c.tealBg, border: `1.5px solid ${c.teal}` }}>
      <div style={{ padding: '11px 13px', borderRadius: r.input, background: c.flat }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                      fontSize: 12, color: c.weak }}>
          <span>いま次に見るところ · {cur ? '指定あり' : '自動'}</span>
          {cur?.set_by && (
            <span style={{ color: c.weaker }}>{q.names[cur.set_by] ?? '—'}さん</span>
          )}
        </div>
      </div>

      {!already && (
        <>
          <div style={{ marginTop: 13, ...t.field }}>なぜ次はここか</div>
          <input value={reason} maxLength={50}
            onChange={(e) => setReason(e.target.value.replace(/[\r\n]/g, ''))}
            placeholder="1行・50字まで"
            style={{ width: '100%', marginTop: 7, minHeight: 44, padding: '0 13px',
                     borderRadius: r.input, border: `1px solid ${c.tealLine}`,
                     background: c.input, font: 'inherit', fontSize: 13, color: c.text,
                     outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between',
                        gap: 10, fontSize: 11, color: c.weaker }}>
            <span>書かなくても出せます。{q.names[q.staffId] ?? '本人'}さんが読めます。</span>
            <span>あと {left}字</span>
          </div>

          <div style={{ marginTop: 12 }}>
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              const ok = await setFocus({
                staff_id: q.staffId, area_id: q.area.id,
                param_id: q.param.id, reason: reason || null,
              });
              setBusy(false);
              if (ok) {
                alert(`${q.area.label}の「次」がこの行に変わります。`
                    + 'ほかの部門は変わりません。あとから変えても、前の理由は履歴に残ります。');
                q.onDone();
              }
            }}>{q.param.name} を「次」にする</Button>
          </div>
        </>
      )}

      {cur && (
        <div style={{ marginTop: already ? 13 : 11 }}>
          <button onClick={async () => {
            await clearFocus(q.staffId, q.area.id); q.onDone();
          }}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 12, color: c.tealText }}>
            自動に戻す
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 段を調整する（4-4・Support のみ）
// 数値は打たせない。4段のラジオ。±1段だけ押せる
// ============================================================

function AdjustSheet(q: {
  param: Param; staffId: string; now: number; levels: Level[];
  onClose: () => void; onDone: () => void;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const [seen, setSeen] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const can = (s: number) => Math.abs(s - q.now) === 25;
  const body = (s: number) => q.levels.find((x) => x.step === s)?.body ?? null;
  const ok = pick !== null && seen.trim().length >= 30 && why.trim().length >= 30;

  return (
    <Sheet onClose={q.onClose}>
      <h2 style={{ ...t.h2, margin: 0 }}>{q.param.name} を、どの段にしますか。</h2>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {[25, 50, 75, 100].map((s) => {
          const on = pick === s;
          const usable = can(s);
          return (
            <button key={s} disabled={!usable} onClick={() => setPick(s)}
              style={{ width: '100%', textAlign: 'left', cursor: usable ? 'pointer' : 'default',
                       font: 'inherit', padding: '13px 15px', borderRadius: r.input,
                       opacity: usable ? 1 : 0.55, display: 'flex', gap: 11,
                       alignItems: 'flex-start',
                       background: on ? c.tealBg : c.card,
                       border: `1px solid ${on ? c.teal : c.cardLine}` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                             marginTop: 2, display: 'grid', placeItems: 'center',
                             border: `1.5px solid ${on ? c.tealFill : c.radioOff}` }}>
                {on && <span style={{ width: 9, height: 9, borderRadius: '50%',
                                      background: c.tealFill }} />}
              </span>
              <span style={{ display: 'grid', gap: 4, flex: 1 }}>
                <b style={{ fontSize: 13, fontWeight: 640 }}>{s}　{stepMeaning(s)}</b>
                <small style={{ fontSize: 11.5, lineHeight: 1.65,
                                color: body(s) ? c.weaker : c.warmText }}>
                  {body(s) ?? 'この段は、まだ書かれていません'}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <Spacer h={12} />
      <Warn>1回に動かせるのは1段までです。上下の段は選べません。</Warn>

      {pick !== null && pick > q.now && !body(pick) && (
        <>
          <Spacer h={11} />
          <Card tone="warm"><div style={{ ...t.small, color: c.warmDeep }}>
            この段が何を指すかが、まだ書かれていません。
            <b style={{ fontWeight: 660 }}>先に書かないと上げられません。</b>
          </div></Card>
        </>
      )}

      <Spacer h={16} />
      <label style={{ display: 'grid', gap: 7 }}>
        <span style={t.field}>見たこと（いつ、どの場面で、何を見たか）</span>
        <textarea value={seen} onChange={(e) => setSeen(e.target.value)} rows={3}
          style={{ ...area, minHeight: 62 }} />
      </label>
      <Spacer h={12} />
      <label style={{ display: 'grid', gap: 7 }}>
        <span style={t.field}>なぜその段か（上の定義に、どう当たるか）</span>
        <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3}
          style={{ ...area, minHeight: 62 }} />
      </label>
      <div style={{ marginTop: 8, ...t.small, color: c.weaker }}>
        この2つは、本人の画面にそのまま出ます。
        {seen.trim().length < 30 && ` 見たこと あと${30 - seen.trim().length}字。`}
        {why.trim().length < 30 && ` 判断 あと${30 - why.trim().length}字。`}
      </div>

      {err && (
        <div style={{ marginTop: 11, ...t.small, color: c.warmText }}>{err}</div>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <Button disabled={!ok || busy} onClick={async () => {
          setBusy(true); setErr(null);
          const e = await adjustStep({
            staff_id: q.staffId, param_id: q.param.id, value: pick!,
            seen, why, levelBody: body(pick!),
          });
          setBusy(false);
          if (e) setErr(e); else q.onDone();
        }}>{pick ?? ''} にする</Button>
        <Button variant="ghost" onClick={q.onClose}>やめる</Button>
      </div>
    </Sheet>
  );
}

// 段の定義を書く。段の意味（固定文）は編集できない
function WriteLevelSheet(q: {
  param: Param; area: Axis; step: number; onClose: () => void; onDone: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Sheet onClose={q.onClose}>
      <h2 style={{ ...t.h2, margin: 0 }}>
        {q.area.label} / {q.param.name} の {q.step} は、どういうことですか。
      </h2>

      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: r.input,
                    background: c.flat, fontSize: 13, fontWeight: 640 }}>
        {q.step}　{stepMeaning(q.step)}
      </div>

      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
        style={{ ...area, marginTop: 12, minHeight: 76 }} />
      <div style={{ marginTop: 8, ...t.small, color: c.weaker, lineHeight: 1.8 }}>
        この行で「{stepMeaning(q.step)}」とは、具体的に何ができることですか。
        次にここへ上がる人が、これを読んで動きます。
        {body.trim().length < 30 && ` あと${30 - body.trim().length}字。`}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <Button disabled={busy || body.trim().length < 30} onClick={async () => {
          setBusy(true);
          const ok = await writeLevel(q.param.id, q.step, body);
          setBusy(false); if (ok) q.onDone();
        }}>書く</Button>
        <Button variant="ghost" onClick={q.onClose}>やめる</Button>
      </div>
    </Sheet>
  );
}

const SOURCE_TEXT: Record<string, string> = {
  initial_estimate: '導入時の初期値',
  cp_reached:       'Checkpoint に到達',
  support_review:   'Support の確認',
  support_adjust:   'Support が調整',
  mgmt_adjust:      '運営者が調整',
  computed:         '自動',
};

// 行を足すシート。名称とソースが揃うまで追加ボタンは無効
function AddParamSheet(q: {
  axisId: string; axisName: string; storeCommon?: boolean;
  onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [srcs, setSrcs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ok = name.trim() && srcs.length > 0;

  return (
    <Sheet onClose={q.onClose}>
      <h2 style={{ ...t.h2, margin: 0 }}>{q.axisName}に、何を足しますか。</h2>

      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="名称（例: 前髪の設計）"
        style={{ width: '100%', marginTop: 18, minHeight: 48, padding: '0 15px',
                 borderRadius: r.input, border: `1.5px solid ${c.teal}`, background: c.input,
                 font: 'inherit', fontSize: 15, color: c.text, outline: 'none',
                 boxSizing: 'border-box' }} />

      <div style={{ marginTop: 16 }}>
        <Kicker>どこから見るか（1つ以上）</Kicker>
        <div style={{ marginTop: 10, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {Object.entries(SOURCE_LABEL).map(([k, label]) => {
            const on = srcs.includes(k);
            return (
              <button key={k}
                onClick={() => setSrcs((v) => on ? v.filter((x) => x !== k) : [...v, k])}
                style={{ padding: '9px 13px', borderRadius: r.pill, cursor: 'pointer',
                         font: 'inherit', fontSize: 11.5, fontWeight: 700,
                         color: on ? c.tealText : c.weak,
                         background: on ? c.tealBg : 'transparent',
                         border: `1px solid ${on ? c.teal : c.line}` }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.75,
                  color: ok ? c.weak : c.label }}>
        {sourcePreview(name, srcs)}
      </p>

      <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
        <Button disabled={!ok || busy} onClick={async () => {
          setBusy(true);
          const done = await addParam({ axis_id: q.axisId, name, sources: srcs },
                                      q.storeCommon);
          setBusy(false); if (done) q.onAdded();
        }}>追加する</Button>
        <Button variant="ghost" onClick={q.onClose}>やめる</Button>
      </div>

      <div style={{ marginTop: 14, ...t.small, color: c.weaker }}>
        {q.storeCommon
          ? 'ここで足した行は、店舗の全員の Map に増えます。'
          : 'ここで足した行は、あなたの Map にだけ増えます。'}
      </div>
    </Sheet>
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
                    {/* 担当の同意。承諾すると active になり、Staff と Support の
                        両方に通達が届く。断るときは理由が30字以上要る */}
                    {x.assignment && !x.assignment.settled && !x.assignment.declined && (
                      <>
                        <Button variant="outline" onClick={async () => {
                          await agreeAssignment(x.assignment!.id);
                          await markRead(x.id); load();
                        }}>この担当を受ける</Button>
                        <Button variant="ghost" onClick={async () => {
                          const why = prompt(
                            `${x.assignment!.name}さんの担当を断る理由（30字以上）。\n`
                            + '本人には何も出ません。');
                          if (!why || why.trim().length < 30) return;
                          await declineAssignment(x.assignment!.id, why.trim());
                          await markRead(x.id); load();
                        }}>断る</Button>
                      </>
                    )}
                    {x.assignment?.settled && (
                      <span style={{ fontSize: 11.5, color: c.tealText, alignSelf: 'center' }}>
                        受けました
                      </span>
                    )}
                    {x.assignment?.declined && (
                      <span style={{ fontSize: 11.5, color: c.warmText, alignSelf: 'center' }}>
                        成立しませんでした
                      </span>
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

const CATS = ['シフト・時間', '担当関係', 'Checkpointの設計', '設備・材料'] as const;

export function PostNotice(p: {
  kind: 'support_to_mgmt' | 'mgmt_to_all' | 'mgmt_to_support';
  draft?: { title: string; body: string };
  targets?: { id: string; display_name: string }[];   // 対象に入れられるのは担当スタッフだけ
  onIndividual?: () => void;                          // Management だけ。個別通達へ
  onBack: () => void; nav?: NavSlots;
}) {
  const [title, setTitle] = useState(p.draft?.title ?? '');
  const [body, setBody] = useState(p.draft?.body ?? '');
  const [cat, setCat] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const subjectName = p.targets?.find((x) => x.id === subject)?.display_name;

  const T = {
    support_to_mgmt: { h: '現場の判断を、設計の議題に上げます。', r: 'Staffには表示されません' },
    mgmt_to_all: { h: '全員に、同じ文面が届きます。', r: '宛先は絞れません' },
    mgmt_to_support: { h: '指導者へ、傾向として渡します。', r: '返答文は引用できません' },
  }[p.kind];

  return (
    <Screen {...p.nav} bar={<Bar title="通達をつくる" right={T.r} />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          <Button disabled={!title.trim() || !body.trim() || busy || done
                            || (p.kind === 'support_to_mgmt' && !cat)} onClick={async () => {
            setBusy(true);
            const ok = await postNotice({
              kind: p.kind, title: title.trim(), body: body.trim(),
              category: cat ?? undefined, subject_user_id: subject ?? undefined,
            });
            setBusy(false); if (ok) setDone(true);
          }}>{done ? '送信しました' : busy ? '送っています…' : '通達する'}</Button>
          {p.onIndividual && (
            <Button variant="outline" onClick={p.onIndividual}>個別通達（Support宛）</Button>
          )}
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>
      <H>{T.h}</H>

      {/* Staff には表示されない、を図形で示す（Support 3）*/}
      {p.kind === 'support_to_mgmt' && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="11" height="9" viewBox="0 0 11 9" aria-hidden>
            <rect x=".5" y=".5" width="10" height="8" rx="1.5"
                  fill="none" stroke={c.label} />
            <path d="M.5 1.5 5.5 5 10.5 1.5" fill="none" stroke={c.label} />
          </svg>
          <span style={{ fontSize: 11, color: c.weaker }}>Staffには表示されません</span>
        </div>
      )}

      {/* 種類チップ */}
      {p.kind === 'support_to_mgmt' && (
        <div style={{ marginTop: 16 }}>
          <Kicker>種類</Kicker>
          <div style={{ marginTop: 10, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {CATS.map((k) => (
              <button key={k} onClick={() => setCat(k)}
                style={{ padding: '9px 13px', borderRadius: r.pill, cursor: 'pointer',
                         font: 'inherit', fontSize: 11.5, fontWeight: 700,
                         color: cat === k ? c.tealText : c.weak,
                         background: cat === k ? c.tealBg : 'transparent',
                         border: `1px solid ${cat === k ? c.teal : c.line}` }}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      <Spacer h={18} />
      <div style={{ display: 'grid', gap: 12 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="題名"
          style={{ width: '100%', minHeight: 50, padding: '0 15px', borderRadius: r.input,
                   border: `1.5px solid ${c.teal}`, background: c.input, font: 'inherit',
                   fontSize: 16, fontWeight: 620, outline: 'none' }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="本文"
          style={{ ...area, minHeight: 120 }} />
      </div>
      {/* 対象（任意）。入れられるのは担当スタッフだけ。
          本人について書いたものが本人に見えない状態は、この設計では作らない */}
      {p.kind === 'support_to_mgmt' && p.targets && p.targets.length > 0 && (
        <>
          <Spacer h={16} />
          <div style={{ padding: '14px 16px', borderRadius: r.input,
                        border: `1.5px dashed ${c.dash}` }}>
            <div style={t.field}>対象（任意）</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {p.targets.map((x) => (
                <button key={x.id} onClick={() => setSubject(subject === x.id ? null : x.id)}
                  style={{ padding: '8px 12px', borderRadius: r.pill, cursor: 'pointer',
                           font: 'inherit', fontSize: 11.5, fontWeight: 700,
                           color: subject === x.id ? c.tealText : c.weak,
                           background: subject === x.id ? c.tealBg : 'transparent',
                           border: `1px solid ${subject === x.id ? c.teal : c.line}` }}>
                  {x.display_name}
                </button>
              ))}
            </div>
            <p style={{ margin: '11px 0 0', fontSize: 12, lineHeight: 1.7, color: c.weaker }}>
              {subject
                ? <><b style={{ fontWeight: 660, color: c.text }}>入れると、この通達は{subjectName}さんにも見えます。</b>本人に読まれる前提で書いてください。</>
                : '対象を入れないと、Management の2名だけが読みます。'}
            </p>
          </div>
        </>
      )}

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

// ============================================================
// 共有シート（AC ＋ 第2便 M-1）
//
// 上から: 向かっている先（CP） → どの能力に効いたか（Map の行）。
// CP は選ばせない。既定で入っていて、外せるだけ。
// 反映先を他人が決めると、Map は他人の評価表になる。確定は本人。
// ============================================================

export function ShareSheet(p: {
  recordId: string; onClose: () => void; onShared: (salon: boolean) => void;
}) {
  const [tg, setTg] = useState<ShareTargets | null>(null);
  const [withCp, setWithCp] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { shareTargets().then(setTg); }, []);

  const toggle = (id: string) =>
    setPicked((s) => s.includes(id) ? s.filter((x) => x !== id)
                   : s.length >= 3 ? s : [...s, id]);

  const nameOf = (id: string) => {
    const x = tg?.params.find((v) => v.id === id);
    return x?.name ?? '';
  };

  const go = async (salon: boolean) => {
    setBusy(true);
    const ok = await shareWith({
      record_id: p.recordId,
      checkpoint_id: withCp && tg?.cp ? tg.cp.id : null,
      param_ids: picked, salon,
    });
    setBusy(false);
    if (ok) p.onShared(salon);
  };

  return (
    <Sheet onClose={p.onClose}>
      <h2 style={{ ...t.h2, margin: 0 }}>この記録は、どこに効きましたか。</h2>

      {/* ---- 向かっている先。未到達CPが無いときは出さない ---- */}
      {tg?.cp && (
        <button onClick={() => setWithCp((v) => !v)}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                   marginTop: 18, padding: '14px 16px', borderRadius: 14,
                   background: withCp ? c.tealBg : c.flat,
                   border: `1px solid ${withCp ? c.tealLine : c.cardLine}` }}>
          <div style={{ ...t.kicker, color: withCp ? c.tealText : c.label }}>向かっている先</div>
          <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ flex: 1, fontSize: 14, fontWeight: 640,
                        color: withCp ? c.tealDeep : c.weak }}>
              {tg.cp.code} · {tg.cp.title}
            </b>
            <span style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto',
                           display: 'grid', placeItems: 'center', fontSize: 11,
                           fontWeight: 700, color: '#fff',
                           background: withCp ? c.tealFill : 'transparent',
                           border: withCp ? 0 : `1.5px solid ${c.toggleOff}` }}>
              {withCp ? '✓' : ''}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.65, color: c.weak }}>
            {withCp
              ? <>紐づけると、この記録は <b style={{ fontWeight: 660 }}>{tg.cp.code} の条件に数えられます。</b></>
              : 'どの Checkpoint にも紐づけません。この記録は残ります。'}
          </div>
        </button>
      )}

      {/* ---- どの能力に効いたか ---- */}
      <div style={{ marginTop: 18 }}>
        <Kicker>効いたところ（3つまで）</Kicker>
        <div style={{ marginTop: 11, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {picked.map((id) => (
            <button key={id} onClick={() => toggle(id)}
              style={{ padding: '8px 12px', borderRadius: r.pill, cursor: 'pointer',
                       font: 'inherit', fontSize: 11.5, fontWeight: 700, color: c.tealText,
                       background: c.tealBg, border: `1px solid ${c.teal}` }}>
              {nameOf(id)} ×
            </button>
          ))}
          {picked.length < 3 && (
            <button onClick={() => setMore((v) => !v)}
              style={{ padding: '8px 12px', borderRadius: r.pill, cursor: 'pointer',
                       font: 'inherit', fontSize: 11.5, fontWeight: 700, color: c.weak,
                       background: 'transparent', border: `1.5px dashed ${c.dash}` }}>
              ＋ 行から選ぶ
            </button>
          )}
        </div>

        {more && (
          <div style={{ marginTop: 11, display: 'grid', gap: 7,
                        maxHeight: 210, overflow: 'auto' }}>
            {(tg?.params ?? []).filter((x) => !picked.includes(x.id)).map((x) => (
              <button key={x.id} onClick={() => { toggle(x.id); setMore(false); }}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         padding: '11px 14px', borderRadius: r.input, fontSize: 13,
                         background: c.card, border: `1px solid ${c.cardLine}` }}>
                {x.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.7, color: c.weaker }}>
        ここは担当のSupportが書き換えません。あとから変えられます。
      </p>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <Button disabled={busy} onClick={() => go(false)}>共有する</Button>
        <Button variant="outline" disabled={busy} onClick={() => go(true)}>
          サロンにも出す（氏名なし）
        </Button>
        <Button variant="ghost" onClick={p.onClose}>やめる</Button>
      </div>
    </Sheet>
  );
}

// ============================================================
// Checkpoint を作る（Support）— 条件と、到達したら次に問うこと
//
// Support に JSON は書かせない。種類3択＋件数＋自動生成の label。
// 条件は3つまで — 4つ以上は CP を2つに割るサイン。
//
// 次の問いは、ここで一緒に書く。到達の瞬間には何も生成しない。
// 「到達したら次に何を問うか」を書けない CP は、条件の切り方がまだ荒い CP。
// ここで詰まるほうが、到達の瞬間に詰まるよりいい。
// ============================================================

export function NewCheckpoint(p: {
  journeyId: string; nextCode: string; existing: string[];
  onDone: () => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [conds, setConds] = useState<CondDraft[]>([]);
  const [qs, setQs] = useState<Record<string, NextQDraft>>({
    as_is:       { kind: 'as_is',       body: '', reason: '' },
    smaller:     { kind: 'smaller',     body: '', reason: '' },
    shift_area:  { kind: 'shift_area',  body: '', reason: '' },
  });
  const [busy, setBusy] = useState(false);

  const add = (kind: CondKind) => {
    if (conds.length >= 3) return;
    const base = { kind, count: kind === 'cp_reached' ? 1 : 3,
                   field: 'misjudgment' as const, code: p.existing[0] ?? 'CP1' };
    setConds((s) => [...s, { id: `c${s.length + 1}`, ...base, label: condLabel(base) }]);
  };

  const patch = (i: number, v: Partial<CondDraft>) =>
    setConds((s) => s.map((x, k) => {
      if (k !== i) return x;
      const next = { ...x, ...v };
      // label は自動で作り直す。手で直したものは触らない
      if (v.label === undefined && x.label === condLabel(x)) next.label = condLabel(next);
      return next;
    }));

  const ok = title.trim() && conds.length > 0
          && qs.as_is.body.trim() && qs.as_is.reason.trim();

  return (
    <Screen bar={<Bar title="Checkpoint を置く" right={p.nextCode} />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <Button disabled={!ok || busy} onClick={async () => {
            setBusy(true);
            const id = await createCheckpoint({
              journey_id: p.journeyId, code: p.nextCode, title: title.trim(),
              conditions: conds, questions: Object.values(qs),
            });
            setBusy(false);
            if (id) p.onDone();
          }}>この Checkpoint を置く</Button>
          <Button variant="ghost" onClick={p.onCancel}>やめる</Button>
        </div>
      }>

      <H>何を確かめますか。</H>
      <Spacer h={18} />
      <textarea value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="骨格が違っても、同じ基準で似合わせを説明できる"
        style={{ ...area, minHeight: 68 }} />

      {/* ---- 条件（3つまで）---- */}
      <Spacer />
      <Kicker>通過の条件（3つまで）</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 11 }}>
        {conds.map((d, i) => (
          <Card key={d.id} tone="flat">
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <span style={t.field}>条件 {i + 1}</span>
              <button onClick={() => setConds((s) => s.filter((_, k) => k !== i))}
                style={{ background: 'transparent', border: 0, cursor: 'pointer',
                         font: 'inherit', fontSize: 11.5, color: c.weaker }}>外す</button>
            </div>

            <div style={{ marginTop: 11, display: 'grid', gap: 9 }}>
              {d.kind === 'record_field' && (
                <select value={d.field}
                  onChange={(e) => patch(i, { field: e.target.value as CondDraft['field'] })}
                  style={selectStyle}>
                  {Object.entries(FIELD_LABEL).map(([k, v]) =>
                    <option key={k} value={k}>{v}</option>)}
                </select>
              )}
              {d.kind === 'cp_reached' ? (
                <select value={d.code} onChange={(e) => patch(i, { code: e.target.value })}
                  style={selectStyle}>
                  {p.existing.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: c.weak }}>件数</span>
                  <input type="number" min={1} max={20} value={d.count}
                    onChange={(e) => patch(i, { count: Math.max(1, +e.target.value || 1) })}
                    style={{ ...selectStyle, width: 84 }} />
                </label>
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 11, color: c.weaker }}>本人の画面に出る文</span>
                <input value={d.label} onChange={(e) => patch(i, { label: e.target.value })}
                  style={selectStyle} />
              </label>
            </div>
          </Card>
        ))}

        {conds.length < 3 ? (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {([['shared_records', '記録が n件'],
               ['record_field', '特定の欄が埋まった記録が n件'],
               ['cp_reached', '別のCPに到達']] as [CondKind, string][])
              .filter(([k]) => k !== 'cp_reached' || p.existing.length > 0)
              .map(([k, label]) => (
                <button key={k} onClick={() => add(k)}
                  style={{ padding: '9px 13px', borderRadius: r.pill, cursor: 'pointer',
                           font: 'inherit', fontSize: 11.5, fontWeight: 700, color: c.weak,
                           background: 'transparent', border: `1.5px dashed ${c.dash}` }}>
                  ＋ {label}
                </button>
              ))}
          </div>
        ) : (
          <div style={{ ...t.small, color: c.weaker }}>
            条件は3つまでです。4つ以上要るなら、Checkpoint を2つに割るほうが早く進みます。
          </div>
        )}
      </div>

      {/* ---- 到達したら、次に問うこと ---- */}
      <Spacer />
      <Kicker>到達したら、次に問うこと</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
        {([['as_is', 'そのまま', true],
           ['smaller', '小さくする', false],
           ['shift_area', '領域を変える', false]] as [NextQDraft['kind'], string, boolean][])
          .map(([k, label, req]) => (
            <div key={k}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: 13, fontWeight: 640 }}>{label}</b>
                <span style={{ fontSize: 10.5, fontWeight: 700,
                               color: req ? c.warmText : c.label }}>
                  {req ? '必須' : '任意'}
                </span>
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <input value={qs[k].body}
                  onChange={(e) => setQs((s) => ({ ...s, [k]: { ...s[k], body: e.target.value } }))}
                  placeholder="問い" style={selectStyle} />
                <input value={qs[k].reason}
                  onChange={(e) => setQs((s) => ({ ...s, [k]: { ...s[k], reason: e.target.value } }))}
                  placeholder="なぜこの問いか" style={selectStyle} />
              </div>
            </div>
          ))}
      </div>
      <div style={{ marginTop: 12, ...t.small, color: c.weaker }}>
        ここに書いたものが、到達したときに選択肢として出ます。空の欄は、そのときに書けます。
      </div>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 次の問いを調整（Support 4）
//
// 生成していないので「GROWTH OSから」とは書かない。
// ここに出るのは、この Checkpoint に書いてあったものだけ。
// ============================================================

export function NextQuestion(p: {
  cpId: string; journeyId: string; nextCode: string;
  onDone: () => void; onBack: () => void; nav?: NavSlots;
}) {
  const [qs, setQs] = useState<Awaited<ReturnType<typeof nextQuestions>> | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { nextQuestions(p.cpId).then(setQs); }, [p.cpId]);

  const KIND: Record<string, string> = {
    as_is: 'そのまま', smaller: '小さくする', shift_area: '領域を変える',
  };
  const chosen = qs?.find((x) => x.id === pick);
  const needReason = chosen && chosen.adjust_kind !== 'as_is';
  const ok = chosen && title.trim() && (!needReason || reason.trim().length >= 30);

  return (
    <Screen {...p.nav} bar={<Bar title="次の問い" right={p.nextCode} />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <Button disabled={!ok || busy} onClick={async () => {
            if (!chosen) return;
            setBusy(true);
            const done = await deliverQuestion({
              id: chosen.id, journey_id: p.journeyId,
              kind: (chosen.adjust_kind ?? 'as_is') as 'as_is' | 'smaller' | 'shift_area',
              reason: reason.trim(), code: p.nextCode, title: title.trim(),
            });
            setBusy(false);
            if (done) p.onDone();
          }}>この問いで渡す</Button>
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>

      <H>次に、何を問いますか。</H>

      <Spacer h={18} />
      {qs === null ? <P>読み込んでいます…</P> : (
        <div style={{ display: 'grid', gap: 9 }}>
          {qs.map((x) => (
            <button key={x.id} onClick={() => { setPick(x.id); setTitle(x.body); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '15px 17px', borderRadius: r.card,
                       background: pick === x.id ? c.tealBg : c.card,
                       border: `1px solid ${pick === x.id ? c.teal : c.cardLine}` }}>
              {/* 生成していないものを Growth OS の名で出さない */}
              <div style={{ ...t.kicker, color: pick === x.id ? c.tealText : c.label }}>
                この Checkpoint に書いてあった問い · {KIND[x.adjust_kind ?? 'as_is']}
              </div>
              <div style={{ marginTop: 9, fontSize: 14, fontWeight: 640,
                            color: pick === x.id ? c.tealDeep : c.text }}>{x.body}</div>
              <p style={{ margin: '7px 0 0', ...t.small, color: c.weak }}>{x.reason}</p>
            </button>
          ))}
          {qs.length === 0 && (
            <Card tone="flat"><div style={{ ...t.small, color: c.weak }}>
              この Checkpoint には、次の問いが書かれていません。
              条件の切り方がまだ荒いのかもしれません。ここで書いて渡せます。
            </div></Card>
          )}
        </div>
      )}

      {pick && (
        <>
          <Spacer />
          <label style={{ display: 'grid', gap: 7 }}>
            <span style={t.field}>渡す問い（直せます）</span>
            <textarea value={title} onChange={(e) => setTitle(e.target.value)}
              style={{ ...area, minHeight: 62 }} />
          </label>

          {needReason && (
            <>
              <Spacer h={14} />
              <label style={{ display: 'grid', gap: 7 }}>
                <span style={t.field}>調整した理由（30字以上）</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  style={{ ...area, minHeight: 68 }} />
              </label>
              <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.7, color: c.weaker }}>
                この理由は、本人の画面にそのまま出ます。
                {reason.trim().length < 30 && ` あと${30 - reason.trim().length}字。`}
              </div>
            </>
          )}
        </>
      )}
      <Spacer />
    </Screen>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '0 13px', borderRadius: r.input,
  border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
  fontSize: 13.5, color: c.text, outline: 'none', boxSizing: 'border-box',
};
