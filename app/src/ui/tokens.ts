// Growth OS Mobile — デザイントークン
// 出典: design/growth-os-mobile/handoff/README.md「Design Tokens」と SCREENS.md
// 値はここからだけ引く。画面に直接 #hex を書かない。

export const c = {
  bg: '#f0eee9',
  card: '#faf9f7',
  cardLine: '#e8e3da',
  line: '#e3dfd7',
  lineIn: '#ece8e1',

  text: '#141413',
  weak: '#57544e',
  weaker: '#8f8b84',
  label: '#a8a29a',

  teal: '#3f8e97',
  tealFill: '#2e6e75',
  tealBg: '#e7f1f2',
  tealLine: '#d2e3e5',
  tealText: '#2f6a71',
  tealDeep: '#28565c',

  warmBg: '#faf3ee',
  warmLine: '#ecd9cd',
  warmText: '#a05a35',
  warmDeep: '#8a4d2e',
  warmBar: '#d8a68c',

  flat: '#f7f5f0',
  mgmtNav: '#23231f',
  input: '#ffffff',
  dash: '#c9c3b8',
  toggleOff: '#ddd8ce',
  radioOff: '#c4beb4',
  segBg: '#e6e2da',
  quote: '#3f3d38',      // 条文の引用。本文より少しだけ濃い
  // 全体の帯（16a）。できる → 選べる → 言える と濃くなる。まだ は淡い
  band1: '#9dbfc2',
  band2: '#5f979c',
  band3: '#2e6e75',
  band0: '#f2efe9',
  focusDeep: '#1f4a50',   // 一手カードの行名
  focusSub:  '#5b8a90',   // 一手カードの「〈誰〉さんが指しました」
  chipBg: '#f2efe9',
  chipText: '#6b6862',
} as const;

// 見出しは明朝系。日本語は Hiragino / Noto Serif JP へ落ちる
export const serif = "Georgia, 'Noto Serif JP', 'Hiragino Mincho ProN', serif";
export const sans =
  "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif";

export const t = {
  // 画面タイトル（セリフ体）
  h1: { fontFamily: serif, fontWeight: 400, fontSize: 25, lineHeight: 1.45,
        letterSpacing: '-.02em', wordBreak: 'auto-phrase' as const },
  h2: { fontFamily: serif, fontWeight: 400, fontSize: 23, lineHeight: 1.45,
        letterSpacing: '-.02em', wordBreak: 'auto-phrase' as const },
  cardTitle: { fontWeight: 660, fontSize: 15, lineHeight: 1.55 },
  body:  { fontWeight: 400, fontSize: 13, lineHeight: 1.8 },
  small: { fontWeight: 400, fontSize: 12.5, lineHeight: 1.75 },
  // ラベル・キッカー
  kicker: { fontWeight: 700, fontSize: 11, letterSpacing: '.14em', color: c.label },
  field:  { fontWeight: 700, fontSize: 10.5, letterSpacing: '.1em', color: c.label },
  mono: "10.5px ui-monospace, Menlo, monospace",
} as const;

export const r = {
  btn: 14, card: 16, sheet: 22, pill: 999, thumb: 11, input: 13,
} as const;

// タップ領域: 本文中の単独ボタンは42px以上、ナビ・セグメント・チップは36px以上
// （iOSの44px指針は独立したタップ対象の話で、連続して並ぶものには当てはまらない）
export const h = {
  btn: 42, btnMain: 52, keypad: 58, nav: 36, seg: 40, chip: 37,
} as const;

export const press =
  'transform .13s cubic-bezier(.2,.8,.3,1), background-color .13s ease, border-color .13s ease';
