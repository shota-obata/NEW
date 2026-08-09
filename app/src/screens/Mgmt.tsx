// Growth OS Mobile — Management（Home ／ 閲覧）
//
// 運営者は「人」ではなく「設計」を扱う。相談の本文も習熟の細目も、
// ここには経路が無い（RLS で返らない）。
//
// 「閲覧」は監査ログの唯一の例外。周知・在籍者全員の同意・施行日の
// 3つが揃うまで1行も返らない（就業規則 第6条第3項）。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer , type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { consentGap, supportQuality, gateOpen, policyState, storageForecast,
         rollout, issueCode, issuePin, unlock, devicesOf, revokeDevice,
         slotsOfWeek, openSlot, allAssignments, proposeEnd, saveSettings, fixables,
         businessHours, announcePolicy, policyNudgeCount, nudgeUnconsented, orgSize,
         hoursNoticeBody, saveHours, deletionRequests, approveDeletion, cancelDeletion,
         metricsFor, postIndividual, supports,
         type Hours, type Metric, type MetricKey,
         type Quality, type Rollout, type Device, type Slots, type Fix } from '../lib/mgmt';
import { storeSettings, type StoreSettings } from '../lib/core';

const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';

export function MgmtHome(p: {
  name: string | null; onQuality: () => void; onSettings: () => void;
  onDesign: () => void; nav?: NavSlots;
}) {
  const [fix, setFix] = useState<Fix[] | null>(null);
  const [gap, setGap] = useState<{ total: number; consented: number } | null>(null);
  const [pol, setPol] = useState<{ version: string; effective_from: string; announced_at: string | null } | null>(null);
  const [st, setSt] = useState<{ bytes_used: number; quota_bytes: number; pct: number; days_left: number | null } | null>(null);

  useEffect(() => {
    fixables().then(setFix);
    consentGap().then((g) => g && setGap(g));
    policyState().then(setPol);
    storageForecast().then(setSt);
  }, []);

  const left = gap ? gap.total - gap.consented : null;
  const past = pol ? new Date(pol.effective_from) <= new Date() : false;

  return (
    <Screen {...p.nav} bar={<Bar title="Management" right={p.name ?? undefined} />}
      footer={<Button variant="ghost" onClick={p.onSettings}>設定</Button>}>

      <H>設計で直せることを見ます。</H>
      <P>ここには、相談の本文も習熟の細目もありません。人ではなく体制を扱う場所です。</P>

      {/* 導入の進み具合 */}
      <Spacer />
      <Kicker>規定への同意</Kicker>
      <div style={{ marginTop: 12 }}>
        <Card tone={left === 0 ? 'teal' : 'plain'}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.03em',
                           color: left === 0 ? c.tealText : c.text }}>
              {gap ? `${gap.consented} / ${gap.total}` : '—'}
            </span>
            {left !== null && left > 0 && (
              <span style={{ fontSize: 13, color: c.weaker }}>未同意 {left}名</span>
            )}
          </div>
          <p style={{ margin: '10px 0 0', ...t.small,
                      color: left === 0 ? c.tealDeep : c.weak }}>
            {left === 0
              ? '全員そろっています。'
              : '誰が未同意かは表示しません。名指しできる形にすると、同意が同意でなくなります。催促は全員宛の通達で行ってください。'}
          </p>
        </Card>
      </div>

      {/* 閲覧のゲート */}
      <Spacer />
      <Kicker>指導内容の確認（第6条）</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        <Cond ok={!!pol?.announced_at} label="周知した"
              sub={pol?.announced_at ? '全体通達で配布済み' : 'まだ通達を出していません'} />
        <Cond ok={left === 0} label="全員が同意した"
              sub={gap ? `${gap.consented} / ${gap.total}` : '—'} />
        <Cond ok={past} label="施行日を過ぎた"
              sub={pol ? `${pol.effective_from} 施行` : '—'} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="outline" onClick={p.onQuality}>介入の質を見る</Button>
      </div>

      {/* ストレージ */}
      {st && (
        <>
          <Spacer />
          <Kicker>画像の保存容量</Kicker>
          <div style={{ marginTop: 12 }}>
            <Card tone={st.pct >= 70 ? 'warm' : 'flat'}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{st.pct}%</span>
                <span style={{ fontSize: 12, color: c.weaker }}>
                  {mb(st.bytes_used)} / {mb(st.quota_bytes)}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, marginTop: 10,
                            borderRadius: r.pill, background: c.line }}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, st.pct)}%`,
                              borderRadius: r.pill,
                              background: st.pct >= 70 ? c.warmBar : c.teal }} />
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.7, color: c.weaker }}>
                {st.days_left === null
                  ? '増え方が分かるまで、あと数週間かかります（毎晩の記録を集めています）。'
                  : `いまのペースだと、残り約 ${st.days_left} 日。`}
                {' '}記録は消せないので、いっぱいになる前に有料枠へ移ります。
              </p>
            </Card>
          </div>
        </>
      )}
      {/* いま設計で直せること — 「3件」ではなく、該当するものだけ・最大3件。
          0件なら中立ボックス1つ。空カードで3枠を埋めない（第3便 W-4）*/}
      <Spacer />
      <Kicker>いま設計で直せること</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {fix === null ? <P>…</P> : fix.length === 0 ? (
          <Card tone="flat"><div style={{ fontSize: 13, lineHeight: 1.75, color: c.weak }}>
            いま、設計で直せることはありません。
          </div></Card>
        ) : fix.map((f, i) => (
          <button key={i} onClick={() => f.to === 'design' ? p.onDesign() : p.onSettings()}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                     padding: '15px 17px', borderRadius: r.card, background: c.card,
                     border: `1px solid ${c.cardLine}`, display: 'flex',
                     alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 640 }}>{f.text}</span>
            <span style={{ color: c.label, fontSize: 15 }}>›</span>
          </button>
        ))}
      </div>

      {/* 見えないもの。これは管理アプリではない */}
      <Spacer />
      <Card tone="flat">
        <Kicker>ここから見えないもの</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.9 }}>
          パーソナルスペース（個人メモ）／相談の本文／Capability Map の細目。
          <br /><b style={{ fontWeight: 660, color: c.text }}>
            これは管理アプリではないので、全部が見える状態を作りません。
          </b>
        </div>
      </Card>

      <Spacer h={8} />
    </Screen>
  );
}

const Cond = (q: { ok: boolean; label: string; sub: string }) => (
  <div style={{ padding: '14px 16px', borderRadius: r.input, display: 'grid',
                gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'start',
                background: q.ok ? c.card : c.input,
                border: `1px solid ${q.ok ? c.cardLine : c.warmLine}` }}>
    <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid',
                   placeItems: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 auto',
                   background: q.ok ? c.tealFill : 'transparent',
                   color: q.ok ? '#fff' : c.warmText,
                   border: q.ok ? 0 : `1.5px solid ${c.warmLine}` }}>
      {q.ok ? '✓' : '—'}
    </span>
    <span style={{ display: 'grid', gap: 4 }}>
      <b style={{ fontSize: 13.5, fontWeight: 640, color: q.ok ? c.text : c.warmDeep }}>{q.label}</b>
      <small style={{ fontSize: 11.5, lineHeight: 1.6, color: q.ok ? c.weaker : c.warmText }}>{q.sub}</small>
    </span>
  </div>
);

// ============================================================
// 閲覧（監査ログの唯一の例外）
// ============================================================

export function Quality(p: { onBack: () => void ; nav?: NavSlots}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Quality[]>([]);
  const [gap, setGap] = useState<{ total: number; consented: number } | null>(null);
  // 基準は店舗設定から引く。直値で書くと、設定を変えても文面が古いまま残る
  const [base, setBase] = useState(1.0);

  useEffect(() => {
    storeSettings().then((st) => st && setBase(st.response_baseline_days));
    gateOpen().then(setOpen);
    supportQuality().then(setRows);
    consentGap().then((g) => g && setGap(g));
  }, []);

  if (open === null) return (
    <Screen {...p.nav} bar={<Bar title="介入の質" />}><Spacer h={30} /><P>確認しています…</P></Screen>
  );

  if (!open) {
    const left = gap ? gap.total - gap.consented : null;
    return (
      <Screen {...p.nav} bar={<Bar title="介入の質" right="ロック中" />}
        footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
        <H>3つが揃うまで開きません。</H>
        <P>
          ここは閲覧履歴に載らない唯一の面です（就業規則 第6条第3項）。
          当人に知らせずに見る仕組みなので、先に作ってから説明する順番にしません。
          書く・伝える・同意を取る・それから開く、の順です。
        </P>
        <Spacer />
        <Warn>
          <b style={{ fontWeight: 700 }}>誰が未同意かは出しません。</b>
          名指しできる形にすると、同意が同意でなくなります。
          {left !== null && left > 0 && ` いま未同意は ${left}名です。`}
          催促は全員宛の通達で行ってください。
        </Warn>
        <Spacer />
        <Card tone="flat">
          <Kicker>第6条（指導内容の確認）</Kicker>
          <p style={{ margin: '11px 0 0', padding: '14px 15px', borderRadius: r.input,
                      background: c.input, border: `1px solid ${c.line}`,
                      fontSize: 12.5, lineHeight: 1.95, color: c.quote, whiteSpace: 'pre-line' }}>
{`1　会社は、指導の質を確保し、育成の体制を適正に保つため、指導者が従業員に対して行った返答の内容および返答までに要した日数を確認することがある。
3　第1項の確認は、対象となる従業員および指導者に対して個別に通知せず、第5条第1項の開示の対象としない。`}
          </p>
        </Card>
        <Spacer />
      </Screen>
    );
  }

  return (
    <Screen {...p.nav} bar={<Bar title="介入の質" right="Supportの返答 · 30日" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
      <div style={{ marginTop: 18, padding: '13px 15px', borderRadius: r.input,
                    background: c.tealBg, border: `1px solid ${c.tealLine}` }}>
        <b style={{ fontSize: 12.5, fontWeight: 700, color: c.tealText }}>
          就業規則 第6条第1項 · 3条件を満たしています
        </b>
      </div>

      <H>返答が、答えになっていないかを見ます。</H>
      <P>見るのは返答の作り方と速さです。記録そのものは開きません。</P>

      <Spacer />
      <Card>
        <Kicker>平均レスポンス（基準 {base} 日）</Kicker>
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          {rows.length === 0 ? (
            <div style={{ ...t.small, color: c.weaker }}>まだ返答がありません。</div>
          ) : rows.map((x) => {
            const d = x.avg_response_days;
            const slow = d !== null && d > 1.0;
            return (
              <div key={x.support_id}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 640 }}>{x.display_name}</span>
                  <span style={{ fontSize: 16, fontWeight: 700,
                                 color: d === null ? c.label : slow ? c.warmText : c.tealText }}>
                    {d === null ? '—' : `${d}日`}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 6, marginTop: 9,
                              borderRadius: r.pill, background: c.line }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${Math.min(100, (d ?? 0) / 3 * 100)}%`,
                                borderRadius: r.pill, background: slow ? c.warmBar : c.teal }} />
                  <div style={{ position: 'absolute', left: '33%', top: -4, bottom: -4,
                                width: 2, background: c.weaker }} />
                </div>
                <div style={{ marginTop: 7, fontSize: 12, color: c.weaker }}>
                  返答 {x.replies} 件
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Spacer />
      <Warn>
        <b style={{ fontWeight: 700 }}>この閲覧は当人たちに知らせません。</b>
        指導者への指示は、傾向を示す数値で行ってください。
        <b style={{ fontWeight: 700 }}>個別の返答文は引用できません</b>（第6条第5項）。
        知り得た内容を評価に用いないこと（第6条第2項）。
      </Warn>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 端末（12b）— 発行・一覧・失効
