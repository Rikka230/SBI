// SBI 8.0P.167.287 — Espace Tuteur / Maître d'apprentissage (thème vert lime).
// Calqué sur teacher-panels.js. Accent : var(--accent-lime).
import { ICONS, brand, defineOnce } from './shared-icons.js';
import { dispatchComponentMounted } from './ready.js';
import { signOutToLogin } from './shared-actions.js';

const ICON_APPRENTICES = '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z"/></svg>';

export class TutorLeftPanel extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';
    const path = window.location.pathname;
    this.innerHTML = `
      <aside id="left-panel" class="side-panel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:0 15px; width:100%; box-sizing:border-box;">
          <div class="logo-zone" style="display:flex; align-items:center; overflow:hidden; white-space:nowrap; gap:.42rem;">
            ${brand('Tuteur', 'var(--accent-lime, #84cc16)')}
          </div>
          <button id="btn-toggle-panel" type="button" aria-label="Réduire le panneau" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items:center;">
            ${ICONS.chevron}
          </button>
        </div>
        <ul class="nav-menu">
          <li class="nav-item ${(path.includes('/tutor/dashboard.html') || path.includes('/tutor/livret')) ? 'active' : ''}" data-sbi-href="/tutor/dashboard.html" role="link" tabindex="0">${ICONS.dashboard}<span class="nav-text">Tableau de bord</span></li>
        </ul>
        <div style="margin-top:auto; padding:1rem; border-top:1px solid var(--border-color); overflow:hidden;">
          <button class="admin-return-link" type="button" data-sbi-href="/admin/index.html" title="Retour au panel administrateur">
            ${ICONS.back}<span class="nav-text">Retour admin</span>
          </button>
          <button id="logout-btn-tutor" class="action-btn danger" style="width:100%; justify-content:center; gap:.5rem;">
            ${ICONS.logout}<span class="nav-text">Déconnexion</span>
          </button>
        </div>
      </aside>
    `;
    this.querySelector('#logout-btn-tutor')?.addEventListener('click', signOutToLogin);
    dispatchComponentMounted('tutor-left-panel', this);
  }
}

export class TutorTopBar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';
    document.body.classList.add('no-right-panel');
    this.innerHTML = `
      <header class="top-bar" style="border-bottom:1px solid var(--border-color); background-color:rgba(255,255,255,.95); backdrop-filter:blur(10px);">
        <button class="mobile-toggle left-toggle" id="btn-toggle-mobile">${ICONS.dashboard}</button>
        <div class="search-bar-top" style="position:relative; flex-grow:1; max-width:450px; margin-left:2rem;">
          <span style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); width:18px; color:var(--text-muted); display:flex;">${ICONS.search}</span>
          <input type="text" class="global-search-input" placeholder="Rechercher un apprenti..." style="width:100%; box-sizing:border-box; padding:.7rem 1.5rem .7rem 2.8rem; background:#f9fafb; border:1px solid var(--border-color); border-radius:20px; outline:none; font-size:.95rem; color:var(--text-main);">
          <div class="global-search-results"></div>
        </div>
        <div style="display:flex; align-items:center; gap:1.5rem; margin-left:auto; padding-right:1rem;">
          <div style="position:relative;">
            <div id="notif-bell-btn" style="position:relative; cursor:pointer; padding:5px;">${ICONS.bell}<span class="notif-badge" id="bell-badge" style="display:none;">0</span></div>
            <div id="notifications-section" style="position:absolute; top:calc(100% + 10px); right:-50px; width:320px; background:white; border:1px solid var(--border-color); border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.1); z-index:1000; display:none;">
              <div style="padding:1rem; border-bottom:1px solid var(--border-color); font-weight:bold; color:var(--text-main); font-size:.9rem;" id="notif-panel-title">VOS NOTIFICATIONS</div>
              <div id="notifications-list" style="display:flex; flex-direction:column; max-height:350px; overflow-y:auto;"></div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:1rem; cursor:pointer; border-left:1px solid var(--border-color); padding-left:1.5rem; transition:opacity .2s;" data-sbi-href="/tutor/dashboard.html" role="link" tabindex="0">
            <div style="text-align:right; display:flex; flex-direction:column; justify-content:center;">
              <p id="top-user-name" style="margin:0; font-weight:bold; font-size:.95rem; line-height:1.2;">Chargement...</p>
              <p id="top-user-level" style="margin:0; color:var(--accent-lime, #84cc16); font-size:.75rem; font-weight:bold; line-height:1.2; margin-top:2px;">Maître d'apprentissage</p>
            </div>
            <div id="top-user-avatar" style="width:42px; height:42px; border-radius:50%; background:var(--bg-body); border:2px solid var(--border-color); overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-main); flex-shrink:0;"></div>
          </div>
        </div>
      </header>
    `;
    dispatchComponentMounted('tutor-top-bar', this);
  }
}

export function registerTutorPanels() {
  defineOnce('tutor-left-panel', TutorLeftPanel);
  defineOnce('tutor-top-bar', TutorTopBar);
}
