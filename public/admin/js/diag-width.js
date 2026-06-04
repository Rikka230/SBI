// [DIAG-WIDTH] Instrumentation TEMPORAIRE de débordement horizontal (Candidat A/B mobile).
// Inerte sauf si l'URL contient ?diagwidth. Affiche un overlay nommant les éléments
// dont le bord droit dépasse la largeur du viewport → l'utilisateur screenshote.
// À RETIRER une fois la cause trouvée (grep [DIAG-WIDTH]).
(function () {
  if (!/[?&]diagwidth/.test(location.search)) return;

  const scan = () => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 1) {
        // ne garder que les "feuilles" coupables : un élément dont AUCUN enfant ne
        // déborde autant → c'est lui qui pousse la largeur.
        offenders.push({
          el,
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().trim().slice(0, 60),
          id: el.id || '',
          right: Math.round(r.right),
          width: Math.round(r.width),
          ml: getComputedStyle(el).marginLeft,
        });
      }
    });
    offenders.sort((a, b) => b.right - a.right);

    const main = document.getElementById('main-content');
    const mainCs = main ? getComputedStyle(main) : null;

    let html = `<div style="font-weight:800;font-size:14px;margin-bottom:6px;color:#fff">`
      + `DIAG LARGEUR — viewport ${vw}px · document ${document.documentElement.scrollWidth}px · `
      + `débord ${document.documentElement.scrollWidth - vw}px</div>`;
    if (mainCs) {
      const mr = main.getBoundingClientRect();
      html += `<div style="color:#ffd76a;margin-bottom:6px">#main-content: width ${Math.round(mr.width)} · left ${Math.round(mr.left)} · `
        + `margin ${mainCs.marginLeft}/${mainCs.marginRight} · overflowX ${mainCs.overflowX}</div>`;
    }
    html += `<div style="color:#9fb0ff;margin-bottom:4px">body.class = ${document.body.className}</div>`;
    if (!offenders.length) {
      html += `<div style="color:#7ef0a8">Aucun élément ne dépasse le viewport (débord = ${document.documentElement.scrollWidth - vw}px).</div>`;
    } else {
      html += offenders.slice(0, 14).map((o, i) =>
        `<div style="color:#ffb3b3;border-top:1px solid #333;padding:3px 0">`
        + `${i + 1}. <b>${o.tag}</b>${o.id ? '#' + o.id : ''}${o.cls ? ' .' + o.cls.replace(/\s+/g, '.') : ''}`
        + ` — right <b>${o.right}</b> w ${o.width} ml ${o.ml}</div>`
      ).join('');
    }
    overlay.innerHTML = html;
  };

  const overlay = document.createElement('div');
  overlay.id = 'sbi-diag-width-overlay';
  overlay.style.cssText = 'position:fixed;left:6px;right:6px;bottom:6px;z-index:999999;'
    + 'background:rgba(8,10,20,.96);border:2px solid #2A57FF;border-radius:10px;padding:10px;'
    + 'font:12px/1.35 ui-monospace,monospace;color:#e6eaf5;max-height:46vh;overflow:auto;'
    + 'box-shadow:0 8px 28px rgba(0,0,0,.6)';
  const btn = document.createElement('button');
  btn.textContent = '🔄 RE-SCAN LARGEUR';
  btn.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000000;'
    + 'background:#2A57FF;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:800;font-size:13px';
  btn.addEventListener('click', scan);

  const start = () => { document.body.appendChild(overlay); document.body.appendChild(btn); scan(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  // re-scan auto après le rendu des lignes (données async)
  [1200, 2500, 4500].forEach((t) => window.setTimeout(scan, t));
})();
