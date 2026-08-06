// Growth OS Mobile — 画面の遷移
//
// どの画面へ行くかは login_gate() でサーバに訊く。画面側で判断しない。
// 仮PIN → 同意 → 本体 の順で、飛ばせない。
//
// ナビは役割で形も位置も変えている（SCREENS.md 冒頭）。
// 同じ形にすると、権限の違いが見た目から消える。

import { useEffect, useState } from 'react';
import { Login, RegisterDevice, ChangePin, hasDevice } from './screens/Auth';
import { Consent, PolicyFull } from './screens/Policy';
import { Home, Practice } from './screens/Staff';
import { Settings } from './screens/Settings';
import { SupportHome, SharedRecord } from './screens/Support';
import { MgmtHome, Quality, Devices } from './screens/Mgmt';
import { JourneyScreen, CapMap, InboxScreen, PostNotice, Consults } from './screens/Core';
import { RoleSwitch } from './screens/Role';
import { myStore } from './lib/staff';
import { Screen, Bar, P, Spacer, TabBar, Pills, MgmtNav, type Item } from './ui/kit';
import { loginGate, session, signOut, me, chosenRole, type Next, type Role } from './lib/api';

type Gate = 'boot' | 'register' | 'login' | 'change_pin' | 'consent';

const TABS: Record<Role, Item[]> = {
  staff: [['home', 'Home'], ['practice', 'Practice'], ['cp3', 'CP3'],
          ['map', 'Map'], ['inbox', '受信'], ['role', '役割']],
  support: [['home', 'Home'], ['inbox', '受信'], ['staff', 'スタッフ'],
            ['notice', '通達'], ['role', '役割']],
  mgmt: [['home', 'Home'], ['inbox', '受信'], ['design', '設計'], ['notice', '通達'],
         ['view', '閲覧'], ['devices', '端末'], ['settings', '設定'], ['role', '役割']],
};

export function App() {
  const [gate, setGate] = useState<Gate | 'ok'>('boot');
  const [role, setRole] = useState<Role>(chosenRole());
  const [nav, setNav] = useState('home');
  const [sub, setSub] = useState<string | null>(null);   // 画面内のさらに奥
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [recId, setRecId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!hasDevice()) return setGate('register');
      const s = await session();
      if (!s) return setGate('login');
      const g = await loginGate();
      setGate(g === 'ok' ? 'ok' : (g as Gate));
      setRole(chosenRole());
      me().then((u) => {
        if (!u) return;
        const x = u as { display_name: string; person_code: string };
        setName(x.display_name); setCode(x.person_code);
      });
      myStore().then((st) => st && setStoreId(st.id));
    })();
  }, []);

  const afterAuth = (next: Next) => {
    setRole(chosenRole()); setNav('home'); setSub(null);
    setGate(next === 'ok' ? 'ok' : (next as Gate));
  };
  const go = (k: string) => { setSub(null); setRecId(null); setNav(k); };
  const home = () => go('home');

  // ---- 認証と同意（ナビは出さない。飛ばせる導線を作らない）----
  if (gate === 'boot') return (
    <Screen bar={<Bar title="Growth OS" right="AI,re" />}><Spacer h={40} />
      <P>確認しています…</P></Screen>
  );
  if (gate === 'register') return <RegisterDevice onDone={() => setGate('login')} />;
  if (gate === 'login') return (
    <Login onDone={afterAuth} onRegister={() => setGate('register')} />
  );
  if (gate === 'change_pin') return (
    <ChangePin first onDone={async () => afterAuth(await loginGate())} />
  );
  if (gate === 'consent') return (
    <Consent onDone={async () => afterAuth(await loginGate())}
             onReadAll={() => setSub('policy')} />
  );
  if (sub === 'policy') return <PolicyFull onBack={() => setSub(null)} />;

  const bar = role === 'staff'
    ? { tabs: <TabBar items={TABS.staff} at={nav} onGo={go} /> }
    : role === 'support'
      ? { nav: <Pills items={TABS.support} at={nav} onGo={go} /> }
      : { nav: <MgmtNav items={TABS.mgmt} at={nav} onGo={go} /> };

  // ---- 役割の切替（兼務がいる。小畑さんは Support ＋ Staff）----
  if (nav === 'role') return (
    <RoleSwitch current={role} name={name} personCode={code}
      onPick={(r) => { setRole(r); setNav('home'); }}
      onSignOut={async () => { await signOut(); setGate('login'); }} />
  );

  // ---- 共通 ----
  if (nav === 'inbox') return <InboxScreen nav={bar} onBack={home} />;
  if (nav === 'settings' && role !== 'mgmt') return (
    <Settings name={name} personCode={code}
      onPolicy={() => setSub('policy')}
      onSignOut={async () => { await signOut(); setGate('login'); }}
      onBack={home} />
  );

  // ---- Management ----
  if (role === 'mgmt') {
    if (nav === 'view') return <Quality nav={bar} onBack={home} />;
    if (nav === 'devices') return <Devices nav={bar} onBack={home} />;
    if (nav === 'notice') return <PostNotice kind="mgmt_to_all" nav={bar} onBack={home} />;
    if (nav === 'settings') return (
      <Settings name={name} personCode={code}
        onPolicy={() => setSub('policy')}
        onSignOut={async () => { await signOut(); setGate('login'); }}
        onDevices={() => go('devices')} onBack={home} />
    );
    return <MgmtHome name={name} nav={bar} onQuality={() => go('view')}
             onSettings={() => go('settings')} />;
  }

  // ---- Support ----
  if (role === 'support') {
    if (nav === 'notice') return <PostNotice kind="support_to_mgmt" nav={bar} onBack={home} />;
    if (nav === 'staff') {
      if (sub === 'consults') return <Consults canReply nav={bar} onBack={() => setSub(null)} />;
      if (sub && recId) return <SharedRecord id={recId} onBack={() => { setRecId(null); setSub(null); }} />;
      return <SupportHome name={name} nav={bar}
               onOpen={(id) => { setRecId(id); setSub('rec'); }}
               onSettings={() => go('settings')} />;
    }
    if (recId) return <SharedRecord id={recId} onBack={() => setRecId(null)} />;
    return <SupportHome name={name} nav={bar}
             onOpen={(id) => setRecId(id)} onSettings={() => go('settings')} />;
  }

  // ---- Staff ----
  if (nav === 'cp3') return <JourneyScreen canDecide={false} nav={bar} onBack={home} />;
  if (nav === 'map') return <CapMap nav={bar} onBack={home} />;
  if (nav === 'practice') return (
    <Practice id={recId} storeId={storeId} onBack={home} />
  );
  return (
    <Home name={name} nav={bar}
      onOpen={(id) => { setRecId(id); setNav('practice'); }}
      onNew={() => { setRecId(null); setNav('practice'); }}
      onSettings={() => go('settings')} />
  );
}
