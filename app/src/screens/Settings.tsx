// Growth OS Mobile — 設定
//
// 一度だけ決めるもの、たまにしか使わないものは、ここに集める。
// 日常の画面（Home）に置かない — 目の前にあると、それ自体が判断になる。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Spacer , type NavSlots } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { getProfile, saveProfile, yearsSince, type Profile } from '../lib/staff';
import { pushSupported, subscribePush, unsubscribePush, isSubscribed } from '../lib/push';

export function Settings(p: {
  name: string | null; personCode: string | null;
  onPolicy: () => void; onSignOut: () => void; onBack: () => void;
  onDevices?: () => void;
  nav?: NavSlots;
}) {
  const [pf, setPf] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [subbed, setSubbed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getProfile().then(setPf); isSubscribed().then(setSubbed); }, []);

  const patch = async (v: Partial<Profile>) => {
    if (!pf) return;
    setPf({ ...pf, ...v });
    const ok = await saveProfile(v);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1600); }
  };

  const years = yearsSince(pf?.experience_started_on ?? null);

  return (
    <Screen {...p.nav} bar={<Bar title="設定" right={saved ? '保存しました' : (p.personCode ?? undefined)} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{p.name ?? 'あなた'}</H>
      <P>ここにあるものは、一度決めればしばらく触りません。</P>

      {/* ---- プロフィール ---- */}
      <Spacer />
      <Kicker>あなたのこと</Kicker>
      <div style={{ marginTop: 12 }}>
        <Card>
          <div style={{ display: 'grid', gap: 18 }}>
            <label style={{ display: 'grid', gap: 7 }}>
              <span style={t.field}>美容師としての経験開始日</span>
              <input type="date" value={pf?.experience_started_on ?? ''}
                onChange={(e) => patch({ experience_started_on: e.target.value || null })}
                style={inputStyle} />
              <span style={{ fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
                入社日ではなく、美容師として働き始めた日です。
                {years !== null && ` いまで ${years} 年。`}
              </span>
            </label>

            <label style={{ display: 'grid', gap: 7 }}>
              <span style={t.field}>生年月日</span>
              <input type="date" value={pf?.birth_date ?? ''}
                onChange={(e) => patch({ birth_date: e.target.value || null })}
                style={inputStyle} />
              <span style={{ fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
                <b style={{ fontWeight: 660, color: c.text }}>生年月日そのものは、誰にも見えません。</b>
                {' '}下のスイッチを入れたときに、年齢だけが出ます。
              </span>
            </label>

            <button onClick={() => patch({ show_age: !pf?.show_age })}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                       padding: '13px 15px', borderRadius: r.input, display: 'flex',
                       alignItems: 'center', gap: 12,
                       border: pf?.show_age ? `1.5px solid ${c.teal}` : `1px solid ${c.toggleOff}`,
                       background: pf?.show_age ? c.tealBg : c.input }}>
              <span style={{ display: 'grid', gap: 3, flex: 1 }}>
                <b style={{ fontSize: 13.5, fontWeight: 640,
                            color: pf?.show_age ? c.tealDeep : c.text }}>年齢を見せる</b>
                <small style={{ fontSize: 11.5, lineHeight: 1.6, color: c.weaker }}>
                  同じ店舗の人に、年齢だけが見えます
                </small>
              </span>
              <span style={{ width: 40, height: 24, borderRadius: r.pill, flex: '0 0 auto',
                             padding: 3, display: 'flex',
                             justifyContent: pf?.show_age ? 'flex-end' : 'flex-start',
                             background: pf?.show_age ? c.tealFill : c.toggleOff }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
              </span>
            </button>
          </div>
        </Card>
      </div>

      <Spacer h={12} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          経験年数は、担当のSupportと運営者までが見ます。
          <b style={{ fontWeight: 660, color: c.text }}>スタッフ間には見えません。</b>
          {' '}比較が始まるのを避けるためです。用途は Capability Map の読み方の補助で、
          評価には使いません。
        </div>
      </Card>

      {/* ---- 通知 ---- */}
      <Spacer />
      <Kicker>通知</Kicker>
      <div style={{ marginTop: 12 }}>
        {!pushSupported() ? (
          <Card tone="flat">
            <div style={{ ...t.small, color: c.weak, lineHeight: 1.9 }}>
              この端末では通知を受け取れません。
              <b style={{ fontWeight: 660, color: c.text }}>ホーム画面に追加すると届くようになります。</b>
              {' '}追加していなくても、未読があればアプリを開いたときにお知らせします。
            </div>
          </Card>
        ) : (
          <>
            <Button variant={subbed ? 'outline' : 'fill'} disabled={busy}
              onClick={async () => {
                setBusy(true);
                if (subbed) { await unsubscribePush(); setSubbed(false); }
                else { const rr = await subscribePush(); setSubbed(rr === 'ok'); }
                setBusy(false);
              }}>
              {subbed ? '通知を止める' : '通知を受け取る'}
            </Button>
            <div style={{ marginTop: 10, ...t.small, color: c.weaker, lineHeight: 1.8 }}>
              届くのは「受信ボックスに届いています。」の一言だけです。
              <b style={{ fontWeight: 660, color: c.text }}>誰から何が来たかは書きません。</b>
              {' '}画面を開かないと分からない形にしてあります。営業時間内にだけ鳴ります。
            </div>
          </>
        )}
      </div>

      {/* ---- 規定 ---- */}
      <Spacer />
      <Kicker>規定</Kicker>
      <div style={{ marginTop: 12 }}>
        <Button variant="outline" onClick={p.onPolicy}>
          就業規則 追加条文（全9条）を読む
        </Button>
      </div>
      <div style={{ marginTop: 10, ...t.small, color: c.weaker }}>
        版が上がったときは、次にサインインしたときにお知らせします。
      </div>

      {p.onDevices && (
        <>
          <Spacer />
          <Kicker>運営</Kicker>
          <div style={{ marginTop: 12 }}>
            <Button variant="outline" onClick={p.onDevices}>端末とアカウントの管理</Button>
          </div>
          <div style={{ marginTop: 10, ...t.small, color: c.weaker }}>
            登録コードの発行、仮PINの再発行、端末の失効、ロックの解除。
          </div>
        </>
      )}

      {/* ---- サインアウト ---- */}
      <Spacer />
      <Button variant="ghost" onClick={p.onSignOut}>サインアウト</Button>
      <Spacer />
    </Screen>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '0 14px', borderRadius: r.input,
  border: `1px solid ${c.line}`, background: c.input, font: 'inherit',
  fontSize: 15, color: c.text, outline: 'none',
};
