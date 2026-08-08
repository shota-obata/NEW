// Growth OS Mobile — 同意と規定の全文
//
// 同意しないと本体に入れない。抜け道は作らない（担保は画面ではなく RLS の session_ok()）。
// 3番目の項目は、就業規則 第6条の内容をぼかさずそのまま出す。

import { useEffect, useState } from 'react';
import { Screen, Bar, H, Card, Kicker, Button, Spacer } from '../ui/kit';
import { c, t, r, serif } from '../ui/tokens';
import { currentPolicy, consent } from '../lib/api';

const ITEMS: [string, string, boolean][] = [
  ['記録されるもの',
   '施術の記録、before/after の画像、相談と返答、到達の判断、操作履歴（誰がいつ何を見たかを含む）。第4条。', false],
  ['誰が見られるか',
   '個人領域は本人だけ。相談と返答は本人と担当の指導者。育成設計は指導者と運営者。習熟の経過は本人と担当指導者、運営者は要約のみ。スタッフ間に出るのは、あなたが「サロンに出す」を選んだ記録だけです。第3条第3項・別紙「可視領域一覧」。', false],
  ['指導内容の確認について',
   '指導の質を保つため、指導者から従業員への返答内容と返答日数を、運営者が確認することがあります。この確認は個別に通知されず、閲覧履歴にも表示されません。目的は指導体制の見直しに限られ、個人の評価には使いません。確認の停止を求めることができます。', true],
  ['評価に直結しないこと',
   '記録の内容は、人事評価・賞与の査定・昇給の決定に直接用いません。第2条第2項。時間外や定休日に記録を書く義務もありません。第2条第3項。', false],
  ['退職後の扱い',
   '店舗で共有した記録は、氏名を外して（Other として）技術資産に残ります。復元はできません。習熟の経過・能力の記録・相談の内容は、退職の時に削除します。第8条。', false],
];

