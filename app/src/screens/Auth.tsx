// Growth OS Mobile — 入口の3画面
// 端末登録 → サインイン → PIN変更
//
// 応答の理由はサーバが絞っている。画面側で推測して補わない。
// 「個人IDが違います」のような、存在を漏らす文言は出さない。

import { useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Input, Dots, Keypad, Warn, Spacer }
  from '../ui/kit';
import { c, t, r, h } from '../ui/tokens';
import { login, registerDevice, changePin, deviceToken, type Deny, type Next } from '../lib/api';

const DENY_TEXT: Record<Deny, string> = {
  denied: '入れませんでした。個人ID・店舗ID・PIN・端末のいずれかが揃っていません。',
  locked: 'PINを5回続けて間違えたため、15分ロックされています。急ぐ場合は運営者に解除を頼んでください。',
  device_limit: '登録できる端末は1人3台までです。運営者に、使っていない端末の失効を頼んでください。',
  weak_pin: 'そのPINは使えません。連番やゾロ目ではない4桁にしてください。',
  format: 'PINは4桁の数字です。',
  same_pin: 'いまと同じPINには変更できません。',
  network: '通信できませんでした。電波を確かめて、もう一度お試しください。',
};

// ============================================================
// 端末登録（未登録の端末で最初に出る）
// ============================================================

export function RegisterDevice(p: { onDone: () => void }) {
  const [step, setStep] = useState<'intro' | 'code' | 'label'>('intro');
  const [person, setPerson] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'personal' | 'shared'>('personal');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (step === 'intro') return (
    <Screen bar={<Bar title="Growth OS" right="AI,re" />}
      footer={<Button onClick={() => setStep('code')}>この端末を登録する</Button>}>
      <H>この端末は、登録されていません。</H>
      <P>個人IDと4桁PINだけでは入れません。1つ目の鍵は端末です。ここではPINの入力欄も出しません。</P>
      <Spacer />
      <Warn>
        <b style={{ fontWeight: 700 }}>登録には、運営者から受け取る6桁のコードが要ります。</b>
        本人確認のうえ、仮のPINと一緒に手渡されます。コードは15分で失効し、1回しか使えません。
      </Warn>

      {/* 登録はブラウザごとに残る。LINEやメールのリンクから開くと
          アプリ内ブラウザになり、別の場所として扱われる。
          ホーム画面に追加すれば、以後そこだけを使える */}
      <Spacer h={14} />
      <Card tone="flat">
        <Kicker>登録し直しになったときは</Kicker>
        <div style={{ marginTop: 10, ...t.small, color: c.weak, lineHeight: 1.9 }}>
          この登録は<b style={{ fontWeight: 660, color: c.text }}>ブラウザごとに残ります</b>。
          LINEやメールのリンクから開くと別のブラウザになり、もう一度登録が要ります。
          <br /><br />
          <b style={{ fontWeight: 660, color: c.text }}>共有ボタンから「ホーム画面に追加」しておくと、
          次からはそこを開くだけで済みます。</b>
        </div>
      </Card>
    </Screen>
  );

  if (step === 'code') {
    const ready = /^[A-Za-z]{2}-\d{2}$/.test(person) && code.length === 6;
    return (
      <Screen bar={<Bar title="端末の登録" right="1 / 2" />}
        footer={
          <div style={{ display: 'grid', gap: 9 }}>
            <Button disabled={!ready} onClick={() => setStep('label')}>次へ</Button>
            <Button variant="ghost" onClick={() => setStep('intro')}>戻る</Button>
          </div>
        }>
        <H>個人IDと登録コードを入れてください。</H>
        <Spacer h={20} />
        <div style={{ display: 'grid', gap: 16 }}>
          <Input label="個人ID" value={person} onChange={(v) => setPerson(v.toUpperCase())}
                 placeholder="KW-04" maxLength={5} />
          <div>
            <div style={{ ...t.field, textAlign: 'center' }}>登録コード · 6桁</div>
            <div style={{ marginTop: 14 }}><Dots value={code} len={6} /></div>
            <div style={{ marginTop: 18 }}>
              <Keypad onPress={(d) => setCode((s) => (s + d).slice(0, 6))}
                      onDelete={() => setCode((s) => s.slice(0, -1))}
                      onClear={() => setCode('')} />
            </div>
          </div>
        </div>
      </Screen>
    );
  }

  const ready = label.trim().length > 0;
  return (
    <Screen bar={<Bar title="端末の登録" right="2 / 2" />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          <Button disabled={!ready || busy} onClick={async () => {
            setBusy(true); setErr(null);
            const res = await registerDevice({ person_code: person, code, label: label.trim(), device_kind: kind });
            setBusy(false);
            if (res.ok) {
              // 共有端末では「裏」を出さない。判定に使うので端末側にも残す
              localStorage.setItem('gos.device_kind', kind);
              p.onDone();
            }
            else { setErr(DENY_TEXT[res.reason]); setStep('code'); setCode(''); }
          }}>{busy ? '登録しています…' : '登録する'}</Button>
          <Button variant="ghost" onClick={() => setStep('code')}>戻る</Button>
        </div>
      }>
      <H>この端末は、誰のものですか。</H>
      {err && <><Spacer h={14} /><Warn>{err}</Warn></>}
      <Spacer h={20} />
      <Input label="端末名" value={label} onChange={setLabel} placeholder="黒坂さんの iPhone" />
      <Spacer h={20} />
      <Kicker>所有</Kicker>
      <div style={{ marginTop: 11, display: 'grid', gap: 9 }}>
        {([['personal', '個人の端末', '本人だけが使います。パーソナルスペースの「裏」を置けます'],
           ['shared', '店舗の共有端末', '複数人が使います。「裏」は置けません']] as const).map(([k, title, sub]) => (
          <button key={k} onClick={() => setKind(k)}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                     padding: '15px 17px', borderRadius: r.input,
                     border: kind === k ? `1.5px solid ${c.teal}` : `1px solid ${c.toggleOff}`,
                     background: kind === k ? c.tealBg : c.input }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', flex: '0 0 auto',
                             background: '#fff',
                             border: kind === k ? `5px solid ${c.tealFill}` : `1.5px solid ${c.radioOff}` }} />
              <b style={{ fontSize: 13.5, fontWeight: 640 }}>{title}</b>
            </div>
            <div style={{ marginTop: 7, paddingLeft: 28, fontSize: 12, lineHeight: 1.7,
                          color: kind === k ? c.tealDeep : c.weaker }}>{sub}</div>
          </button>
        ))}
      </div>
      {kind === 'shared' && <><Spacer h={14} /><Warn>
        <b style={{ fontWeight: 700 }}>共有端末では「裏」を開きません。</b>
        サインアウトで端末内のデータを消します。無操作3分で自動サインアウトします。
      </Warn></>}
    </Screen>
  );
}

