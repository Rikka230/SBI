(function(){
  const css='/admin/css/sbi-ui-fixes.css';
  const key='sbi-assistant-last-notified-count-v2';
  window.__SBI_ASSISTANT_AUDIO_DISABLED=false;

  function addCss(){
    if(document.querySelector('link[href="'+css+'"]')) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=css;
    document.head.appendChild(link);
  }

  function assistant(){return document.querySelector('.sbi-assistant');}

  function openState(v){
    const a=assistant();
    const t=a?.querySelector('.sbi-assistant__trigger');
    if(!a) return;
    a.classList.toggle('is-open',v);
    t?.setAttribute('aria-expanded',String(v));
    if(!v) a.classList.remove('is-notification-mode','is-peeking','is-attention');
  }

  function moveNotifs(){
    const a=assistant();
    const host=a?.querySelector('[data-assistant-notification-host]');
    const section=document.getElementById('notifications-section');
    if(!host||!section||host.contains(section)) return;
    host.appendChild(section);
  }

  function syncBadge(){
    const a=assistant();
    const badge=a?.querySelector('.sbi-assistant__badge');
    const bell=document.getElementById('bell-badge');
    if(!a||!badge||!bell) return;
    const raw=(bell.textContent||'0').trim();
    const count=raw==='9+'?10:(parseInt(raw,10)||0);
    const visible=bell.style.display!=='none'&&count>0;
    const old=parseInt(localStorage.getItem(key)||'0',10)||0;
    badge.textContent=raw;
    a.classList.toggle('has-notifications',visible);
    if(visible&&count>old&&document.visibilityState==='visible'){
      localStorage.setItem(key,String(count));
      a.classList.add('has-new-notification');
      setTimeout(()=>a.classList.remove('has-new-notification'),1000);
    }
    if(!visible&&old!==0){
      localStorage.setItem(key,'0');
    }
  }

  function normalizeUrl(href){
    try{return new URL(href,location.href);}catch{return null;}
  }

  function shouldMaskNavigation(link, url){
    if(!link||!url) return false;
    const href=link.getAttribute('href')||'';
    if(!href||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('tel:')) return false;
    if(link.target==='_blank') return false;
    if(url.origin!==location.origin) return false;
    if(url.pathname===location.pathname&&url.search===location.search) return false;
    if(link.closest('[data-no-transition]')) return false;
    return true;
  }

  function showExitMask(){
    document.body.classList.add('sbi-page-exiting');
  }

  function bindPageExit(){
    if(window.__SBI_PAGE_EXIT_BOUND==='1') return;
    window.__SBI_PAGE_EXIT_BOUND='1';

    document.addEventListener('click',function(e){
      const link=e.target.closest?.('a[href]');
      if(!link) return;
      const url=normalizeUrl(link.getAttribute('href')||'');
      if(!shouldMaskNavigation(link,url)) return;
      if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      showExitMask();
      setTimeout(()=>{location.href=url.href;},120);
    },true);
  }

  function switchStudentTab(tabId, trigger){
    const target=document.getElementById(tabId);
    if(!target) return;

    const navRoot=trigger?.closest?.('.student-sub-nav') || document.querySelector('.student-sub-nav');
    const navItems=navRoot ? navRoot.querySelectorAll('.student-sub-nav-item') : document.querySelectorAll('.student-sub-nav-item');
    const views=document.querySelectorAll('.student-view');

    navItems.forEach(el=>el.classList.remove('active'));
    views.forEach(el=>el.classList.remove('active'));

    const activeTrigger=trigger || Array.from(navItems).find(el=>{
      const onclick=el.getAttribute('onclick')||'';
      return onclick.includes("'"+tabId+"'")||onclick.includes('"'+tabId+'"');
    });

    activeTrigger?.classList.add('active');
    target.classList.add('active');
  }

  function bindStudentTabs(){
    window.switchTab=function(tabId){
      const trigger=window.event?.currentTarget || document.activeElement?.closest?.('.student-sub-nav-item') || null;
      switchStudentTab(tabId,trigger);
    };

    document.addEventListener('click',function(e){
      const item=e.target.closest?.('.student-sub-nav-item');
      if(!item) return;
      const onclick=item.getAttribute('onclick')||'';
      const match=onclick.match(/switchTab\(['\"]([^'\"]+)['\"]\)/);
      if(!match) return;
      e.preventDefault();
      e.stopPropagation();
      switchStudentTab(match[1],item);
    },true);
  }

  function bind(){
    const a=assistant();
    if(!a||a.dataset.safeFix==='1') return;
    a.dataset.safeFix='1';
    a.addEventListener('click',function(e){
      if(e.target.closest('[data-assistant-close]')){
        e.preventDefault();e.stopPropagation();openState(false);return;
      }
      if(e.target.closest('[data-assistant-notifications]')){
        e.preventDefault();e.stopPropagation();moveNotifs();a.classList.toggle('is-notification-mode');openState(true);
      }
    },true);
    const waitBell=function(){
      const bell=document.getElementById('bell-badge');
      if(!bell){setTimeout(waitBell,150);return;}
      new MutationObserver(syncBadge).observe(bell,{attributes:true,childList:true,characterData:true,subtree:true,attributeFilter:['style']});
      syncBadge();
    };
    waitBell();
  }

  function start(){
    addCss();
    bindStudentTabs();
    bindPageExit();
    setTimeout(bind,250);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
