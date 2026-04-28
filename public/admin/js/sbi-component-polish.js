(function(){
  const BRAND_SVG = '<svg class="sbi-polish-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12 12 2Zm0 4.5 5.5 5.5-5.5 5.5L6.5 12 12 6.5Z"/></svg>';

  const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

  function getSpace(){
    const path = location.pathname.toLowerCase();
    if(path.startsWith('/admin/')) return {label:'Console', accent:'var(--accent-blue, #2A57FF)'};
    if(path.startsWith('/teacher/')) return {label:'Prof', accent:'var(--accent-orange, #f97316)'};
    if(path.startsWith('/student/')) return {label:'Étudiant', accent:'var(--accent-blue, #2A57FF)'};
    return null;
  }

  function cleanTextNodes(root){
    if(!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const parent = node.parentElement;
        if(!parent || parent.closest('script, style, svg')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if(node.nodeValue && EMOJI_RE.test(node.nodeValue)){
        node.nodeValue = node.nodeValue.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ');
      }
    });
  }

  function polishBrand(){
    const space = getSpace();
    const zone = document.querySelector('#left-panel .logo-zone');
    if(!space || !zone || zone.dataset.sbiPolishBrand === 'true') return;

    zone.dataset.sbiPolishBrand = 'true';
    zone.innerHTML = BRAND_SVG + '<span class="sbi-polish-brand-main" style="color:'+space.accent+'">SBI</span><span class="sbi-polish-brand-sub">'+space.label+'</span>';
  }

  function polishNavItems(){
    document.querySelectorAll('#left-panel .nav-item').forEach((item) => {
      item.dataset.sbiPolished = 'true';
      const svg = item.querySelector('svg');
      if(svg) svg.setAttribute('aria-hidden','true');
    });
  }

  function releasePreload(){
    if(document.body.classList.contains('preload')){
      document.body.classList.remove('preload');
    }
  }

  function run(){
    cleanTextNodes(document.getElementById('app-container') || document.body);
    polishBrand();
    polishNavItems();
    window.setTimeout(releasePreload, 350);
  }

  function start(){
    run();
    window.setTimeout(run, 120);
    window.setTimeout(run, 550);

    const target = document.getElementById('app-container') || document.body;
    const observer = new MutationObserver(() => run());
    observer.observe(target, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