// ============================================================
// サインイン（端末 ＋ 個人ID ＋ PIN ＋ 店舗ID、Managementは Management ID）
// ============================================================

type Role = 'staff' | 'support' | 'mgmt';
const ROLE: Record<Role, { label: string; title: string; needStore: boolean; needMgmt: boolean }> = {
  staff:   { label: 'Staff',      title: '登録した端末と、2つの鍵で入ります。',      needStore: true,  needMgmt: false },
  support: { label: 'Support',    title: '端末と、3つの鍵。3つ目は店舗IDです。',      needStore: true,  needMgmt: false },
  mgmt:    { label: 'Management', title: '端末と、4つの鍵。4つ目はManagement IDです。', needStore: true,  needMgmt: true },
};

export function Login(p: { onDone: (next: Next) => void; onRegister: () => void }) {
  const [role, setRole] = useState<Role>('staff');
  const [person, setPerson] = useState('');
  const [store, setStore] = useState('');
  const [mgmt, setMgmt] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const d = ROLE[role];
  const ready = person.length >= 4 && store.length >= 4 && pin.length === 4
             && (!d.needMgmt || mgmt.length >= 4);

  return (
    <Screen bar={<Bar title="Growth OS" right="AI,re" />}
      footer={
        <div style={{ display: 'grid', gap: 9 }}>
          <Button disabled={!ready || busy} onClick={async () => {
            setBusy(true); setErr(null);
            const res = await login({ person_code: person, store_code: store, pin, role,
                                      mgmt_code: d.needMgmt ? mgmt : undefined });
            setBusy(false); setPin('');
            if (res.ok) p.onDone(res.next); else setErr(DENY_TEXT[res.reason]);
          }}>{busy ? '確認しています…' : 'サインイン'}</Button>
          <Button variant="ghost" onClick={p.onRegister}>別の端末として登録する</Button>
        </div>
      }>
      {/* 役割タブ */}
      <div style={{ marginTop: 22, display: 'flex', gap: 5, padding: 4,
                    borderRadius: r.input, background: c.segBg }}>
        {(Object.keys(ROLE) as Role[]).map((k) => (
          <button key={k} onClick={() => setRole(k)}
            style={{ flex: 1, minHeight: h.seg, borderRadius: 10, border: 0, cursor: 'pointer',
                     font: 'inherit', fontSize: 12, fontWeight: 700,
                     background: role === k ? c.card : 'transparent',
                     color: role === k ? c.text : c.weaker,
                     boxShadow: role === k ? '0 1px 2px rgba(20,20,19,.08)' : 'none' }}>
            {ROLE[k].label}
          </button>
        ))}
      </div>

      <H size={23}>{d.title}</H>

      {/* 1つ目の鍵は端末。ここに来ている時点で登録済み */}
      <div style={{ marginTop: 16, padding: '13px 16px', borderRadius: r.btn,
                    background: c.tealBg, border: `1px solid ${c.tealLine}`, display: 'grid', gap: 4 }}>
        <div style={{ ...t.field, color: c.tealText }}>1つ目の鍵 · 端末</div>
        <div style={{ fontSize: 14, fontWeight: 640, color: c.tealDeep }}>この端末 · 登録済み</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.65, color: c.tealText }}>
          未登録の端末は、この画面まで来ません。
        </div>
      </div>

      <Spacer h={16} />
      <div style={{ display: 'grid', gap: 14 }}>
        <Input label="個人ID" value={person} onChange={(v) => setPerson(v.toUpperCase())}
               placeholder="KW-04" maxLength={5} />
        <Input label="店舗ID" value={store} onChange={(v) => setStore(v.toUpperCase())}
               placeholder="KW-001" maxLength={6} />
        {d.needMgmt && (
          <Input label="Management ID" value={mgmt} onChange={(v) => setMgmt(v.toUpperCase())}
                 placeholder="MG-KW-01" maxLength={10} />
        )}
      </div>

      <div style={{ marginTop: 22, textAlign: 'center' }}>
        <div style={{ ...t.field }}>4桁PIN</div>
        <div style={{ marginTop: 14 }}><Dots value={pin} len={4} /></div>
      </div>
      <div style={{ marginTop: 18 }}>
        <Keypad onPress={(x) => setPin((s) => (s + x).slice(0, 4))}
                onDelete={() => setPin((s) => s.slice(0, -1))} onClear={() => setPin('')} />
      </div>

      {err && <><Spacer h={16} /><Warn>{err}</Warn></>}
      <Spacer h={10} />
    </Screen>
  );
}

