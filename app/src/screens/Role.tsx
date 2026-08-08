// Growth OS Mobile — 役割の切替
//
// 兼務がいる（小畑さんは Support ＋ Staff）。
// 同じ人でも、入っている役割で見えるものが変わる。
// どちらで入っているかを、いつでも確かめられるようにここに置く。
//
// 切替はサインインし直しではない。可視領域はサーバ（RLS）が
// セッションの役割から決めるので、画面側で足せるものは何もない。

import { Screen, Bar, H, P, Card, Kicker, Button, Spacer } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { setChosenRole, type Role } from '../lib/api';
import { tellManagement } from '../lib/core';
import { useState } from 'react';

const R: { key: Role; label: string; sub: string }[] = [
  { key: 'staff',   label: 'Staff',      sub: '自分の記録・Journey・Capability Map' },
  { key: 'support', label: 'Support',    sub: '担当スタッフの記録と、到達の判断' },
  { key: 'mgmt',    label: 'Management', sub: '設計と通達。個人の中身は見えません' },
];

export function RoleSwitch(p: {
  current: Role; name: string | null; personCode: string | null;
  onPick: (r: Role) => void; onSignOut: () => void; onPersonal: () => void;
}) {
  const [direct, setDirect] = useState(false);

  if (direct) return <DirectToMgmt onBack={() => setDirect(false)} />;

  return (
    <Screen bar={<Bar title="役割" right={p.personCode ?? undefined} />}
      footer={<Button variant="ghost" onClick={p.onSignOut}>サインアウト</Button>}>

      <H>いま {p.name ?? 'あなた'} は、どの役割で入っていますか。</H>
      <P>
        兼務の人がいます。<b style={{ fontWeight: 660, color: c.text }}>役割を変えると、見えるものが変わります。</b>
        {' '}持っていない役割は選んでも入れません。
      </P>

      <Spacer />
      <div style={{ display: 'grid', gap: 9 }}>
        {R.map((x) => {
          const on = p.current === x.key;
          return (
            <button key={x.key}
              onClick={() => { setChosenRole(x.key); p.onPick(x.key); }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '15px 17px', borderRadius: r.card, display: 'flex',
                       alignItems: 'center', gap: 12,
                       background: on ? c.tealBg : c.card,
                       border: on ? `1.5px solid ${c.teal}` : `1px solid ${c.cardLine}` }}>
              <span style={{ display: 'grid', gap: 4, flex: 1 }}>
                <b style={{ fontSize: 14.5, fontWeight: 660,
                            color: on ? c.tealDeep : c.text }}>{x.label}</b>
                <small style={{ fontSize: 11.5, lineHeight: 1.6, color: c.weaker }}>{x.sub}</small>
              </span>
              {on && <span style={{ ...t.kicker, color: c.tealText }}>いまここ</span>}
            </button>
          );
        })}
      </div>

      {/* 区分01・03。日常の画面には出さない。この画面にだけ置く */}
      {p.current === 'staff' && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${c.line}`,
                      display: 'grid', gap: 14 }}>
          <button onClick={p.onPersonal}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 13, color: c.weak, textAlign: 'left' }}>
            パーソナルスペース
          </button>
          <button onClick={() => setDirect(true)}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 13, color: c.weak, textAlign: 'left' }}>
            Management に直接伝える
          </button>
        </div>
      )}

      <Spacer />
      <Card tone="flat">
        <Kicker>切り替えても変わらないこと</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.9 }}>
          持っていない役割の中身は、選んでも1件も返りません。
          担当していないスタッフの記録は、Support で入っても見えません。
          <b style={{ fontWeight: 660, color: c.text }}>この判断は画面ではなくサーバがしています。</b>
        </div>
      </Card>
      <Spacer />
    </Screen>
  );
}

// ============================================================
// Management に直接伝える（区分03）
//
// Support には存在も件数も出ない。伝えないと使われず、
// 使われなければ「あることになっているだけ」の設備になる。
// だから存在は伝える — ただし「隠せる」ではなく「届く先」の話として。
// ============================================================

function DirectToMgmt(p: { onBack: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) return (
    <Screen bar={<Bar title="Management に直接伝える" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
      <Spacer h={26} />
      <Card tone="teal">
        <div style={{ fontSize: 15, fontWeight: 660, color: c.tealDeep }}>送りました。</div>
        <p style={{ margin: '11px 0 0', ...t.small, color: c.tealDeep, lineHeight: 1.85 }}>
          Management の受信ボックスに届きました。
          返答が要るかどうかは Management が決めます。返答が無いこともあります。
        </p>
      </Card>
      <Spacer />
    </Screen>
  );

  return (
    <Screen bar={<Bar title="Management に直接伝える" />}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <Button disabled={busy || !body.trim()} onClick={async () => {
            setBusy(true);
            const ok = await tellManagement(body.trim());
            setBusy(false);
            if (ok) setSent(true);
          }}>送る</Button>
          <Button variant="ghost" onClick={p.onBack}>やめる</Button>
        </div>
      }>

      <H>ここは、Support を通しません。</H>

      <Spacer h={18} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak, lineHeight: 1.85 }}>
          届く先は Management の2名だけです。担当のSupportの画面には出ません。
          <b style={{ fontWeight: 660, color: c.text }}>件数も出ません。</b>
        </div>
      </Card>

      <Spacer h={11} />
      <Card tone="warm">
        <div style={{ ...t.small, color: c.warmDeep, lineHeight: 1.85 }}>
          担当との関係そのものについて書ける場所が要る、という考えでこの窓口があります。
          使わなくてよい設計です。
        </div>
      </Card>

      <Spacer h={16} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
        placeholder="事実だけでも、感じたことだけでも構いません。"
        style={{ width: '100%', padding: '13px 15px', borderRadius: r.input,
                 border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
                 fontSize: 13, lineHeight: 1.8, color: c.text, outline: 'none',
                 resize: 'vertical', boxSizing: 'border-box' }} />
      <Spacer />
    </Screen>
  );
}
