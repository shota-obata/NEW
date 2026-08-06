// Growth OS Mobile — 共通の部品
// 値は tokens.ts からだけ引く。ここに #hex を直接書かない。

import type { CSSProperties, ReactNode } from 'react';
import { c, t, r, h, sans, press } from './tokens';

// ---- 画面の枠 --------------------------------------------------------
// ヘッダー 54/24/14 ＋ 下罫線、本文 0/24/22 スクロール、フッター 12/24 ＋ 上罫線

export type NavSlots = { nav?: ReactNode; tabs?: ReactNode };

export function Screen(p: { bar: ReactNode; children: ReactNode; footer?: ReactNode }
                        & NavSlots) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column',
                  background: c.bg, color: c.text, font: `14px ${sans}`,
                  letterSpacing: '-.006em' }}>
      <div style={{ flexShrink: 0, padding: '54px 24px 14px',
                    borderBottom: `1px solid ${c.line}` }}>{p.bar}</div>
      {/* Support / Management のナビはヘッダー下。Staff だけ下部タブバー（フッター側）*/}
      {p.nav && <div style={{ flexShrink: 0, padding: '10px 24px 0' }}>{p.nav}</div>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 22px' }}>
        {p.children}
      </div>
      {p.footer && (
        <div style={{ flexShrink: 0, padding: '12px 24px',
                      borderTop: `1px solid ${c.line}`, background: c.bg }}>{p.footer}</div>
      )}
      {p.tabs && (
        <div style={{ flexShrink: 0, background: c.bg,
                      borderTop: `1px solid ${c.line}` }}>{p.tabs}</div>
      )}
    </div>
  );
}

export const Bar = (p: { title: string; right?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 640 }}>{p.title}</span>
    {p.right && <span style={{ fontSize: 11, color: c.weaker }}>{p.right}</span>}
  </div>
);

export const H = (p: { children: ReactNode; size?: 23 | 25 }) => (
  <h2 style={{ ...(p.size === 25 ? t.h1 : t.h2), margin: '22px 0 0' }}>{p.children}</h2>
);

export const P = (p: { children: ReactNode; tone?: 'weak' | 'teal' | 'warm' }) => (
  <p style={{ ...t.body, margin: '12px 0 0',
              color: p.tone === 'teal' ? c.tealDeep
                   : p.tone === 'warm' ? c.warmDeep : c.weak }}>{p.children}</p>
);

export const Kicker = (p: { children: ReactNode; tone?: 'teal' }) => (
  <div style={{ ...t.kicker, color: p.tone === 'teal' ? c.tealText : c.label }}>{p.children}</div>
);

// ---- カード ----------------------------------------------------------

type Tone = 'plain' | 'teal' | 'warm' | 'flat';
const toneOf = (tone: Tone = 'plain'): CSSProperties =>
  tone === 'teal' ? { background: c.tealBg, border: `1.5px solid ${c.teal}` }
  : tone === 'warm' ? { background: c.warmBg, border: `1px solid ${c.warmLine}` }
  : tone === 'flat' ? { background: c.flat, border: `1px solid ${c.cardLine}` }
  : { background: c.card, border: `1px solid ${c.cardLine}` };

export const Card = (p: { children: ReactNode; tone?: Tone; style?: CSSProperties }) => (
  <div style={{ padding: 18, borderRadius: r.card, ...toneOf(p.tone), ...p.style }}>
    {p.children}
  </div>
);

// ---- ボタン ----------------------------------------------------------

export function Button(p: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: 'fill' | 'outline' | 'ghost'; style?: CSSProperties;
}) {
  const v = p.variant ?? 'fill';
  const off = !!p.disabled;
  const base: CSSProperties = {
    width: '100%', border: 0, borderRadius: r.btn, font: `inherit`,
    fontWeight: 640, cursor: off ? 'default' : 'pointer', transition: press,
    minHeight: v === 'ghost' ? h.btn : h.btnMain,
  };
  const skin: CSSProperties =
    v === 'outline' ? { minHeight: 50, borderRadius: r.input, border: `1px solid #d9d4ca`,
                        background: c.input, color: c.text, fontSize: 13.5, fontWeight: 620 }
    : v === 'ghost' ? { background: 'transparent', color: c.weaker, fontSize: 12.5 }
    : { background: off ? c.toggleOff : c.tealFill, color: off ? c.weaker : '#fff', fontSize: 14.5 };
  return (
    <button disabled={off} onClick={p.onClick} style={{ ...base, ...skin, ...p.style }}>
      {p.children}
    </button>
  );
}

// ---- 入力欄 ----------------------------------------------------------

export const Field = (p: { label: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gap: 4, padding: '13px 16px', borderRadius: r.btn,
                background: c.card, border: `1px solid ${c.line}` }}>
    <div style={t.field}>{p.label}</div>
    <div style={{ fontSize: 15, fontWeight: 620 }}>{p.children}</div>
  </div>
);

