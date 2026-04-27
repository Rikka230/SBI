import { ICONS, brand, defineOnce } from './shared-icons.js';
import { clearCacheAndReload, signOutToLogin } from './shared-actions.js';

function adminNavItem({ id, target, label, icon }) {
  return `
    <li class="nav-item" id="${id}" data-target="${target}" onclick="window.location.href='/admin/index.html?tab=${target}'">
      ${icon}
      <span class="nav-text">${label}</span>
    </li>
  `;
}

export class AdminLeftPanel extends HTMLElement {
  connectedCallback() {
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
          ${adminNavItem({ id:'nav-users', target:'view-users', label:'Utilisateurs', icon:ICONS.users })}
          ${adminNavItem({ id:'nav-formations', target:'view-formations', label:'Formations', icon:ICONS.formations })}
          ${adminNavItem({ id:'nav-settings', target:'view-settings', label:'Serveur & Vidéos', icon:ICONS.settings })}
        </ul>
      </aside>
    `;

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';

    if (path.includes('admin-profile.html')) {
      this.querySelector('#nav-users')?.classList.add('active');
    } else if (path.includes('formations-cours.html') || path.includes('formations-live.html')) {
      this.querySelector('#nav-formations')?.classList.add('active');
    } else {
      this.querySelector(`[data-target="${tab}"]`)?.classList.add('active');
    }
  }
}

export class AdminRightPanel extends HTMLElement {
  connectedCallback() {
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

          <button class="action-btn" id="btn-my-profile" style="color:var(--accent-blue); border-color:rgba(42,87,255,.3);">
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
  }
}

export function registerAdminPanels() {
  defineOnce('admin-left-panel', AdminLeftPanel);
  defineOnce('admin-right-panel', AdminRightPanel);
}
