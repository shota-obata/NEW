// Growth OS Mobile — Management（Home ／ 閲覧）
//
// 運営者は「人」ではなく「設計」を扱う。相談の本文も習熟の細目も、
// ここには経路が無い（RLS で返らない）。
//
// 「閲覧」は監査ログの唯一の例外。周知・在籍者全員の同意・施行日の
// 3つが揃うまで1行も返らない（就業規則 第6条第3項）。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Warn, Spacer } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { consentGap, supportQuality, gateOpen, policyState, storageForecast,
         rollout, issueCode, issuePin, unlock, devicesOf, revokeDevice,
         type Quality, type Rollout, type Device } from '../lib/mgmt';

const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';

export function MgmtHome(p: {
  name: string | null; onQuality: () => void; onSettings: () => void;
}) {
  const [gap, setGap] = useState<{ total: number; consented: number } | null>(null);
  const [pol, setPol] = useState<{ version: string; effective_from: string; announced_at: string | null } | null>(null);
  const [st, setSt] = useState<{ bytes_used: number; quota_bytes: number; pct: number; days_left: number | null } | null>(null);

  useEffect(() => {
    consentGap().then((g) => g && setGap(g));
    policyState().then(setPol);
    storageForecast().then(setSt);
  }, []);

  const left = gap ? gap.total - gap.consented : null;
  const past = pol ? new Date(pol.effective_from) <= new Date() : false;

  return (
    <Screen bar={<Bar title="Management" right={p.name ?? undefined} />}
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

export function Quality(p: { onBack: () => void }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Quality[]>([]);
  const [gap, setGap] = useState<{ total: number; consented: number } | null>(null);

  useEffect(() => {
    gateOpen().then(setOpen);
    supportQuality().then(setRows);
    consentGap().then((g) => g && setGap(g));
  }, []);

  if (open === null) return (
    <Screen bar={<Bar title="介入の質" />}><Spacer h={30} /><P>確認しています…</P></Screen>
  );

  if (!open) {
    const left = gap ? gap.total - gap.consented : null;
    return (
      <Screen bar={<Bar title="介入の質" right="ロック中" />}
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
                      fontSize: 12.5, lineHeight: 1.95, color: '#3f3d38', whiteSpace: 'pre-line' }}>
{`1　会社は、指導の質を確保し、育成の体制を適正に保つため、指導者が従業員に対して行った返答の内容および返答までに要した日数を確認することがある。
3　第1項の確認は、対象となる従業員および指導者に対して個別に通知せず、第5条第1項の開示の対象としない。`}
          </p>
        </Card>
        <Spacer />
      </Screen>
    );
  }

  return (
    <Screen bar={<Bar title="介入の質" right="Supportの返答 · 30日" />}
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
        <Kicker>平均レスポンス（基準 1.0日）</Kicker>
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


export function Devices(p: { onBack: () => void }) {
  const [rows, setRows] = useState<Rollout[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [devs, setDevs] = useState<Device[]>([]);
  const [issued, setIssued] = useState<{ kind: 'code' | 'pin'; value: string; who: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => rollout().then(setRows);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (open) devicesOf(open).then(setDevs); else setDevs([]); }, [open]);


  return (
    <Screen bar={<Bar title="端末" right="1人3台まで" />}
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