export function Consent(p: { onDone: () => void; onReadAll: () => void }) {
  const [checked, setChecked] = useState(false);
  const [doc, setDoc] = useState<{ id: string; version: string; effective_from: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { currentPolicy().then((d) => d && setDoc(d as never)); }, []);

  return (
    <Screen bar={<Bar title="同意" right={doc ? `${doc.version} · 初回のみ` : '初回のみ'} />}
      footer={
        <div style={{ display: 'grid', gap: 10 }}>
          <button onClick={() => setChecked((v) => !v)}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                     padding: '13px 15px', borderRadius: r.input, display: 'flex',
                     alignItems: 'center', gap: 12,
                     border: checked ? `1.5px solid ${c.teal}` : `1px solid ${c.toggleOff}`,
                     background: checked ? c.tealBg : c.input }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, flex: '0 0 auto',
                           display: 'grid', placeItems: 'center', color: '#fff',
                           fontSize: 12, fontWeight: 700,
                           background: checked ? c.tealFill : '#fff',
                           border: checked ? 0 : `1.5px solid ${c.radioOff}` }}>
              {checked ? '✓' : ''}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 640, color: checked ? c.tealDeep : c.text }}>
              内容を確認しました
            </span>
          </button>
          <Button disabled={!checked || !doc || busy} onClick={async () => {
            if (!doc) return;
            setBusy(true); setErr(null);
            const ok = await consent(doc.id);
            setBusy(false);
            if (ok) p.onDone(); else setErr('保存できませんでした。通信を確かめて、もう一度お試しください。');
          }}>{busy ? '記録しています…' : '同意して開始'}</Button>
          <Button variant="ghost" onClick={p.onReadAll}>規定の全文を読む</Button>
        </div>
      }>
      <H>このアプリで記録されること</H>
      <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 2.05, color: c.weak }}>
        就業規則 追加条文（全9条）の要点です。内容を確認してから始めてください。
      </p>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {ITEMS.map(([title, body, warn], i) => (
          <div key={title} style={{ padding: '16px 18px', borderRadius: r.card,
                background: warn ? c.warmBg : c.card,
                border: `1px solid ${warn ? c.warmLine : c.cardLine}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em',
                             color: warn ? c.warmText : c.label }}>{i + 1}</span>
              <b style={{ fontSize: 14, fontWeight: 660, color: warn ? c.warmDeep : c.text }}>{title}</b>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 2.05,
                        color: warn ? c.warmDeep : c.weak }}>{body}</p>
          </div>
        ))}
      </div>

      <Spacer h={16} />
      <Card tone="flat">
        <div style={{ fontSize: 12.5, lineHeight: 1.9, color: c.weak }}>
          同意しないと本体に入れません。抜け道は作っていません。
          規定の版が上がったときは、もう一度ここに来ます（変わったところを先頭に出します）。
        </div>
      </Card>
      {doc && (
        <>
          <Spacer h={12} />
          <div style={{ fontSize: 11.5, color: c.weaker }}>
            {doc.version} ／ {doc.effective_from} 施行
          </div>
        </>
      )}
      {err && <><Spacer h={12} /><Card tone="warm">
        <div style={{ fontSize: 12.5, color: c.warmDeep }}>{err}</div></Card></>}
    </Screen>
  );
}

// ============================================================
// 規定の全文（全9条）— 全役割から到達できる
// ============================================================

const ART: [string, string, string[]][] = [
  ['第1条', '目的', ['本規定は、会社が従業員の技術習得および育成を目的として提供する業務用アプリケーション（以下「本システム」という。）の利用、ならびに本システムに記録される情報の取扱いについて、必要な事項を定めるものである。']],
  ['第2条', '本システムの位置づけ', [
    '本システムは、従業員が自らの技術および判断の過程を記録し、指導者の助言を受けながら習熟を進めるための業務上の道具である。',
    '本システムに記録された内容は、人事評価、賞与の査定および昇給の決定に直接用いない。ただし、会社が別に定める評価制度において、上長が総合的に判断する際の参考資料とすることを妨げない。',
    '本システムの利用は所定労働時間内に行うものとし、会社は時間外における記録の作成または返答を義務づけない。']],
  ['第3条', '役割および権限', [
    '本システムの利用者は、その職務に応じて次の三の区分のいずれかまたは複数に属する。\n一　従業員（記録を作成する者）\n二　指導者（従業員に助言し、習熟の到達を判断する者）\n三　運営者（育成の体制および設計を管理する者）',
    '指導者は従業員を兼ねることができる。運営者は、従業員および指導者を兼ねることができない。',
    '区分ごとに閲覧できる情報の範囲は、会社が別紙「可視領域一覧」に定め、これを従業員に周知する。']],
  ['第4条', '記録される情報', [
    '本システムには、次の情報が記録される。\n一　従業員が作成した施術等の記録（日付、表題、事実の経過、判断の内容および所見）\n二　前号に付随して従業員が登録した施術前後の画像\n三　従業員と指導者との間の相談および返答の内容\n四　習熟段階の到達に関する判断およびその理由\n五　本システムの操作履歴（閲覧、作成、変更および削除の記録）',
    '前項第二号の画像に第三者が写り込む場合は、あらかじめ当該第三者の同意を得なければならない。']],
  ['第5条', '閲覧履歴の開示', [
    '会社は、従業員が作成した記録について、何人がいつ閲覧したかを当該従業員に開示する。',
    '前項の定めにかかわらず、次条に定める確認については開示の対象としない。']],
  ['第6条', '指導内容の確認', [
    '会社は、指導の質を確保し、育成の体制を適正に保つため、指導者が従業員に対して行った返答の内容および返答までに要した日数を確認することがある。',
    '前項の確認は運営者の区分に属する者のみが行い、その目的は指導の体制および担当の割り当ての見直しに限る。従業員個人の評価を目的として行わない。',
    '第1項の確認は、対象となる従業員および指導者に対して個別に通知せず、第5条第1項の開示の対象としない。これは、確認の事実を知らせることにより指導者の返答が本来の判断と異なるものとなり、確認の目的を達し得なくなることを避けるためである。',
    '第1項の確認を行うことができる者は、運営者の区分に属する者に限る。',
    '第1項に基づく指導者への指示は、傾向を示す数値をもって行い、個別の返答文を引用しない。',
    '会社は、第1項の確認の対象、目的および期間について、年1回、従業員代表との話し合いの場で確認する。',
    '従業員は、本条の運用に疑義があるときは、第1項の確認の停止を求めることができる。求めがあったときは、会社は理由を書面で示す。',
    '会社は、第1項の確認を行うことがある旨を、本規定の周知をもってあらかじめ全従業員に明らかにする。']],
  ['第7条', '情報の管理', [
    '本システムへの接続は、会社があらかじめ登録した端末からのみ行うことができる。',
    '従業員は、自己に付与された識別番号および暗証番号を他人に使用させ、または貸与してはならない。',
    '本システムに記録された情報を、業務上の必要なく複製し、撮影し、または社外に持ち出してはならない。']],
  ['第8条', '退職後の記録の取扱い', [
    '従業員が退職したときは、当該従業員が作成した施術等の記録および画像のうち、店舗内で共有されたものについて、氏名その他個人を識別する情報を削除したうえで、会社の技術資産として保存する。',
    '前項の記録から当該従業員を特定できる状態に復することはできない。',
    '習熟の経過、能力の記録および相談の内容は、退職の時をもって削除する。',
    '第1項の記録の削除を求める場合は、運営者および指導者の双方の同意ならびに理由の記載を要し、申請から24時間を経過した後に実行する。']],
  ['第9条', '本規定の変更', ['会社は、本規定および別紙「可視領域一覧」を変更したときは、速やかにその内容を全従業員に周知する。第6条を変更する場合は、あらかじめ従業員代表の意見を聴くものとする。']],
];

export function PolicyFull(p: { onBack: () => void }) {
  return (
    <Screen bar={<Bar title="就業規則 追加条文" right="全9条" />}
      footer={<Button variant="outline" onClick={p.onBack}>戻る</Button>}>
      <Spacer h={4} />
      <div style={{ display: 'grid', gap: 20, marginTop: 18 }}>
        {ART.map(([no, title, paras]) => {
          const hot = no === '第6条';
          return (
            <div key={no} style={{ paddingLeft: hot ? 14 : 0,
                                   borderLeft: hot ? `3px solid ${c.teal}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 6,
                            borderBottom: `1px solid ${hot ? c.tealLine : c.line}` }}>
                <b style={{ fontFamily: serif, fontWeight: 400, fontSize: 15.5 }}>{no}</b>
                <span style={{ fontSize: 12.5, fontWeight: 640, color: c.weak }}>（{title}）</span>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 9 }}>
                {paras.map((text, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8,
                                        alignItems: 'start' }}>
                    <span style={{ fontSize: 11.5, color: c.label, paddingTop: 3, textAlign: 'center' }}>
                      {paras.length > 1 ? i + 1 : ''}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 2.05, color: c.quote,
                                   whiteSpace: 'pre-line' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Spacer h={22} />
      <Card tone="flat">
        <Kicker>附則</Kicker>
        <p style={{ margin: '9px 0 0', ...t.small, color: c.weak }}>
          本規定は 2026年8月10日 から施行する。周知していない規定は効力を持ちません。
          変更したときは全員に通達し、第6条を変更する場合は、あらかじめ従業員代表の意見を聴きます（第9条）。
        </p>
      </Card>
      <Spacer />
    </Screen>
  );
}
