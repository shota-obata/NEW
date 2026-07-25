;(()=>{
  if(window.__growthSupportV58)return;
  window.__growthSupportV58=true;
  const prevRender=render;
  const safe=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
  const cpNow=()=>{const cps=state?.journey?.checkpoints||[];return cps.find(c=>c.status==='current')||cps.find(c=>c.status!=='done')||cps[0]||null};
  function renderSupportV58(){
    const root=document.getElementById('support');if(!root||state.page!=='support')return;
    const cp=cpNow();
    const sessions=(state.supportSessions||[]).filter(x=>!cp||x.checkpointId===cp.id).slice().reverse();
    const evidence=cp?.evidenceItems?.length||0;
    root.innerHTML=`
      <div class="support58-head"><div><div class="eyebrow">SUPPORT WORKSPACE</div><h1>答えを渡さず、判断を修正する。</h1><p class="lead">比較から原因を特定し、次の検証まで一つの流れで記録します。</p></div><button class="btn secondary" data-page="practice">Practiceへ戻る</button></div>
      <section class="support58-status">
        <div><span>CURRENT CHECKPOINT</span><b>${safe(cp?`${cp.code||''} ${cp.title||''}`:'未設定')}</b><small>${safe(cp?.criteria||'到達条件未設定')}</small></div>
        <div class="support58-issue"><span>ISSUE A</span><b>${safe(state?.issue?.title||cp?.issue||'未設定')}</b><small>次の検証で更新される問い</small></div>
        <div><span>EVIDENCE</span><strong>${evidence}</strong><small>Support記録 ${sessions.length}件</small></div>
      </section>
      <section class="support58-layout">
        <div class="support58-canvas">
          <div class="support58-progress"><span class="active">COMPARE</span><i></i><span>DIAGNOSE</span><i></i><span>CORRECT</span><i></i><span>TEST</span></div>
          <div class="support58-grid">
            <label class="support58-step"><div><i>1</i><span>COMPARE</span></div><h2>何と何を比べると、違いが見えるか。</h2><p>良い・悪いではなく、完成像・条件・判断の差を並べる。</p><textarea id="spCompare" placeholder="例：同じ長さでも、骨格Aと骨格Bでは基準点をどこに置いたか？"></textarea></label>
            <label class="support58-step"><div><i>2</i><span>DIAGNOSE</span></div><h2>ズレは、どの判断で生まれたか。</h2><p>観察・完成像・基準点・操作のどこで因果が切れたか。</p><textarea id="spDiagnosis" placeholder="原因を構造として記録する"></textarea></label>
            <label class="support58-step"><div><i>3</i><span>CORRECT</span></div><h2>次回、何をどう判断し直すか。</h2><p>手順を増やすのではなく、判断基準を一つ修正する。</p><textarea id="spCorrection" placeholder="Supportとしての修正"></textarea></label>
            <label class="support58-step support58-next"><div><i>4</i><span>NEXT TEST</span></div><h2>どの条件で、もう一度確かめるか。</h2><p>曖昧な課題ではなく、モデルで検証できる問いにする。</p><textarea id="spNext" placeholder="次のIssue Aになる検証文"></textarea></label>
          </div>
          <div class="support58-actions"><button class="btn secondary" data-action="save-support">記録だけ保存</button><div></div><button class="btn secondary" data-action="support-to-library">Library化</button><button class="btn primary" data-action="apply-support">Issue Aへ反映</button></div>
        </div>
        <aside class="support58-side">
          <div class="support58-sidecard"><span>SUPPORT RULE</span><h3>本人を暗くさせるダメ出しにしない。</h3><p>目標を達成するために、不足を発見し、判断を深掘りする。人格や才能の評価にはしない。</p></div>
          <div class="support58-sidecard"><span>QUESTION LENS</span><ul><li>完成像は一致しているか</li><li>基準点の理由を説明できるか</li><li>操作と結果の因果があるか</li><li>別条件でも転用できるか</li></ul></div>
          <button class="btn secondary" data-action="open-checkpoint" data-id="${safe(cp?.id||'')}">Checkpointを開く</button>
        </aside>
      </section>
      <section class="support58-history"><div class="support58-historyhead"><div><span>SUPPORT HISTORY</span><h2>判断の修正履歴</h2></div><b>${sessions.length} sessions</b></div><div class="support58-timeline">${sessions.map((x,i)=>`<article><div class="support58-node">${sessions.length-i}</div><div class="support58-historybody"><div><b>${safe(x.by||'Support')}</b><span>${safe(x.at||'')}</span></div><h3>${safe(x.next||x.issue||'検証未設定')}</h3><dl><dt>比較</dt><dd>${safe(x.compare||'-')}</dd><dt>診断</dt><dd>${safe(x.diagnosis||'-')}</dd><dt>修正</dt><dd>${safe(x.correction||'-')}</dd></dl></div></article>`).join('')||'<div class="support58-empty">まだSupport記録はありません。</div>'}</div></section>`;
  }
  render=function(){prevRender();renderSupportV58()};
  render();
})();
