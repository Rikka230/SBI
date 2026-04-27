import { ICONS, brand, defineOnce } from './shared-icons.js';
import { dispatchComponentMounted } from './ready.js';
import { signOutToLogin } from './shared-actions.js';

export class StudentLeftPanel extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';
    const path = window.location.pathname;
    this.innerHTML = `
      <aside id="left-panel" class="side-panel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:0 15px; width:100%; box-sizing:border-box;">
          <div class="logo-zone" style="display:flex; align-items:center; overflow:hidden; white-space:nowrap; gap:.42rem;">
            ${brand('Étudiant', 'var(--accent-blue, #2A57FF)')}
          </div>
          <button id="btn-toggle-panel" type="button" aria-label="Réduire le panneau" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items:center;">
            ${ICONS.chevron}
          </button>
        </div>
        <ul class="nav-menu">
          <li class="nav-item ${path.includes('dashboard.html') ? 'active' : ''}" onclick="window.location.href='dashboard.html'">${ICONS.dashboard}<span class="nav-text">Mon Hub</span></li>
          <li class="nav-item ${path.includes('mes-cours.html') ? 'active' : ''}" onclick="window.location.href='mes-cours.html'">${ICONS.formations}<span class="nav-text">Mes Cours</span></li>
          <li class="nav-item ${path.includes('mon-profil.html') ? 'active' : ''}" onclick="window.location.href='mon-profil.html'">${ICONS.profile}<span class="nav-text">Mon Profil & XP</span></li>
        </ul>
        <div style="margin-top:auto; padding:1rem; border-top:1px solid var(--border-color); overflow:hidden;">
          <button class="admin-return-link" type="button" onclick="window.location.href='/admin/index.html'" title="Retour au panel administrateur">
            ${ICONS.back}<span class="nav-text">Retour admin</span>
          </button>
          <button id="logout-btn-student" class="action-btn danger" style="width:100%; justify-content:center; gap:.5rem;">
            ${ICONS.logout}<span class="nav-text">Déconnexion</span>
          </button>
        </div>
      </aside>
    `;
    this.querySelector('#logout-btn-student')?.addEventListener('click', signOutToLogin);
    dispatchComponentMounted('student-left-panel', this);
  }
}

export class StudentTopBar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';
    document.body.classList.add('no-right-panel');
    this.innerHTML = `
      <header class="top-bar" style="border-bottom:1px solid var(--border-color); background-color:rgba(255,255,255,.95); backdrop-filter:blur(10px);">
        <button class="mobile-toggle left-toggle" id="btn-toggle-mobile">${ICONS.dashboard}</button>
        <div class="search-bar-top" style="position:relative; flex-grow:1; max-width:450px; margin-left:2rem;">
          <span style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); width:18px; color:var(--text-muted); display:flex;">${ICONS.search}</span>
          <input type="text" class="global-search-input" placeholder="Rechercher un cours, une ressource..." style="width:100%; box-sizing:border-box; padding:.7rem 1.5rem .7rem 2.8rem; background:#f9fafb; border:1px solid var(--border-color); border-radius:20px; outline:none; font-size:.95rem; color:var(--text-main);">
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
          <div style="display:flex; align-items:center; gap:1rem; cursor:pointer; border-left:1px solid var(--border-color); padding-left:1.5rem; transition:opacity .2s;" onclick="window.location.href='/student/mon-profil.html'">
            <div style="text-align:right; display:flex; flex-direction:column; justify-content:center;">
              <p id="top-user-name" style="margin:0; font-weight:bold; font-size:.95rem; line-height:1.2;">Chargement...</p>
              <p id="top-user-level" style="margin:0; color:var(--accent-blue); font-size:.75rem; font-weight:bold; line-height:1.2; margin-top:2px;">Niveau -</p>
            </div>
            <div id="top-user-avatar" style="width:42px; height:42px; border-radius:50%; background:var(--bg-body); border:2px solid var(--border-color); overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-main); flex-shrink:0;"></div>
          </div>
        </div>
      </header>
    `;
    dispatchComponentMounted('student-top-bar', this);
  }
}

export function registerStudentPanels() {
  defineOnce('student-left-panel', StudentLeftPanel);
  defineOnce('student-top-bar', StudentTopBar);
}
