;(()=>{
  if(window.__growthHomeV56)return;
  window.__growthHomeV56=true;
  const prevRenderV56=render;
  const safe=(value)=>typeof esc==='function'?esc(String(value??'')):String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const currentCheckpointV56=()=>{
    const cps=state?.journey?.checkpoints||[];
    return cps.find(c=>c.status==='current')||cps.find(c=>c.status!=='done')||cps[0]||null;
  };
  const daysLeftV56=()=>{
    if(!state?.deadline)return null;
    const end=new Date(`${state.deadline}T23:59:59`);
    if(Number.isNaN(end.getTime()))return null;
    return Math.max(0,Math.ceil((end-Date.now())/86400000));
  };
  const dateLabelV56=(value)=>{
    if(!value)return '未設定';
    const d=new Date(`${value}T00:00:00`);
    if(Number.isNaN(d.getTime()))return value;
    return new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',weekday:'short'}).format(d);
  };
  const nextModelsV56=()=>{
    const rows=Array.isArray(state?.modelPlans)?state.modelPlans:Array.isArray(state?.models)?state.models:[];
    const today=new Date();today.setHours(0,0,0,0);
    return rows.slice().filter(x=>{
      const raw=x.date||x.startDate||'';
      if(!raw)return true;
      const d=new Date(`${raw}T00:00:00`);
      return Number.isNaN(d.getTime())||d>=today;
    }).sort((a,b)=>String(a.date||a.startDate||'9999').localeCompare(String(b.date||b.startDate||'9999'))||String(a.time||a.startTime||'').localeCompare(String(b.time||b.startTime||'')));
  };
  function renderHomeV56(){
    const root=document.getElementById('home');
    if(!root||state.page!=='home')return;
    const cp=currentCheckpointV56();
    const progress=Math.max(0,Math.min(100,Number(state.progress)||0));
    const days=daysLeftV56();
    const evidence=cp?.evidenceItems?.length||0;
    const support=cp?.supportHistory?.length||0;
    const models=nextModelsV56();
    const next=models[0]||null;
    const issue=state?.issue?.title||cp?.issue||'Issue Aはまだ設定されていません。';
    const vision=state?.vision||'Visionを設定してください。';
    const nextAction=next?`${next.name||next.modelName||'モデル'}で「${next.theme||next.memo||issue}」を検証する`:(cp?`${cp.title||'Current Checkpoint'}のEvidenceを1件追加する`:'JourneyでCurrent Checkpointを設定する');
    const modelCards=models.slice(0,3).map(x=>`<button class="home56-model" data-page="planner"><span class="home56-date">${safe(dateLabelV56(x.date||x.startDate))}</span><span class="home56-modelbody"><b>${safe(x.name||x.modelName||'名称未設定')}</b><small>${safe([x.time||x.startTime,x.menu,x.theme||x.memo].filter(Boolean).join(' ・ ')||'詳細未設定')}</small></span><span class="home56-arrow">›</span></button>`).join('');
    root.innerHTML=`
      <div class="home56-topline">
        <div><div class="eyebrow">TODAY / STAFF HOME</div><h1>今日の判断を、ひとつに絞る。</h1><p class="lead">Journeyの現在地から、今日やることと次のモデル検証をつなぎます。</p></div>
        <div class="home56-date-now">${new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</div>
      </div>

      <section class="home56-hero">
        <div class="home56-focus">
          <div class="home56-kicker">TODAY'S PRIORITY</div>
          <h2>${safe(nextAction)}</h2>
          <p>${safe(issue)}</p>
          <div class="home56-actions">
            ${cp?`<button class="btn primary" data-action="open-checkpoint" data-id="${safe(cp.id)}">Checkpointを開く</button>`:'<button class="btn primary" data-page="journey">Journeyを設定</button>'}
            <button class="btn secondary" data-page="practice">Practiceへ</button>
            <button class="btn secondary" data-page="support">Supportへ</button>
          </div>
        </div>
        <div class="home56-ringbox">
          <div class="home56-ring" style="--p:${progress}"><div><b>${progress}%</b><span>Journey</span></div></div>
          <div class="home56-deadline"><span>GOAL</span><b>${safe(state.deadline||'未設定')}</b><small>${days===null?'期限未設定':`あと${days}日`}</small></div>
        </div>
      </section>

      <section class="home56-grid">
        <article class="home56-card home56-current">
          <div class="home56-cardhead"><div><span class="home56-label">CURRENT CHECKPOINT</span><h3>${safe(cp?`${cp.code||''} ${cp.title||''}`:'未設定')}</h3></div><button class="home56-iconbtn" data-page="journey">›</button></div>
          <p>${safe(cp?.criteria||'Journey Mapから現在地を設定してください。')}</p>
          <div class="home56-metrics"><div><span>Evidence</span><b>${evidence}</b></div><div><span>Support</span><b>${support}</b></div><div><span>実績時間</span><b>${Number(cp?.actual)||0}h</b></div></div>
        </article>

        <article class="home56-card home56-nextmodel">
          <div class="home56-cardhead"><div><span class="home56-label">NEXT MODEL</span><h3>${safe(next?.name||next?.modelName||'モデル予定なし')}</h3></div><button class="home56-iconbtn" data-page="planner">›</button></div>
          ${next?`<div class="home56-modeltime"><b>${safe(dateLabelV56(next.date||next.startDate))}</b><span>${safe(next.time||next.startTime||'時間未設定')}</span></div><p>${safe(next.theme||next.memo||next.menu||'検証テーマ未設定')}</p>`:'<p>Model Plannerで先にモデルを押さえ、Checkpointと検証テーマを割り当てます。</p>'}
          <button class="btn secondary home56-wide" data-page="planner">Model Plannerを開く</button>
        </article>

        <article class="home56-card home56-issue">
          <span class="home56-label">ISSUE A</span><h3>${safe(issue)}</h3><p>不足を責めるのではなく、次の検証で解像度を上げるための問い。</p>
          <button class="btn secondary home56-wide" data-page="support">Supportで深掘り</button>
        </article>
      </section>

      <section class="home56-section">
        <div class="home56-sectionhead"><div><span class="home56-label">UPCOMING MODELS</span><h2>先にモデルを入れて、成長を予定にする。</h2></div><button class="btn secondary" data-page="planner">すべて表示</button></div>
        <div class="home56-models">${modelCards||'<div class="home56-empty">モデル予定はまだありません。Model Plannerから登録してください。</div>'}</div>
      </section>

      <section class="home56-vision"><div><span class="home56-label">VISION</span><h2>${safe(vision)}</h2></div><button class="btn secondary" data-page="journey">Journey Mapを見る</button></section>
    `;
  }
  render=function(){prevRenderV56();renderHomeV56()};
  render();
})();
