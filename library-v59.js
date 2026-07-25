;(()=>{
  if(window.__growthLibraryV59)return;
  window.__growthLibraryV59=true;
  state.libraryUi=state.libraryUi&&typeof state.libraryUi==='object'?state.libraryUi:{query:'',filter:'all',view:'grid'};
  const prevRender=render;
  function apply(){
    const root=document.getElementById('library');if(!root||state.page!=='library')return;
    const assets=root.querySelector('.assets');if(!assets)return;
    const q=(state.libraryUi.query||'').trim().toLowerCase(),filter=state.libraryUi.filter||'all';
    const cards=[...assets.querySelectorAll('.asset')];let visible=0;
    cards.forEach((card,i)=>{const item=(state.library||[])[i]||{};const tag=String(item.tag||'other').toLowerCase();const text=[item.title,item.tag,item.case,item.decision,item.correction,item.rule,item.next,card.textContent].filter(Boolean).join(' ').toLowerCase();const okQ=!q||text.includes(q);const okF=filter==='all'||tag.includes(filter);card.hidden=!(okQ&&okF);card.dataset.libraryTag=tag;if(!card.hidden)visible++});
    const count=root.querySelector('#lib59Count');if(count)count.textContent=`${visible} / ${cards.length} assets`;
    assets.classList.toggle('library59-list',state.libraryUi.view==='list');
    root.querySelectorAll('[data-lib59-view]').forEach(b=>b.classList.toggle('active',b.dataset.lib59View===state.libraryUi.view));
    root.querySelectorAll('[data-lib59-filter]').forEach(b=>b.classList.toggle('active',b.dataset.lib59Filter===filter));
  }
  function enhance(){
    const root=document.getElementById('library');if(!root||state.page!=='library')return;
    root.classList.add('library59-root');
    const head=root.querySelector('.head');if(head){const eye=head.querySelector('.eyebrow');if(eye)eye.textContent='KNOWLEDGE LIBRARY';const h=head.querySelector('h1');if(h)h.textContent='判断を、次回使える資産にする。';const lead=head.querySelector('.lead');if(lead)lead.textContent='PracticeとSupportで得た判断を、画像・修正履歴・転用ルールと一緒に蓄積します。'}
    const assets=root.querySelector('.assets');if(!assets)return;
    if(!root.querySelector('.library59-toolbar')){const bar=document.createElement('div');bar.className='library59-toolbar';bar.innerHTML=`<div class="library59-search"><span>⌕</span><input id="lib59Search" value="${String(state.libraryUi.query||'').replace(/"/g,'&quot;')}" placeholder="タイトル・判断・タグを検索"></div><div class="library59-filters"><button data-lib59-filter="all">All</button><button data-lib59-filter="practice">Practice</button><button data-lib59-filter="support">Support</button><button data-lib59-filter="transfer">Transfer</button></div><div class="library59-meta"><span id="lib59Count"></span><div class="library59-view"><button data-lib59-view="grid" aria-label="Grid">▦</button><button data-lib59-view="list" aria-label="List">☷</button></div></div>`;assets.before(bar)}
    [...assets.querySelectorAll('.asset')].forEach((card,i)=>{const item=(state.library||[])[i]||{};card.classList.add('library59-card');const img=card.querySelector('.assetimg,.assetempty');if(img)img.classList.add('library59-media');const title=card.querySelector('h3');if(title&&!card.querySelector('.library59-index')){const idx=document.createElement('span');idx.className='library59-index';idx.textContent=String(i+1).padStart(2,'0');title.before(idx)}if(item.tag&&!card.querySelector('.library59-tagline')){const line=document.createElement('div');line.className='library59-tagline';line.textContent=item.tag;const media=card.querySelector('.library59-media');if(media)media.after(line);else card.prepend(line)}});
    apply();
  }
  render=function(){prevRender();enhance()};
  document.addEventListener('input',e=>{if(e.target.id==='lib59Search'){state.libraryUi.query=e.target.value;apply()}});
  document.addEventListener('click',e=>{const f=e.target.closest('[data-lib59-filter]');if(f){state.libraryUi.filter=f.dataset.lib59Filter;if(typeof save==='function')save();apply();return}const v=e.target.closest('[data-lib59-view]');if(v){state.libraryUi.view=v.dataset.lib59View;if(typeof save==='function')save();apply()}});
  render();
})();