export function Input(p: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; inputMode?: 'text' | 'numeric'; maxLength?: number;
}) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={t.field}>{p.label}</span>
      <input
        value={p.value} placeholder={p.placeholder} inputMode={p.inputMode}
        maxLength={p.maxLength} autoCapitalize="off" autoCorrect="off"
        onChange={(e) => p.onChange(e.target.value)}
        style={{ width: '100%', minHeight: 50, padding: '0 15px', borderRadius: r.input,
                 border: `1.5px solid ${c.teal}`, background: c.input, font: `inherit`,
                 fontSize: 16, fontWeight: 620, color: c.text, outline: 'none' }} />
    </label>
  );
}

// ---- PINドット と キーパッド ------------------------------------------

export const Dots = (p: { value: string; len: number }) => (
  <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
    {Array.from({ length: p.len }, (_, i) => (
      <div key={i} style={{
        width: 14, height: 14, borderRadius: '50%',
        background: i < p.value.length ? c.tealFill : 'transparent',
        border: i < p.value.length ? 0 : `1.5px solid ${c.radioOff}`,
        transition: 'background-color .15s ease, transform .15s ease',
        transform: i === p.value.length - 1 ? 'scale(1.15)' : 'scale(1)',
      }} />
    ))}
  </div>
);

export function Keypad(p: { onPress: (d: string) => void; onDelete: () => void; onClear: () => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','clear','0','del'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {keys.map((k) => {
        const num = k.length === 1;
        return (
          <button key={k} onClick={() => k === 'clear' ? p.onClear() : k === 'del' ? p.onDelete() : p.onPress(k)}
            style={{ minHeight: h.keypad, borderRadius: r.btn, cursor: 'pointer', font: 'inherit',
                     border: num ? `1px solid ${c.line}` : 0,
                     background: num ? c.card : 'transparent',
                     color: num ? c.text : c.weaker,
                     fontSize: num ? 22 : 12.5, fontWeight: num ? 500 : 640,
                     transition: press }}>
            {k === 'clear' ? '消去' : k === 'del' ? '1つ消す' : k}
          </button>
        );
      })}
    </div>
  );
}

// ---- 注意ボックス ----------------------------------------------------

export const Warn = (p: { children: ReactNode }) => (
  <Card tone="warm" style={{ padding: '14px 16px' }}>
    <div style={{ fontSize: 12.5, lineHeight: 1.8, color: c.warmDeep }}>{p.children}</div>
  </Card>
);

export const Spacer = (p: { h?: number }) => <div style={{ height: p.h ?? 20 }} />;


// ---- ナビ ------------------------------------------------------------
// 役割で配置も形も変えている。同じ形にすると、権限の違いが見えなくなる。
//   Staff      下部タブバー（親指の届く位置。日常的に行き来する）
//   Support    ヘッダー下の淡いピル（判断の合間に開く）
//   Management ヘッダー下の濃色バー（項目が多く、日常の道具ではない）

export type Item = [key: string, label: string];

export const TabBar = (p: { items: Item[]; at: string; onGo: (k: string) => void }) => (
  <div style={{ display: 'flex', gap: 2, padding: '10px 20px 34px' }}>
    {p.items.map(([k, label]) => (
      <button key={k} onClick={() => p.onGo(k)}
        style={{ flex: 1, minHeight: h.nav, border: 0, background: 'transparent',
                 cursor: 'pointer', font: 'inherit', fontSize: 10.5,
                 letterSpacing: '-.01em', transition: press,
                 fontWeight: p.at === k ? 700 : 600,
                 color: p.at === k ? c.tealText : c.weaker }}>
        {label}
      </button>
    ))}
  </div>
);

export const Pills = (p: { items: Item[]; at: string; onGo: (k: string) => void }) => (
  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
    {p.items.map(([k, label]) => (
      <button key={k} onClick={() => p.onGo(k)}
        style={{ flex: '0 0 auto', height: h.nav, padding: '0 14px', borderRadius: r.pill,
                 cursor: 'pointer', font: 'inherit', fontSize: 11.5, fontWeight: 700,
                 transition: press,
                 background: p.at === k ? c.tealBg : 'transparent',
                 border: `1px solid ${p.at === k ? c.teal : c.line}`,
                 color: p.at === k ? c.tealText : c.weaker }}>
        {label}
      </button>
    ))}
  </div>
);

export const MgmtNav = (p: { items: Item[]; at: string; onGo: (k: string) => void }) => (
  <div style={{ display: 'flex', gap: 3, padding: 5, borderRadius: 12,
                background: c.mgmtNav, overflowX: 'auto' }}>
    {p.items.map(([k, label]) => (
      <button key={k} onClick={() => p.onGo(k)}
        style={{ flex: '0 0 auto', height: 30, padding: '0 11px', borderRadius: 8,
                 border: 0, cursor: 'pointer', font: 'inherit', fontSize: 11,
                 fontWeight: 700, whiteSpace: 'nowrap', transition: press,
                 background: p.at === k ? c.teal : 'transparent',
                 color: p.at === k ? '#fff' : c.label }}>
        {label}
      </button>
    ))}
  </div>
);
