(function(){
  const css='/admin/css/sbi-ui-fixes.css';
  const key='sbi-assistant-last-notified-count-v2';

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
    if(!v) a.classList.remove('is-notification-mode','is-peeking');
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

  function start(){addCss();setTimeout(bind,250);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