// ============================================================
// PIN変更（仮PINからの初回変更。変更するまで本体に入れない）
// ============================================================

export function ChangePin(p: { onDone: () => void; first: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [stage, setStage] = useState<'cur' | 'new'>('cur');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const val = stage === 'cur' ? cur : next;
  const set = stage === 'cur' ? setCur : setNext;

  return (
    <Screen bar={<Bar title="PINの変更" right={p.first ? '初回のみ' : undefined} />}
      footer={
        <Button disabled={val.length !== 4 || busy} onClick={async () => {
          if (stage === 'cur') { setStage('new'); return; }
          setBusy(true); setErr(null);
          const res = await changePin(cur, next);
          setBusy(false);
          if (res.ok) p.onDone();
          else { setErr(DENY_TEXT[res.reason]); setNext(''); setStage(res.reason === 'denied' ? 'cur' : 'new');
                 if (res.reason === 'denied') setCur(''); }
        }}>{busy ? '変更しています…' : stage === 'cur' ? '次へ' : 'このPINにする'}</Button>
      }>
      <H>{stage === 'cur' ? 'いまのPINを入れてください。' : '新しいPINを決めてください。'}</H>
      {p.first && stage === 'cur' && (
        <P>運営者から受け取った仮のPINです。ここで自分だけが知るPINに変えます。<b style={{ fontWeight: 660 }}>変更するまで先に進めません。</b></P>
      )}
      {stage === 'new' && (
        <P>連番（1234）とゾロ目（1111）は使えません。他人が見て推測できない4桁にしてください。</P>
      )}

      <div style={{ marginTop: 26, textAlign: 'center' }}>
        <Dots value={val} len={4} />
      </div>
      <div style={{ marginTop: 22 }}>
        <Keypad onPress={(x) => set((s) => (s + x).slice(0, 4))}
                onDelete={() => set((s) => s.slice(0, -1))} onClear={() => set('')} />
      </div>

      {err && <><Spacer h={16} /><Warn>{err}</Warn></>}

      <Spacer h={16} />
      <Card tone="flat">
        <div style={{ fontSize: 12.5, lineHeight: 1.8, color: c.weak }}>
          PINを5回続けて間違えると15分ロックされます。解除は運営者だけができます。
          忘れたときも運営者に仮PINの再発行を頼んでください。
        </div>
      </Card>
    </Screen>
  );
}

// 端末が未登録なら登録画面から始める
export const hasDevice = () => !!deviceToken();
