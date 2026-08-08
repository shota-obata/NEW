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
import { SupportHome, SharedRecord, StaffList, StaffDetail } from './screens/Support';
import { MgmtHome, Quality, Devices, Design, StoreSettingsScreen,
         ViewLock, PolicyNudge, BusinessHours, Retirement } from './screens/Mgmt';
import { JourneyScreen, CapMap, InboxScreen, PostNotice, Holds,
         NewCheckpoint, NextQuestion } from './screens/Core';
import { RoleSwitch } from './screens/Role';
import { Personal } from './screens/Personal';
import { currentCP, myJourney, checkpoints } from './lib/core';
import { assignedStaff } from './lib/support';
import { gateOpen } from './lib/mgmt';
import { myStore } from './lib/staff';
import { Screen, Bar, P, Spacer, TabBar, Pills, MgmtNav, type Item } from './ui/kit';
import { loginGate, session, signOut, me, chosenRole, type Next, type Role } from './lib/api';

type Gate = 'boot' | 'register' | 'login' | 'change_pin' | 'consent';

// Staff の CP タブは「現在の未到達CP」1件を出すので、
// ラベルはその code に追従する。全部到達していれば "CP" のまま。
const TABS = (cp: string | null): Record<Role, Item[]> => ({
  staff: [['home', 'Home'], ['practice', 'Practice'], ['cp', cp ?? 'CP'],
          ['map', 'Map'], ['inbox', '受信'], ['role', '役割']],
  support: [['home', 'Home'], ['inbox', '受信'], ['staff', 'スタッフ'],
            ['notice', '通達'], ['role', '役割']],
  mgmt: [['home', 'Home'], ['inbox', '受信'], ['design', '設計'], ['notice', '通達'],
         ['view', '閲覧'], ['devices', '端末'], ['settings', '設定'], ['role', '役割']],
});

// CP を置く／次の問いを渡すのに要る文脈を、まとめて引く
async function cpContext(staffId: string) {
  const j = await myJourney(staffId);
  if (!j) return null;
  const all = await checkpoints(j.id);
  return { journeyId: j.id, nextCode: `CP${all.length + 1}`,
           existing: all.map((x) => x.code) };
}