// ============================================================


export function Devices(p: { onBack: () => void ; nav?: NavSlots}) {
  const [rows, setRows] = useState<Rollout[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [devs, setDevs] = useState<Device[]>([]);
  const [issued, setIssued] = useState<{ kind: 'code' | 'pin'; value: string; who: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => rollout().then(setRows);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (open) devicesOf(open).then(setDevs); else setDevs([]); }, [open]);


  return (
    <Screen {...p.nav} bar={<Bar title="端末" right="1人3台まで" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>入れる端末を、ここで決めます。</H>
      <P>
        PINは本人の鍵、端末は場所の鍵です。両方が要ります。
        未登録の端末からは、PINが正しくても入れません。
      </P>

      {/* 発行したものは、その場で手渡すために画面に出す */}
      {issued && (
        <>
          <Spacer />
          <Card tone="teal">
            <Kicker tone="teal">
              {issued.who} · {issued.kind === 'code' ? '登録コード（15分・1回限り）' : '仮PIN'}
            </Kicker>
            <div style={{ marginTop: 12, fontSize: 34, fontWeight: 700,
                          letterSpacing: '.18em', color: c.tealDeep }}>
              {issued.value}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.7, color: c.tealText }}>
              口頭で手渡してください（メッセージに残さない）。
              {issued.kind === 'pin' && ' 本人は初回ログインで必ず変更します。'}
            </p>
            <div style={{ marginTop: 12 }}>
              <Button variant="ghost" onClick={() => setIssued(null)}>閉じる</Button>
            </div>
          </Card>
        </>
      )}

      <Spacer />
      <Kicker>導入の進み具合</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {rows === null ? <P>読み込んでいます…</P> : rows.map((x) => (
          <div key={x.id} style={{ padding: '15px 17px', borderRadius: r.card,
                background: c.card, border: `1px solid ${c.cardLine}` }}>
            <button onClick={() => setOpen(open === x.id ? null : x.id)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       border: 0, background: 'transparent', padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline',
                            justifyContent: 'space-between', gap: 10 }}>
                <b style={{ fontSize: 14, fontWeight: 660 }}>{x.display_name}</b>
                <span style={{ font: t.mono, color: c.label }}>{x.person_code}</span>
              </div>
              <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip on={x.devices > 0}>端末 {x.devices}台</Chip>
                <Chip warn={x.pin_pending}>{x.pin_pending ? '仮PIN' : 'PIN変更済'}</Chip>
                {x.locked && <Chip warn>ロック中</Chip>}
                {x.code_active && <Chip on>コード有効</Chip>}
                <Chip on={x.consented}>{x.consented ? '同意済' : '未同意'}</Chip>
              </div>
            </button>

            {open === x.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.lineIn}` }}>
                <div style={{ display: 'grid', gap: 9 }}>
                  <Button variant="outline" disabled={busy || x.devices >= 3}
                    onClick={async () => {
                      setBusy(true);
                      const v = await issueCode(x.id, x.store_code);
                      setBusy(false); load();
                      if (v) setIssued({ kind: 'code', value: v, who: x.display_name });
                    }}>
                    {x.devices >= 3 ? '上限3台。先に失効させてください' : '登録コードを発行'}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={async () => {
                    setBusy(true);
                    const v = await issuePin(x.id);
                    setBusy(false); load();
                    if (v) setIssued({ kind: 'pin', value: v, who: x.display_name });
                  }}>仮PINを再発行</Button>
                  {x.locked && (
                    <Button variant="outline" disabled={busy} onClick={async () => {
                      setBusy(true); await unlock(x.id); setBusy(false); load();
                    }}>ロックを解除</Button>
                  )}
                </div>

                {devs.length > 0 && (
                  <div style={{ marginTop: 14, display: 'grid', gap: 9 }}>
                    {devs.map((d) => (
                      <div key={d.id} style={{ padding: '13px 15px', borderRadius: r.input,
                            background: c.flat, border: `1px solid ${c.cardLine}` }}>
                        <div style={{ fontSize: 13, fontWeight: 640 }}>{d.label}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: c.weaker }}>
                          {d.device_kind === 'shared' ? '共有端末' : '個人の端末'}
                          {' · 登録 '}{d.registered_at.slice(0, 10)}
                        </div>
                        <button disabled={busy} onClick={async () => {
                          const why = prompt('失効の理由を書いてください（本人にも監査ログにも残ります）');
                          if (!why?.trim()) return;
                          setBusy(true);
                          await revokeDevice(d.id, why.trim());
                          setBusy(false); devicesOf(x.id).then(setDevs); load();
                        }} style={{ marginTop: 10, width: '100%', minHeight: 42,
                              borderRadius: r.input, cursor: 'pointer', font: 'inherit',
                              border: `1px solid ${c.warmLine}`, background: c.warmBg,
                              color: c.warmText, fontSize: 12.5, fontWeight: 640 }}>
                          失効させる（理由が要ります）
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Spacer h={14} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          失効させても、その端末で書いた記録は消えません。失効は本人の受信ボックスと
          監査ログの両方に残ります。登録はブラウザごとなので、同じスマホでも
          別のブラウザから入ると1台ぶん使います。
        </div>
      </Card>
      <Spacer h={8} />
    </Screen>
  );
}

const Chip = (q: { children: React.ReactNode; on?: boolean; warn?: boolean }) => (
  <span style={{ padding: '4px 9px', borderRadius: r.pill, fontSize: 10.5, fontWeight: 700,
                 background: q.warn ? c.warmBg : q.on ? c.tealBg : c.flat,
                 color: q.warn ? c.warmText : q.on ? c.tealText : c.weaker,
                 border: `1px solid ${q.warn ? c.warmLine : q.on ? c.tealLine : c.line}` }}>
    {q.children}
  </span>
);

// ============================================================
// 設計（Mgmt 2）— シフトと時間境界 ／ 担当の割り当て
// ============================================================

export function Design(p: {
  onQuality: () => void; onCapDefs: () => void; onBack: () => void; nav?: NavSlots;
}) {
  const [slots, setSlots] = useState<Slots[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [asg, setAsg] = useState<Awaited<ReturnType<typeof allAssignments>>>([]);

  const load = () => {
    slotsOfWeek().then((xs) => { setSlots(xs); setPick((v) => v ?? xs[0]?.staff_id ?? null); });
    openSlot().then(setOpen);
    allAssignments().then(setAsg);
  };
  useEffect(() => { load(); }, []);

  const cur = slots?.find((x) => x.staff_id === pick);
  const h = (n: number) => `${n.toFixed(1)}h`;

  return (
    <Screen {...p.nav} bar={<Bar title="設計" right={cur?.name} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="11" height="9" viewBox="0 0 11 9" aria-hidden>
          <rect x=".5" y=".5" width="10" height="8" rx="1.5" fill="none" stroke={c.label} />
          <path d="M.5 1.5 5.5 5 10.5 1.5" fill="none" stroke={c.label} />
        </svg>
        <span style={{ fontSize: 11, color: c.weaker }}>Staffには表示されません</span>
      </div>

      <H>介入を増やす前に、時間を作ります。</H>

      {/* ---- シフトと時間境界 ---- */}
      <Spacer h={18} />
      <Kicker>シフトと時間境界（今週）</Kicker>
      <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(slots ?? []).map((x) => (
          <button key={x.staff_id} onClick={() => setPick(x.staff_id)}
            style={{ padding: '8px 12px', borderRadius: r.pill, cursor: 'pointer',
                     font: 'inherit', fontSize: 11.5, fontWeight: 700,
                     color: pick === x.staff_id ? c.tealText : c.weak,
                     background: pick === x.staff_id ? c.tealBg : 'transparent',
                     border: `1px solid ${pick === x.staff_id ? c.teal : c.line}` }}>
            {x.name}
          </button>
        ))}
      </div>

      {cur && (
        <div style={{ marginTop: 14 }}>
          <Card tone={cur.secured < cur.needed ? 'warm' : 'teal'}>
            <div style={{ display: 'flex', gap: 22 }}>
              <div>
                <div style={t.field}>確保</div>
                <div style={{ marginTop: 5, fontSize: 21, fontWeight: 660 }}>{h(cur.secured)}</div>
              </div>
              <div>
                <div style={t.field}>必要</div>
                <div style={{ marginTop: 5, fontSize: 21, fontWeight: 660 }}>{h(cur.needed)}</div>
              </div>
            </div>
            {cur.secured < cur.needed && (
              <p style={{ margin: '13px 0 0', ...t.small, color: c.warmDeep }}>
                {h(cur.needed - cur.secured)} 足りていません。
              </p>
            )}
          </Card>

          <div style={{ marginTop: 12 }}>
            {open ? (
              <Button variant="outline">{open} の枠を開ける（全体通達へ）</Button>
            ) : (
              <Card tone="warm"><div style={{ ...t.small, color: c.warmDeep }}>
                営業時間の中に、空いている連続30分がありません。
                営業時間か担当量のどちらかを動かす必要があります。
              </div></Card>
            )}
          </div>
        </div>
      )}

      {/* ---- 担当の割り当て ---- */}
      <Spacer />
      <Kicker>担当の割り当て</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
        {asg.map((a) => (
          <Card key={a.id} tone={a.active ? 'plain' : a.declined_at ? 'warm' : 'flat'}>
            <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 10 }}>
              <b style={{ fontSize: 13.5, fontWeight: 660 }}>
                {a.staff?.display_name} ← {a.support?.display_name}
              </b>
              <span style={{ fontSize: 10.5, fontWeight: 700,
                             color: a.active ? c.tealText : a.declined_at ? c.warmText : c.label }}>
                {a.ended_at ? '終了' : a.declined_at ? '成立しませんでした'
                 : a.active ? (a.kind === 'temporary' ? '応援' : '担当')
                 : '同意待ち'}
              </span>
            </div>
            {a.declined_at ? (
              <p style={{ margin: '8px 0 0', ...t.small, color: c.warmDeep }}>
                {String(a.declined_reason ?? '')}
              </p>
            ) : a.active ? (
              <div style={{ marginTop: 11 }}>
                <Button variant="ghost" onClick={async () => {
                  const why = prompt('外す理由（30字以上）。Staff には何も出ません');
                  if (!why || why.trim().length < 30) return;
                  await proposeEnd(a.id, why.trim()); load();
                }}>外す（双方の同意が要ります）</Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {/* Capability Map の定義。個人の値は見えない（Mgmt Home の「見えないもの」）。
          設定の中には置かない（Management 7）ので、設計に置く */}
      <Spacer />
      <Button variant="outline" onClick={p.onCapDefs}>Capability Map の定義</Button>

      <Spacer />
      <Button variant="outline" onClick={p.onQuality}>介入の質へ</Button>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 店舗設定（Mgmt 5）
// ============================================================

export function StoreSettingsScreen(p: {
  onHours: () => void; onRetirement: () => void; onPolicy: () => void;
  onBack: () => void; nav?: NavSlots;
}) {
  const [st, setSt] = useState<StoreSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { storeSettings().then(setSt); }, []);

  const patch = async (v: Partial<StoreSettings>) => {
    if (!st) return;
    setSt({ ...st, ...v });
    if (await saveSettings(v)) { setSaved(true); setTimeout(() => setSaved(false), 1600); }
  };

  const VIS = [
    ['none', '件数も渡さない'],
    ['trend', '傾向だけ（既定）'],
    ['full', '本文まで'],
  ] as const;

  return (
    <Screen {...p.nav} bar={<Bar title="設定" right={saved ? '保存しました' : undefined} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>毎回「開くかどうか」を選ばせません。</H>

      <Spacer />
      <Kicker>相談の見え方 · Management</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {VIS.map(([k, label]) => {
          const on = st?.consultation_visibility === k;
          return (
            <button key={k} onClick={() => patch({ consultation_visibility: k })}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '13px 15px', borderRadius: r.input, display: 'flex',
                       alignItems: 'center', gap: 11,
                       background: on ? c.tealBg : c.card,
                       border: `1px solid ${on ? c.teal : c.cardLine}` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                             display: 'grid', placeItems: 'center',
                             border: `1.5px solid ${on ? c.tealFill : c.radioOff}` }}>
                {on && <span style={{ width: 9, height: 9, borderRadius: '50%',
                                      background: c.tealFill }} />}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: on ? 640 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, ...t.small, color: c.weaker }}>
        Support は固定で本文まで見えます。変更は6か月に1回で、変えたときは全員に通知します。
        <b style={{ fontWeight: 660, color: c.text }}>この値は、相談を書く画面の注記と必ず一致します。</b>
      </div>

      <Spacer />
      <Kicker>その他の基準</Kicker>
      <Card tone="flat" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gap: 8, ...t.small, color: c.weak }}>
          <div>平均レスポンスの基準　{st?.response_baseline_days ?? 1.0} 日</div>
          <div>受信ボックスの消去　　30日で自動削除</div>
          <div>催促　　　　　　　　　同じ滞留につき3回まで</div>
          <div>練習1件あたり　　　　{st?.practice_slot_minutes ?? 30} 分</div>
          <div>必要ペース（既定）　　週 {st?.required_pace_default ?? 3} 件</div>
          <div>監査ログの例外　　　　Management の「閲覧」だけ（就業規則 第6条第3項）</div>
        </div>
      </Card>

      <Spacer />
      <div style={{ display: 'grid', gap: 1, background: c.line,
                    border: `1px solid ${c.line}`, borderRadius: r.input, overflow: 'hidden' }}>
        {[['営業時間（通知が鳴る時間）', p.onHours],
          ['退職・削除時の記録', p.onRetirement],
          ['就業規則 追加条文（全9条）を読む', p.onPolicy]].map(([label, fn]) => (
          <button key={label as string} onClick={fn as () => void}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                     padding: '15px 16px', background: c.card, border: 0,
                     display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{label as string}</span>
            <span style={{ color: c.label, fontSize: 15 }}>›</span>
          </button>
        ))}
      </div>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 閲覧のロック（Mgmt 3-0）
//
// 「閲覧を開く」ボタンは置かない。
// 解錠は状態の結果であって、操作ではない —
// 押して開けるボタンがある限り押して開けるので、押せる場所を残さない。
// announced_at と notice_id を埋めるのは「規定を周知する」だけ。
// ============================================================

export function ViewLock(p: { onNudge: () => void; onPolicy: () => void; nav?: NavSlots }) {
  const [pol, setPol] = useState<{
    id: string; version: string; effective_from: string;
    announced_at: string | null; revoked_at: string | null;
  } | null>(null);
  const [gap, setGap] = useState<{ total: number; consented: number } | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    policyState().then((x) => setPol(x as typeof pol));
    consentGap().then(setGap);
    businessHours().then((x) => setStore(x?.id ?? null));
  };
  useEffect(() => { load(); }, []);

  if (!pol || !gap) return (
    <Screen {...p.nav} bar={<Bar title="閲覧" />}><Spacer h={30} /><P>確認しています…</P></Screen>
  );

  const announced = !!pol.announced_at && !pol.revoked_at;
  const allAgreed = gap.consented >= gap.total && gap.total > 0;
  const inForce   = pol.effective_from <= new Date().toISOString().slice(0, 10);
  const left      = gap.total - gap.consented;

  const CONDS: [boolean, string, string, string][] = [
    [announced, '周知した', announced ? '全体通達で周知しました' : 'まだ周知していません',
     'policy_documents.announced_at'],
    [allAgreed, '全員が同意した', `${gap.consented} / ${gap.total} 名`, 'policy_consents'],
    [inForce, '施行日を過ぎた', `施行日 ${pol.effective_from}`, 'policy_documents.effective_from'],
  ];

  return (
    <Screen {...p.nav}
      bar={<Bar title="閲覧" right={left > 0 ? `ロック中 · 未同意 ${left}名` : 'ロック中'} />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          {!announced ? (
            <Button disabled={busy} onClick={async () => {
              if (!store) return;
              setBusy(true);
              await announcePolicy(pol.id, store,
                '就業規則の追加条文（全9条）を周知します。'
                + '受信ボックスから全文を読み、同意してください。');
              setBusy(false); load();
            }}>規定を周知する（全体通達）</Button>
          ) : left > 0 ? (
            <Button onClick={p.onNudge}>未同意の {left}名へ通達を出す</Button>
          ) : null}
          <Button variant="ghost" onClick={p.onPolicy}>規定の全文を読む</Button>
        </div>
      }>

      <H>3つが揃うまで開きません。</H>

      <Spacer h={20} />
      <div style={{ display: 'grid', gap: 1, background: c.line,
                    border: `1px solid ${c.line}`, borderRadius: r.card, overflow: 'hidden' }}>
        {CONDS.map(([ok, head, now, col]) => (
          <div key={head} style={{ padding: '15px 16px', display: 'flex', gap: 12,
                                   background: c.card,
                                   borderLeft: ok ? 0 : `2px solid ${c.warmLine}` }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto',
                           display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                           color: ok ? '#fff' : c.label,
                           background: ok ? c.tealFill : 'transparent' }}>{ok ? '✓' : '—'}</span>
            <span style={{ display: 'grid', gap: 4, flex: 1 }}>
              <b style={{ fontSize: 13.5, fontWeight: 640 }}>{head}</b>
              <small style={{ fontSize: 11.5, color: c.weaker }}>{now}</small>
              <code style={{ font: t.mono, fontSize: 10.5, color: c.label }}>{col}</code>
            </span>
          </div>
        ))}
      </div>

      {/* 誰が未同意かは出さない */}
      <Spacer h={16} />
      <Card tone="warm">
        <div style={{ ...t.small, color: c.warmDeep }}>
          <b style={{ fontWeight: 660 }}>誰が未同意かは出しません。</b>
          {' '}名指しにできてしまうと、同意が同意でなくなります。
        </div>
      </Card>

      <Spacer h={12} />
      <Card>
        <Kicker>就業規則 追加条文 第6条</Kicker>
        <div style={{ marginTop: 11, ...t.small, color: c.weak, lineHeight: 1.95 }}>
          第1項　運営者は、指導の質を確認する目的に限り、指導者の返答を閲覧できる。
          <br />第3項　前項の閲覧は、第5条第1項の開示の対象としない。
          <br />第7項　運営者は、いつでもこの確認を停止できる。停止したときは全員に通達する。
        </div>
      </Card>

      <Spacer h={14} />
      <div style={{ ...t.small, color: c.weaker, lineHeight: 1.8 }}>
        3つが揃うと、この画面は自動で開きます。
        <b style={{ fontWeight: 660, color: c.text }}>飛び越えるボタンは置いていません。</b>
      </div>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 未同意者への催促（Mgmt 3-1 / 14a）
// ============================================================

export function PolicyNudge(p: { onBack: () => void; nav?: NavSlots }) {
  const [pol, setPol] = useState<{ id: string; version: string } | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [org, setOrg] = useState<{ people: number; stores: number } | null>(null);
  const [body, setBody] = useState(
    '就業規則の追加条文について、まだ同意が入っていない方がいます。\n'
    + '受信ボックスから全文を読み、内容を確かめたうえで決めてください。');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const load = () => {
    policyState().then(async (x) => {
      const d = x as { id: string; version: string } | null;
      setPol(d);
      if (d) setN(await policyNudgeCount(d.id));
    });
    businessHours().then((x) => setStore(x?.id ?? null));
    orgSize().then(setOrg);
  };
  useEffect(() => { load(); }, []);

  const spent = n >= 3;

  return (
    <Screen {...p.nav} bar={<Bar title="催促" right={sent ? '送信しました' : '全体通達 · 下書き'} />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          {spent && (
            <div style={{ fontSize: 12.5, lineHeight: 1.8, color: c.weak }}>
              <b style={{ fontWeight: 660, color: c.text }}>3回出しました。これ以上は通達で届きません。</b>
              <br />残っている方には、直接お伝えください。
            </div>
          )}
          <Button disabled={spent || busy || sent || !body.trim()} onClick={async () => {
            if (!pol || !store) return;
            setBusy(true);
            const ok = await nudgeUnconsented(pol.id, store, body.trim());
            setBusy(false); if (ok) { setSent(true); load(); }
          }}>{sent ? '送信しました' : '全員に通達する'}</Button>
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>

      <H>名指しにしないで、もう一度知らせます。</H>

      <Spacer h={18} />
      <Card tone="teal">
        <Kicker tone="teal">
          全体通達{org ? ` · 全社${org.people}名（${org.stores}店舗）` : ''} · {n}/3回
        </Kicker>
        <div style={{ marginTop: 11, fontSize: 14.5, fontWeight: 640, color: c.tealDeep }}>
          就業規則 追加条文への同意のお願い
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
          style={{ width: '100%', marginTop: 11, padding: '12px 14px', borderRadius: r.input,
                   border: `1px solid ${c.tealLine}`, background: c.input, font: 'inherit',
                   fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                   resize: 'vertical', boxSizing: 'border-box' }} />
        <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
          誰が未確認かは、この通達からも分かりません。
        </p>
      </Card>

      {/* この画面で選べないこと */}
      <Spacer />
      <div style={{ display: 'grid', gap: 8 }}>
        {['宛先を絞る', '人数を書く', '期限を切る'].map((x) => (
          <Card key={x} tone="warm">
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.warmText }}>×</span>
              <span style={{ ...t.small, color: c.warmDeep }}>{x}</span>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 12, ...t.small, color: c.weaker }}>
        催促は同じ版につき3回までです。
      </div>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 営業時間（14c）— 通知が鳴る時間
//
// これは店舗の営業日であって、個人の勤務日ではない。
// ============================================================

const DAYS: [string, string][] = [
  ['mon', '月'], ['tue', '火'], ['wed', '水'], ['thu', '木'],
  ['fri', '金'], ['sat', '土'], ['sun', '日'],
];

export function BusinessHours(p: { onBack: () => void; nav?: NavSlots }) {
  const [id, setId] = useState<string | null>(null);
  const [h, setH] = useState<Hours>({});
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    businessHours().then((x) => {
      if (!x) return;
      setId(x.id); setH(x.hours);
      setBody(hoursNoticeBody(x.hours, new Date()));
    });
  }, []);

  const set = (k: string, v: { open: string; close: string } | null) => {
    const next = { ...h, [k]: v };
    setH(next); setBody(hoursNoticeBody(next, new Date()));
  };
  const openDays = DAYS.filter(([k]) => h[k]).length;

  return (
    <Screen {...p.nav} bar={<Bar title="営業時間" right="通知はこの中でだけ" />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <Button disabled={!id || busy} onClick={async () => {
            if (!id) return;
            setBusy(true); await saveHours(id, h, body); setBusy(false); p.onBack();
          }}>保存して全員に通知する</Button>
          <Button variant="ghost" onClick={p.onBack}>やめる</Button>
        </div>
      }>

      <H>鳴らしていい時間を決めます。</H>

      <Spacer h={18} />
      <Kicker>曜日 · 営業 {openDays}日</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {DAYS.map(([k, ja]) => {
          const on = !!h[k];
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '11px 13px', borderRadius: r.input,
                                  background: on ? c.tealBg : c.flat,
                                  border: `1px solid ${on ? c.teal : c.toggleOff}` }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, flex: '0 0 auto',
                             display: 'grid', placeItems: 'center', fontSize: 12,
                             fontWeight: 700, background: c.card,
                             color: on ? c.tealText : c.weaker }}>{ja}</span>

              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {on ? (
                  <>
                    <input type="time" value={h[k]!.open}
                      onChange={(e) => set(k, { ...h[k]!, open: e.target.value })}
                      style={timeStyle} />
                    <span style={{ color: c.weaker }}>–</span>
                    <input type="time" value={h[k]!.close}
                      onChange={(e) => set(k, { ...h[k]!, close: e.target.value })}
                      style={timeStyle} />
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: c.weaker }}>定休日</span>
                )}
              </span>

              <button onClick={() => set(k, on ? null : { open: '10:00', close: '19:00' })}
                style={{ width: 40, height: 24, borderRadius: r.pill, flex: '0 0 auto',
                         padding: 3, display: 'flex', border: 0, cursor: 'pointer',
                         justifyContent: on ? 'flex-end' : 'flex-start',
                         background: on ? c.tealFill : c.toggleOff }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
              </button>
            </div>
          );
        })}
      </div>

      <Spacer />
      <Card tone="flat">
        <Kicker>この設定が効くもの</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.95 }}>
          催促の配信時刻 ／ Growth OS の提案 ／ 通知の保留（時間外は翌営業時間に回す）
          ／ 必要ペースの分母 ／ 記録画面の1行 ／ 空き枠の候補
        </div>
      </Card>

      <Spacer h={12} />
      <Card tone="flat">
        <Kicker>定休日の練習</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak }}>
          定休日でも記録は書けます。ただし会社が求めるものではありません。
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['定休日', '本人希望', '必要ペースには数えない'].map((x) => (
            <span key={x} style={{ padding: '5px 10px', borderRadius: r.pill, fontSize: 10.5,
                                   fontWeight: 700, color: c.warmText, background: c.warmBg,
                                   border: `1px solid ${c.warmLine}` }}>{x}</span>
          ))}
        </div>
      </Card>

      <Spacer h={12} />
      <Card tone="warm">
        <div style={{ ...t.small, color: c.warmDeep }}>
          これは店舗の営業日です。<b style={{ fontWeight: 660 }}>個人の勤務日ではありません。</b>
        </div>
      </Card>

      <Spacer />
      <label style={{ display: 'grid', gap: 7 }}>
        <span style={t.field}>全員に届く文（直せます）</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10}
          style={{ width: '100%', padding: '13px 15px', borderRadius: r.input,
                   border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                   fontSize: 12.5, lineHeight: 1.8, color: c.text, outline: 'none',
                   resize: 'vertical', boxSizing: 'border-box' }} />
      </label>
      <Spacer />
    </Screen>
  );
}

const timeStyle: React.CSSProperties = {
  minHeight: 34, padding: '0 8px', borderRadius: 9, border: `1px solid ${c.line}`,
  background: c.card, font: 'inherit', fontSize: 12.5, color: c.text, outline: 'none',
};

// ============================================================
// 退職・削除時の記録（Mgmt 6）
// ============================================================

export function Retirement(p: { onBack: () => void; nav?: NavSlots }) {
  const [st, setSt] = useState<StoreSettings | null>(null);
  const [reqs, setReqs] = useState<Awaited<ReturnType<typeof deletionRequests>>>([]);

  const load = () => { storeSettings().then(setSt); deletionRequests().then(setReqs); };
  useEffect(() => { load(); }, []);

  const POL = [
    ['keep', '残す', '氏名を外して、記録だけ残します'],
    ['ask', '本人に確認する', '本人が選びます。「消す」を選んだときだけ手続きが始まります'],
    ['del', '消す', '24時間の保留と、3名の同意が要ります'],
  ] as const;

  return (
    <Screen {...p.nav} bar={<Bar title="退職・削除時の記録" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>記録は残します。名前を外します。</H>

      <Spacer h={18} />
      <Card tone="flat">
        <div style={{ display: 'grid', gap: 9, ...t.small, color: c.weak }}>
          {[['✓', 'Practice記録', 'Other として残す'],
            ['✓', '画像', '残す'],
            ['×', 'Journey / Capability Map', '削除'],
            ['×', '相談', '削除']].map(([m, k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 14, fontWeight: 700,
                             color: m === '✓' ? c.tealText : c.warmText }}>{m}</span>
              <span style={{ flex: 1 }}>{k}</span>
              <span style={{ color: c.weaker }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Spacer />
      <Kicker>Practice記録を消すかどうか</Kicker>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {POL.map(([k, label, sub]) => {
          const on = st?.retirement_record_policy === k;
          return (
            <button key={k} onClick={async () => {
              await saveSettings({ retirement_record_policy: k }); load();
            }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '14px 16px', borderRadius: r.input, display: 'flex',
                       alignItems: 'flex-start', gap: 11,
                       background: on ? c.tealBg : c.card,
                       border: `1px solid ${on ? c.teal : c.cardLine}` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                             marginTop: 2, display: 'grid', placeItems: 'center',
                             border: `1.5px solid ${on ? c.tealFill : c.radioOff}` }}>
                {on && <span style={{ width: 9, height: 9, borderRadius: '50%',
                                      background: c.tealFill }} />}
              </span>
              <span style={{ display: 'grid', gap: 4, flex: 1 }}>
                <b style={{ fontSize: 13.5, fontWeight: 640 }}>{label}</b>
                <small style={{ fontSize: 11.5, lineHeight: 1.6, color: c.weaker }}>{sub}</small>
              </span>
            </button>
          );
        })}
      </div>
      {!st?.retirement_record_policy && (
        <div style={{ marginTop: 10, ...t.small, color: c.weaker }}>
          まだ決まっていません。ここは既定を置きません — 消すかどうかは、
          選ばずに決まってよい判断ではないからです。
        </div>
      )}

      {/* 進行中の削除 */}
      {reqs.length > 0 && (
        <>
          <Spacer />
          <Kicker>進行中</Kicker>
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {reqs.map((q) => (
              <Card key={q.id} tone="warm">
                <b style={{ fontSize: 13.5, fontWeight: 660 }}>
                  {q.subject?.display_name}さんの記録
                </b>
                <p style={{ margin: '8px 0 0', ...t.small, color: c.warmDeep }}>{q.reason}</p>
                <div style={{ marginTop: 9, fontSize: 11.5, color: c.weaker }}>
                  {q.execute_after
                    ? `同意が揃いました。${q.execute_after.slice(5, 16).replace('T', ' ')} に実行されます。`
                    : '同意を集めています（Management 2名 ＋ 担当Support 1名）。'}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!q.execute_after && (
                    <Button variant="outline"
                      onClick={async () => { await approveDeletion(q.id, 'mgmt'); load(); }}>
                      同意する
                    </Button>
                  )}
                  <Button variant="ghost"
                    onClick={async () => { await cancelDeletion(q.id); load(); }}>
                    取り消す
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Spacer />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          受信ボックスは、消去してから30日で自動的に消えます。
          Practice記録は「消す」を選んだときだけ、24時間の保留と3名の同意を経て消えます。
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// 個別通達（Mgmt 4）— Support 宛に、数字だけを添える
//
// 添えられるのは5つ、選べるのは2つまで。
// 3つ以上並べると、通達が査定表になる。
// 個々の返答文・相談本文は入れられない（列の形として持たない）。
// ============================================================

export function Individual(p: { onBack: () => void; nav?: NavSlots }) {
  const [sups, setSups] = useState<{ id: string; name: string }[]>([]);
  const [to, setTo] = useState<string | null>(null);
  const [ms, setMs] = useState<Metric[]>([]);
  const [pick, setPick] = useState<MetricKey[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supports().then((xs) => { setSups(xs); setTo((v) => v ?? xs[0]?.id ?? null); });
    businessHours().then((x) => setStore(x?.id ?? null));
  }, []);
  useEffect(() => { if (to) metricsFor(to).then(setMs); setPick([]); }, [to]);

  const toggle = (k: MetricKey) =>
    setPick((v) => v.includes(k) ? v.filter((x) => x !== k) : v.length >= 2 ? v : [...v, k]);

  const chosen = ms.filter((m) => pick.includes(m.key));

  return (
    <Screen {...p.nav} bar={<Bar title="個別通達" right={sent ? '送信しました' : '返答文は引用できません'} />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <Button disabled={!to || !store || !title.trim() || !body.trim() || busy || sent}
            onClick={async () => {
              if (!to || !store) return;
              setBusy(true);
              const ok = await postIndividual({
                support_id: to, store_id: store,
                title: title.trim(), body: body.trim(), metrics: chosen,
              });
              setBusy(false); if (ok) setSent(true);
            }}>{sent ? '送信しました' : '通達する'}</Button>
          <Button variant="ghost" onClick={p.onBack}>戻る</Button>
        </div>
      }>

      <H>傾向として渡します。</H>

      <Spacer h={18} />
      <Kicker>宛先</Kicker>
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {sups.map((x) => (
          <button key={x.id} onClick={() => setTo(x.id)}
            style={{ padding: '8px 12px', borderRadius: r.pill, cursor: 'pointer',
                     font: 'inherit', fontSize: 11.5, fontWeight: 700,
                     color: to === x.id ? c.tealText : c.weak,
                     background: to === x.id ? c.tealBg : 'transparent',
                     border: `1px solid ${to === x.id ? c.teal : c.line}` }}>
            {x.name}
          </button>
        ))}
      </div>

      {/* 添える数字。2つまで */}
      <Spacer />
      <Kicker>添える数字（2つまで）</Kicker>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {ms.map((m) => {
          const on = pick.includes(m.key);
          const over = m.baseline !== null && m.value > m.baseline;
          return (
            <button key={m.key} onClick={() => toggle(m.key)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '12px 15px', borderRadius: r.input, display: 'flex',
                       alignItems: 'center', gap: 12,
                       background: on ? c.tealBg : c.card,
                       border: `1px solid ${on ? c.teal : c.cardLine}` }}>
              <span style={{ flex: 1, fontSize: 13 }}>{m.label}</span>
              <span style={{ fontSize: 15, fontWeight: 640,
                             color: over ? c.warmText : c.text }}>
                {m.value}{m.unit}
              </span>
              {m.baseline !== null && (
                <span style={{ fontSize: 9.5, color: c.weaker }}>基準 {m.baseline}{m.unit}</span>
              )}
            </button>
          );
        })}
      </div>

      <Spacer />
      <div style={{ display: 'grid', gap: 12 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="題名"
          style={{ width: '100%', minHeight: 50, padding: '0 15px', borderRadius: r.input,
                   border: `1.5px solid ${c.teal}`, background: c.input, font: 'inherit',
                   fontSize: 16, fontWeight: 620, outline: 'none', boxSizing: 'border-box' }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="本文"
          rows={6}
          style={{ width: '100%', padding: '13px 15px', borderRadius: r.input,
                   border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                   fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                   resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      <Spacer />
      <Card tone="warm">
        <div style={{ ...t.small, color: c.warmDeep }}>
          <b style={{ fontWeight: 660 }}>個別の返答文は引用できません。</b>
          {' '}渡せるのは傾向を示す数値だけです（就業規則 第6条第5項）。
          他の Support の数値も渡りません — <b style={{ fontWeight: 660 }}>「誰と比べて」は出しません。</b>
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}
