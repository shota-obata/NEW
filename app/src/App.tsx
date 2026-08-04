// Growth OS Mobile — 画面の遷移
//
// どの画面へ行くかは login_gate() でサーバに訊く。画面側で判断しない。
// 仮PIN → 同意 → 本体 の順で、飛ばせない。

import { useEffect, useState } from 'react';
import { Login, RegisterDevice, ChangePin, hasDevice } from './screens/Auth';
import { Consent, PolicyFull } from './screens/Policy';
import { Screen, Bar, H, P, Button, Card, Spacer } from './ui/kit';
import { loginGate, session, signOut, me, type Next } from './lib/api';

type View = 'boot' | 'register' | 'login' | 'change_pin' | 'consent' | 'policy' | 'home';

export function App() {
  const [view, setView] = useState<View>('boot');
  const [back, setBack] = useState<View>('login');
  const [name, setName] = useState<string | null>(null);

  // 起動時: セッションがあればサーバに次の行き先を訊く
  useEffect(() => {
    (async () => {
      if (!hasDevice()) return setView('register');
      const s = await session();
      if (!s) return setView('login');
      const g = await loginGate();
      setView(g === 'ok' ? 'home' : (g as View));
      me().then((u) => u && setName((u as { display_name: string }).display_name));
    })();
  }, []);

  const afterAuth = (next: Next) => setView(next === 'ok' ? 'home' : (next as View));

  if (view === 'boot') return (
    <Screen bar={<Bar title="Growth OS" right="AI,re" />}><Spacer h={40} />
      <P>確認しています…</P></Screen>
  );

  if (view === 'register') return <RegisterDevice onDone={() => setView('login')} />;

  if (view === 'login') return (
    <Login onDone={afterAuth} onRegister={() => setView('register')} />
  );

  if (view === 'change_pin') return (
    <ChangePin first onDone={async () => afterAuth(await loginGate())} />
  );

  if (view === 'consent') return (
    <Consent onDone={async () => afterAuth(await loginGate())}
             onReadAll={() => { setBack('consent'); setView('policy'); }} />
  );

  if (view === 'policy') return <PolicyFull onBack={() => setView(back)} />;

  // 本体はフェーズ5の残りで作る。いまは通し確認用の足場
  return (
    <Screen bar={<Bar title="Home" right={name ?? undefined} />}
      footer={<Button variant="ghost" onClick={async () => { await signOut(); setView('login'); }}>
        サインアウト</Button>}>
      <H>入れました。</H>
      <P>端末の登録、PINの変更、規定への同意がすべて通っています。ここから先の画面は、これから作ります。</P>
      <Spacer />
      <Card tone="flat">
        <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
          この先に入るもの — Home（今日の一手）／Practice記録／Journey／Capability Map／受信ボックス。
          Support と Management はそれぞれ別の入口になります。
        </div>
      </Card>
      <Spacer h={14} />
      <Button variant="outline" onClick={() => { setBack('home'); setView('policy'); }}>
        就業規則 追加条文（全9条）を読む
      </Button>
      <Spacer />
    </Screen>
  );
}
