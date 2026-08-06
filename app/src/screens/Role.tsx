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

const R: { key: Role; label: string; sub: string }[] = [
  { key: 'staff',   label: 'Staff',      sub: '自分の記録・Journey・Capability Map' },
  { key: 'support', label: 'Support',    sub: '担当スタッフの記録と、到達の判断' },
  { key: 'mgmt',    label: 'Management', sub: '設計と通達。個人の中身は見えません' },
];

export function RoleSwitch(p: {
  current: Role; name: string | null; personCode: string | null;
  onPick: (r: Role) => void; onSignOut: () => void;
}) {
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
