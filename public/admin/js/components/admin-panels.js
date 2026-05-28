import { ICONS, brand, defineOnce } from './shared-icons.js';
import { clearCacheAndReload, signOutToLogin } from './shared-actions.js';
import { dispatchComponentMounted } from './ready.js';

const PROMOTIONS_ICON = '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v3h-2V5H7v14h3v2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4h4v2h-4V7Zm0 4h5v2h-5v-2Zm6.5 1A4.5 4.5 0 0 1 21 16.5c0 .84-.23 1.63-.63 2.3L22 20.43 20.43 22l-1.63-1.63A4.5 4.5 0 1 1 16.5 12Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>';
const CURSUS_ICON = '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a1 1 0 0 1-1.45.9L12 16.62 5.45 19.9A1 1 0 0 1 4 19V5Zm2 0v11.38l6-3 6 3V5H6Zm2 3h8v2H8V8Zm0 3h6v2H8v-2Z"/></svg>';
const LIVE_ICON = '<svg viewBox="0 0 24 24"><path d="M4 6h11a2 2 0 0 1 2 2v1.2l3-1.8a1 1 0 0 1 1.5.86v7.48a1 1 0 0 1-1.5.86l-3-1.8V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v8h11V8H4Zm13 3.53v.94l2 1.2v-3.34l-2 1.2Z"/></svg>';

function adminNavItem({ id, target, label, icon }) {
  const href = `/admin/index.html?tab=${target}`;

  return `
    <li class="nav-item" id="${id}" data-target="${target}" data-href="${href}" data-sbi-href="${href}" role="link" tabindex="0">
      ${icon}
      <span class="nav-text">${label}</span>
    </li>
  `;
}

export class AdminLeftPanel extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';

    this.innerHTML = `
      <aside id="left-panel" class="side-panel admin-theme">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:0 15px; width:100%; box-sizing:border-box;">
          <div class="logo-zone" style="display:flex; align-items:center; overflow:hidden; white-space:nowrap; gap:.42rem;">
            ${brand('Console', 'var(--accent-blue, #2A57FF)')}
          </div>
          <button id="btn-toggle-panel" type="button" aria-label="Réduire le panneau" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items:center;">
            ${ICONS.chevron}
          </button>
        </div>
        <ul class="nav-menu">
          ${adminNavItem({ id:'nav-dashboard', target:'view-dashboard', label:'Tableau de Bord', icon:ICONS.dashboard })}
          <li class="nav-item" id="nav-users" data-href="/admin/admin-accounts.html" data-sbi-href="/admin/admin-accounts.html" role="link" tabindex="0">
            ${ICONS.users}
            <span class="nav-text">Comptes</span>
          </li>
          <li class="nav-item" id="nav-audit-log" data-href="/admin/admin-audit-log.html" data-sbi-href="/admin/admin-audit-log.html" role="link" tabindex="0">
            ${ICONS.bell}
            <span class="nav-text">Journal admin</span>
          </li>
          <li class="nav-item" id="nav-promotions" data-href="/admin/admin-promotions.html" data-sbi-href="/admin/admin-promotions.html" role="link" tabindex="0">
            ${PROMOTIONS_ICON}
            <span class="nav-text">Promotions</span>
          </li>
          <li class="nav-item" id="nav-lives" data-href="/admin/admin-lives.html" data-sbi-href="/admin/admin-lives.html" role="link" tabindex="0">
            ${LIVE_ICON}
            <span class="nav-text">Lives V1</span>
          </li>
          <li class="nav-item" id="nav-lives-v2" data-href="/admin/admin-lives-v2.html" data-sbi-href="/admin/admin-lives-v2.html" role="link" tabindex="0">
            ${LIVE_ICON}
            <span class="nav-text">Lives V2</span>
          </li>
          <li class="nav-item" id="nav-cursus" data-href="/admin/admin-cursus.html" data-sbi-href="/admin/admin-cursus.html" data-sbi-route="admin-cursus" role="link" tabindex="0" title="Ouvrir la page Cursus">
            ${CURSUS_ICON}
            <span class="nav-text">Cursus</span>
          </li>
          ${adminNavItem({ id:'nav-formations', target:'view-formations', label:'Formations', icon:ICONS.formations })}
          ${adminNavItem({ id:'nav-settings', target:'view-settings', label:'Serveur & Vidéos', icon:ICONS.settings })}
        </ul>
      </aside>
    `;

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';

    if (path.includes('admin-profile.html') || path.includes('admin-accounts.html')) {
      this.querySelector('#nav-users')?.classList.add('active');
    } else if (path.includes('admin-audit-log.html')) {
      this.querySelector('#nav-audit-log')?.classList.add('active');
    } else if (path.includes('admin-promotions.html')) {
      this.querySelector('#nav-promotions')?.classList.add('active');
    } else if (path.includes('admin-lives-v2.html')) {
      this.querySelector('#nav-lives-v2')?.classList.add('active');
    } else if (path.includes('admin-lives.html') || path.includes('formations-live.html')) {
      this.querySelector('#nav-lives')?.classList.add('active');
    } else if (path.includes('admin-cursus.html')) {
      this.querySelector('#nav-cursus')?.classList.add('active');
    } else if (path.includes('formations-cours.html')) {
      this.querySelector('#nav-formations')?.classList.add('active');
    } else if (path.includes('site-index-settings.html')) {
      // Le lien Gestion Accueil est injecté ensuite par admin-ui pour conserver
      // l'ancien comportement. On évite de marquer un autre onglet actif ici.
    } else {
      this.querySelector(`[data-target="${tab}"]`)?.classList.add('active');
    }

    dispatchComponentMounted('admin-left-panel', this);
  }
}

