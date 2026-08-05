// Growth OS Mobile — Support（担当スタッフ ／ 共有された記録）
//
// 担当外は1件も返らない。絞り込みはサーバ（RLS）がやるので、
// ここで staff_id を条件に入れていない。
// 記録を開くと、開いた事実が本人に見える（就業規則 第5条第1項）。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, P, Card, Kicker, Button, Spacer } from '../ui/kit';
import { c, t, r } from '../ui/tokens';
import { assignedStaff, sharedRecords, markViewed, type Staff } from '../lib/support';
import { listImages, imageUrl, viewers, type Record_, type Img } from '../lib/staff';

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

export function SupportHome(p: {
  name: string | null; onOpen: (id: string) => void; onSettings: () => void;
}) {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [recs, setRecs] = useState<(Record_ & { staff_id: string })[] | null>(null);

  useEffect(() => { assignedStaff().then(setStaff); sharedRecords().then(setRecs); }, []);

  const nameOf = (id: string) => staff?.find((s) => s.id === id)?.display_name ?? '—';

  return (
    <Screen bar={<Bar title="Support" right={p.name ?? undefined} />}
      footer={<Button variant="ghost" onClick={p.onSettings}>設定</Button>}>

      <H>{recs === null ? ' ' : recs.length === 0 ? '共有された記録は、まだありません。' : '共有された記録'}</H>

      {recs === null ? <P>読み込んでいます…</P> : recs.length === 0 ? (
        <P>
          担当のスタッフが記録を共有すると、ここに出ます。
          <b style={{ fontWeight: 660, color: c.text }}>開くと、開いた事実が本人に見えます。</b>
        </P>
      ) : (
        <>
          <Spacer h={14} />
          <div style={{ display: 'grid', gap: 9 }}>
            {recs.map((x) => (
              <button key={x.id} onClick={() => p.onOpen(x.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                         padding: '15px 17px', borderRadius: r.card, background: c.card,
                         border: `1px solid ${c.cardLine}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>{x.title}</b>
                  <span style={{ fontSize: 11, color: c.label, flex: '0 0 auto' }}>
                    {md(x.recorded_on)}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: c.weaker }}>
                  {nameOf(x.staff_id)}
                  {x.salon_shared && ' · サロンにも出しています'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 担当スタッフ */}
      <Spacer />
      <Kicker>担当しているスタッフ</Kicker>
      <div style={{ marginTop: 12 }}>
        {staff === null ? <P>…</P> : staff.length === 0 ? (
          <Card tone="flat">
            <div style={{ ...t.small, color: c.weak }}>
              まだ担当がありません。担当の割り当ては運営者と双方の同意で決まります。
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 9 }}>
            {staff.map((s) => (
              <Card key={s.id}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                              justifyContent: 'space-between', gap: 10 }}>
                  <b style={{ fontSize: 14, fontWeight: 660 }}>{s.display_name}</b>
                  <span style={{ font: t.mono, color: c.label }}>{s.person_code}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: c.weaker }}>
                  共有された記録 {recs?.filter((x) => x.staff_id === s.id).length ?? 0} 件
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Spacer h={14} />
      <Card tone="flat">
        <div style={{ ...t.small, color: c.weak }}>
          担当していないスタッフの記録は、ここにも検索にも出ません。
          他店舗に入っても同じです（担当関係がないと1件も返りません）。
        </div>
      </Card>
      <Spacer h={8} />
    </Screen>
  );
}

// ============================================================
// 共有された記録（Support から見る）
// ============================================================

export function SharedRecord(p: { id: string; onBack: () => void }) {
  const [rec, setRec] = useState<Record_ | null>(null);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<{ at: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      // 開いた事実を先に残す。読んでから記録するのでは、
      // 途中で閉じたときに「見たのに残らない」が生まれる
      await markViewed(p.id);
      const { data } = await import('../lib/api').then((m) =>
        m.sb.from('practice_records').select('*').eq('id', p.id).maybeSingle());
      setRec(data as Record_);
      setImgs(await listImages(p.id));
      setSeen(await viewers(p.id));
    })();
  }, [p.id]);

  useEffect(() => {
    imgs.forEach((i) => {
      if (urls[i.id]) return;
      imageUrl(i.storage_path).then((u) => u && setUrls((s) => ({ ...s, [i.id]: u })));
    });
  }, [imgs]);

  if (!rec) return (
    <Screen bar={<Bar title="共有された記録" />}><Spacer h={30} /><P>読み込んでいます…</P></Screen>
  );

  const F: [keyof Record_, string][] = [
    ['question', '今回の問い'], ['fact', '起きたこと（事実）'],
    ['misjudgement', 'ズレた判断'], ['reflection', '反省'],
    ['next_gain', '次回への経験値の貯め方'],
  ];

  return (
    <Screen bar={<Bar title="共有された記録" right={md(rec.recorded_on)} />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>

      <H>{rec.title}</H>

      {imgs.length > 0 && (
        <>
          <Spacer h={18} />
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {imgs.map((i) => (
              <div key={i.id} style={{ width: 74, height: 74, flex: '0 0 auto',
                       borderRadius: r.thumb, border: `1px solid ${c.line}`,
                       background: c.flat, overflow: 'hidden' }}>
                {urls[i.id] && <img src={urls[i.id]} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
            ))}
          </div>
        </>
      )}

      <Spacer h={20} />
      <div style={{ display: 'grid', gap: 18 }}>
        {F.map(([k, label]) => {
          const v = rec[k] as string | null;
          const warm = k === 'misjudgement' || k === 'reflection';
          return (
            <div key={k}>
              <div style={t.field}>{label}</div>
              <div style={{ marginTop: 7, padding: '13px 15px', borderRadius: r.input,
                            background: warm ? c.warmBg : c.card,
                            border: `1px solid ${warm ? c.warmLine : c.cardLine}`,
                            fontSize: 13, lineHeight: 1.8,
                            color: v ? (warm ? c.warmDeep : c.text) : c.label }}>
                {v || '（書かれていません）'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 開いた事実は本人にも見える。ここで自分の名前が並ぶのが正しい */}
      <Spacer h={22} />
      <Card tone="flat">
        <Kicker>この記録を見た人</Kicker>
        <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
          {seen.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                                  gap: 10, fontSize: 12.5 }}>
              <span>{v.name}</span>
              <span style={{ color: c.weaker }}>{v.at.slice(5, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.7, color: c.weaker }}>
          あなたが開いたことは、本人に見えています（就業規則 第5条第1項）。
        </p>
      </Card>
      <Spacer />
    </Screen>
  );
}