export function App() {
  const [gate, setGate] = useState<Gate | 'ok'>('boot');
  const [role, setRole] = useState<Role>(chosenRole());
  const [nav, setNav] = useState('home');
  const [sub, setSub] = useState<string | null>(null);   // 画面内のさらに奥
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [recId, setRecId] = useState<string | null>(null);
  const [cpCode, setCpCode] = useState<string | null>(null);
  const [cpCtx, setCpCtx] = useState<
    { journeyId: string; nextCode: string; existing: string[]; cpId?: string } | null>(null);
  const [targets, setTargets] = useState<{ id: string; display_name: string }[]>([]);
  const [gateOk, setGateOk] = useState<boolean | null>(null);

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
      currentCP().then(({ cp }) => setCpCode(cp?.code ?? null));
      // 通達の「対象」に入れられるのは担当スタッフだけ
      assignedStaff().then((xs) =>
        setTargets(xs.map((x) => ({ id: x.id, display_name: x.display_name }))));
      gateOpen().then(setGateOk);
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

  const tabs = TABS(cpCode);
  const bar = role === 'staff'
    ? { tabs: <TabBar items={tabs.staff} at={nav} onGo={go} /> }
    : role === 'support'
      ? { nav: <Pills items={tabs.support} at={nav} onGo={go} /> }
      : { nav: <MgmtNav items={tabs.mgmt} at={nav} onGo={go} /> };

  // ---- 役割の切替（兼務がいる。小畑さんは Support ＋ Staff）----
  if (nav === 'role') {
    if (sub === 'personal') return <Personal onBack={() => setSub(null)} />;
    return (
    <RoleSwitch current={role} name={name} personCode={code}
      onPersonal={() => setSub('personal')}
      onPick={(r) => { setRole(r); setNav('home'); }}
      onSignOut={async () => { await signOut(); setGate('login'); }} />
    );
  }

  // ---- 共通 ----
  if (nav === 'inbox') return (
    <InboxScreen nav={bar} onBack={home}
      onOpenRecord={role === 'staff' ? (id) => { setRecId(id); setNav('practice'); } : undefined} />
  );
  if (nav === 'holds') return <Holds nav={bar} onBack={home} />;
  if (nav === 'settings' && role !== 'mgmt') return (
    <Settings name={name} personCode={code}
      onPolicy={() => setSub('policy')}
      onSignOut={async () => { await signOut(); setGate('login'); }}
      onBack={home} />
  );

  // ---- Management ----
  if (role === 'mgmt') {
    // 閲覧。3条件が揃うまでロック画面。開くボタンは置かない（第5便 AN）
    if (nav === 'view') {
      if (sub === 'nudge') return <PolicyNudge nav={bar} onBack={() => setSub(null)} />;
      return gateOk === null ? (
        <Screen {...bar} bar={<Bar title="閲覧" />}><Spacer h={30} />
          <P>確認しています…</P></Screen>
      ) : gateOk ? (
        <Quality nav={bar} onBack={home} />
      ) : (
        <ViewLock nav={bar} onNudge={() => setSub('nudge')}
          onPolicy={() => setSub('policy')} />
      );
    }
    if (nav === 'design') return (
      <Design nav={bar} onQuality={() => go('view')} onBack={home} />
    );
    if (nav === 'devices') return <Devices nav={bar} onBack={home} />;
    if (nav === 'notice') return <PostNotice kind="mgmt_to_all" nav={bar} onBack={home} />;
    if (nav === 'settings') {
      if (sub === 'hours') return <BusinessHours nav={bar} onBack={() => setSub(null)} />;
      if (sub === 'retire') return <Retirement nav={bar} onBack={() => setSub(null)} />;
      return (
        <StoreSettingsScreen nav={bar}
          onHours={() => setSub('hours')}
          onRetirement={() => setSub('retire')}
          onPolicy={() => setSub('policy')}
          onBack={home} />
      );
    }
    return <MgmtHome name={name} nav={bar} onQuality={() => go('view')}
             onDesign={() => go('design')}
             onSettings={() => go('settings')} />;
  }

  // ---- Support ----
  if (role === 'support') {
    if (recId) return (
      <SharedRecord id={recId} onBack={() => setRecId(null)} />
    );
    if (nav === 'notice') return (
      <PostNotice kind="support_to_mgmt" nav={bar} targets={targets} onBack={home} />
    );
    if (nav === 'newcp' && cpCtx) return (
      <NewCheckpoint journeyId={cpCtx.journeyId} nextCode={cpCtx.nextCode}
        existing={cpCtx.existing}
        onDone={() => { setCpCtx(null); go('staff'); }}
        onCancel={() => { setCpCtx(null); go('staff'); }} />
    );
    if (nav === 'nextq' && cpCtx) return (
      <NextQuestion cpId={cpCtx.cpId!} journeyId={cpCtx.journeyId} nextCode={cpCtx.nextCode}
        nav={bar}
        onDone={() => { setCpCtx(null); go('staff'); }}
        onBack={() => { setCpCtx(null); go('staff'); }} />
    );
    if (nav === 'staff') {
      // 一覧 → 詳細。担当が1名でも一覧を飛ばさない
      if (sub) return (
        <StaffDetail staffId={sub} nav={bar}
          onBack={() => setSub(null)}
          onOpenRecord={(id) => setRecId(id)}
          onNotice={() => go('notice')}
          onNewCp={async () => { const x = await cpContext(sub); if (x) { setCpCtx(x); setNav('newcp'); } }}
          onNextQuestion={async (cpId) => {
            const x = await cpContext(sub); if (x) { setCpCtx({ ...x, cpId }); setNav('nextq'); }
          }} />
      );
      return <StaffList nav={bar} onOpen={(id) => setSub(id)} />;
    }
    return <SupportHome name={name} nav={bar}
             onOpen={(id) => setRecId(id)}
             onStaff={(id) => { setNav('staff'); setSub(id); }}
             onList={() => go('staff')}
             onSettings={() => go('settings')} />;
  }

  // ---- Staff ----
  if (nav === 'cp') return (
    <JourneyScreen canDecide={false} nav={bar} onBack={home} onHolds={() => go('holds')} />
  );
  if (nav === 'map') return <CapMap nav={bar} onBack={home} />;
  if (nav === 'practice') return (
    <Practice id={recId} storeId={storeId} onBack={home} />
  );
  return (
    <Home name={name} nav={bar}
      onOpen={(id) => { setRecId(id); setNav('practice'); }}
      onNew={() => { setRecId(null); setNav('practice'); }}
      onHolds={() => go('holds')}
      onInbox={() => go('inbox')}
      onPolicy={() => setSub('policy')}
      onSettings={() => go('settings')} />
  );
}