export class AdminRightPanel extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    this.dataset.rendered = 'true';

    this.innerHTML = `
      <aside id="right-panel" class="side-panel admin-theme">
        <div class="panel-header" style="justify-content:space-between; align-items:center; padding:0 1.5rem;">
          <span style="font-weight:bold; font-size:.9rem; color:var(--text-muted); display:none;" id="notif-panel-title">NOTIFICATIONS</span>
          <div style="display:flex; align-items:center; margin-left:auto;">
            <div id="notif-bell-btn" style="position:relative; cursor:pointer; display:flex; align-items:center; padding:5px;">
              ${ICONS.bell}
              <span class="notif-badge" id="bell-badge" style="display:none;">0</span>
            </div>
          </div>
        </div>

        <div style="padding:1rem 1.5rem; border-bottom:1px solid #333; position:relative;">
          <div style="position:relative; width:100%;">
            <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); width:16px; color:#666; display:flex;">${ICONS.search}</span>
            <input type="text" class="global-search-input" placeholder="Chercher utilisateur, cours..." style="width:100%; box-sizing:border-box; padding:.6rem 1rem .6rem 2.2rem; border-radius:6px; background:#111; color:white; border:1px solid #333; outline:none; font-size:.85rem;">
            <div class="global-search-results"></div>
          </div>
        </div>

        <div class="right-section" id="profile-section">
          <div class="profile-widget">
            <div class="avatar" id="nav-avatar" style="overflow:hidden; display:flex; align-items:center; justify-content:center;">...</div>
            <div class="user-info">
              <p class="name" id="nav-name">Chargement...</p>
              <p class="role" id="nav-role">...</p>
            </div>
          </div>

          <button class="action-btn" id="btn-my-profile" type="button" data-sbi-href="/admin/admin-profile.html" style="color:var(--accent-blue); border-color:rgba(42,87,255,.3);">
            ${ICONS.profile} Mon Profil
          </button>
          <button class="action-btn" id="btn-clear-cache">${ICONS.refresh} Rafraîchir le Cache</button>
          <button class="action-btn danger" id="logout-btn">${ICONS.logout} Déconnexion</button>
        </div>

        <div class="right-section" id="notifications-section" style="display:none; padding:0; border:none;">
          <div id="notifications-list" style="display:flex; flex-direction:column; max-height:350px; overflow-y:auto;"></div>
        </div>
      </aside>
    `;

    this.querySelector('#logout-btn')?.addEventListener('click', signOutToLogin);
    this.querySelector('#btn-clear-cache')?.addEventListener('click', clearCacheAndReload);
    dispatchComponentMounted('admin-right-panel', this);
  }
}

export function registerAdminPanels() {
  defineOnce('admin-left-panel', AdminLeftPanel);
  defineOnce('admin-right-panel', AdminRightPanel);
}
