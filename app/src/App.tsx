// Growth OS Mobile — 画面の遷移
//
// どの画面へ行くかは login_gate() でサーバに訊く。画面側で判断しない。
// 仮PIN → 同意 → 本体 の順で、飛ばせない。

import { useEffect, useState } from 'react';
import { Login, RegisterDevice, ChangePin, hasDevice } from './screens/Auth';
import { Consent, PolicyFull } from './screens/Policy';
import { Home, Practice } from './screens/Staff';
import { Settings } from './screens/Settings';
import { myStore } from './lib/staff';
import { Screen, Bar, P, Spacer } from './ui/kit';
import { loginGate, session, signOut, me, type Next } from './lib/api';

type View = 'boot' | 'register' | 'login' | 'change_pin' | 'consent' | 'policy'
           | 'home' | 'practice' | 'settings';

export function App() {
  const [view, setView] = useState<View>('boot');
  const [back, setBack] = useState<View>('login');
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [recId, setRecId] = useState<string | null>(null);

  // 起動時: セッションがあればサーバに次の行き先を訊く
  useEffect(() => {
    (async () => {
      if (!hasDevice()) return setView('register');
      const s = await session();
      if (!s) return setView('login');
      const g = await loginGate();
      setView(g === 'ok' ? 'home' : (g as View));
      me().then((u) => {
        if (!u) return;
        const x = u as { display_name: string; person_code: string };
        setName(x.display_name); setCode(x.person_code);
      });
      myStore().then((st) => st && setStoreId(st.id));
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

  if (view === 'settings') return (
    <Settings name={name} personCode={code}
      onPolicy={() => { setBack('settings'); setView('policy'); }}
      onSignOut={async () => { await signOut(); setView('login'); }}
      onBack={() => setView('home')} />
  );

  if (view === 'practice') return (
    <Practice id={recId} storeId={storeId} onBack={() => { setRecId(null); setView('home'); }} />
  );

  return (
    <Home
      name={name}
      onOpen={(id) => { setRecId(id); setView('practice'); }}
      onNew={() => { setRecId(null); setView('practice'); }}
      onSettings={() => setView('settings')}
    />
  );
}
