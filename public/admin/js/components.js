/**
 * =======================================================================
 * WEB COMPONENTS - Éléments HTML personnalisés réutilisables
 * =======================================================================
 */

/* --- 1. LE PANNEAU LATÉRAL GAUCHE (MENU) --- */
class AdminLeftPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="left-panel" class="side-panel">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 15px; width: 100%; box-sizing: border-box;">
                    <div class="logo-zone" style="display: flex; align-items: center; overflow: hidden; white-space: nowrap;">
                        <span style="color: var(--accent-blue); font-weight: bold;">🔥 SBI</span><span>&nbsp;Console</span>
                    </div>
                    <button id="btn-toggle-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transition: transform 0.3s;"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                </div>
                
                <ul class="nav-menu">
                    <li class="nav-item" id="nav-dashboard" data-target="view-dashboard" onclick="if(!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) window.location.href='index.html?tab=view-dashboard'">
                        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                        <span class="nav-text">Tableau de Bord</span>
                    </li>
                    <li class="nav-item" id="nav-users" data-target="view-users" onclick="if(!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) window.location.href='index.html?tab=view-users'">
                        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        <span class="nav-text">Utilisateurs</span>
                    </li>
                    <li class="nav-item" id="nav-profile" style="display:none;" onclick="if(!window.location.pathname.includes('admin-profile.html')) window.location.href='index.html?tab=view-users'">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span class="nav-text">Profil Actif</span>
                    </li>
                    <li class="nav-item" id="nav-formations" data-target="view-formations" onclick="if(!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) window.location.href='index.html?tab=view-formations'">
                        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span class="nav-text">Formations</span>
                    </li>
                    <li class="nav-item" id="nav-settings" data-target="view-settings" onclick="if(!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) window.location.href='index.html?tab=view-settings'">
                        <svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
                        <span class="nav-text">Paramètres</span>
                    </li>
                </ul>
            </aside>
        `;

        // Logique de surbrillance intelligente du menu
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';

        if (path.includes('admin-profile.html')) {
            this.querySelector('#nav-profile').style.display = 'flex';
            this.querySelector('#nav-profile').classList.add('active');
        } else if (path.includes('formations-cours.html') || path.includes('formations-live.html')) {
            this.querySelector('#nav-formations').classList.add('active');
        } else {
            // Index par défaut
            const activeNav = this.querySelector(`[data-target="${tab}"]`);
            if(activeNav) activeNav.classList.add('active');
        }
    }
}
customElements.define('admin-left-panel', AdminLeftPanel);


/* --- 2. LE PANNEAU LATÉRAL DROIT (PROFILS & NOTIFS) --- */
class AdminRightPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="right-panel" class="side-panel">
                <div class="panel-header" style="justify-content: space-between; align-items: center; padding: 0 1.5rem;">
                    <span style="font-weight: bold; font-size: 0.9rem; color: var(--text-muted); display: none;" id="notif-panel-title">NOTIFICATIONS</span>
                    <div style="display: flex; align-items: center; margin-left: auto;">
                        <div id="notif-bell-btn" style="position: relative; cursor: pointer; display: flex; align-items: center; padding: 5px;">
                            <svg style="width: 22px; height: 22px; fill: var(--text-muted); transition: fill 0.2s;" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                            <span class="notif-badge" id="bell-badge" style="display:none;">0</span>
                        </div>
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
                    
                    <button class="action-btn" id="btn-my-profile" style="color: var(--accent-blue); border-color: rgba(42, 87, 255, 0.3);">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> 
                        Mon Profil
                    </button>
                    <button class="action-btn" id="btn-clear-cache"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> Rafraîchir le Cache</button>
                    <button class="action-btn danger" id="logout-btn"><svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg> Déconnexion</button>
                </div>
                
                <div class="right-section" id="notifications-section" style="display:none; padding: 0; border:none;">
                    <div id="notifications-list" style="display: flex; flex-direction: column;"></div>
                </div>
            </aside>

            <div id="crop-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 2000; justify-content: center; align-items: center; flex-direction: column;">
                <div style="background: var(--bg-card); padding: 2rem; border-radius: 8px; border: 1px solid var(--border-color); text-align: center; max-width: 400px; width: 100%;">
                    <h3 style="margin-top:0;">Changer la photo</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom: 1.5rem;">Glissez une image ici, ou cliquez pour en choisir une. Maintenez le clic pour la centrer.</p>
                    
                    <input type="file" id="pfp-file-input" accept="image/*" style="display: none;">
                    
                    <div id="crop-zone" onclick="if(!this.hasImage) document.getElementById('pfp-file-input').click()">
                        <span id="crop-placeholder" style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%); color: #555; pointer-events: none;">Glisser / Cliquer</span>
                        <img id="crop-image" src="" style="display: none; cross-origin: anonymous;">
                    </div>

                    <div style="margin-top: 1.5rem; text-align: left; padding: 0 1rem;">
                        <label style="color: var(--text-muted); font-size: 0.8rem; display: block; margin-bottom: 0.5rem; font-weight: bold;">Zoom</label>
                        <input type="range" id="crop-zoom" min="1" max="3" step="0.05" value="1" style="width: 100%; accent-color: var(--accent-blue);">
                    </div>

                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button id="btn-save-crop" style="flex: 1; padding: 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Appliquer</button>
                        <button id="btn-cancel-crop" style="flex: 1; padding: 1rem; background: transparent; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Annuler</button>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('admin-right-panel', AdminRightPanel);

/* --- 3. LE PANNEAU LATÉRAL GAUCHE (ÉTUDIANT) --- */
class StudentLeftPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="left-panel" class="side-panel">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 15px; width: 100%; box-sizing: border-box;">
                    <div class="logo-zone" style="display: flex; align-items: center; overflow: hidden; white-space: nowrap;">
                        <span style="color: var(--accent-green); font-weight: bold;">🎓 SBI</span><span>&nbsp;Student</span>
                    </div>
                    <button id="btn-toggle-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transition: transform 0.3s;"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                </div>
                
                <ul class="nav-menu">
                    <li class="nav-item active" onclick="window.location.href='dashboard.html'">
                        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                        <span class="nav-text">Mon Hub</span>
                    </li>
                    <li class="nav-item" onclick="window.location.href='mes-cours.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span class="nav-text">Mes Cours</span>
                    </li>
                    <li class="nav-item" onclick="window.location.href='mon-profil.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span class="nav-text">Mon Profil & XP</span>
                    </li>
                </ul>

                <div style="margin-top: auto; padding: 1rem; border-top: 1px solid var(--border-color); overflow: hidden;">
                    <button id="logout-btn-student" style="width: 100%; padding: 0.8rem; background: rgba(255, 74, 74, 0.05); color: var(--accent-red); border: 1px solid rgba(255, 74, 74, 0.2); border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s; white-space: nowrap;" onmouseover="this.style.background='rgba(255, 74, 74, 0.1)'" onmouseout="this.style.background='rgba(255, 74, 74, 0.05)'">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink: 0;"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                        <span class="nav-text">Déconnexion</span>
                    </button>
                </div>
            </aside>
        `;

        const logoutBtn = this.querySelector('#logout-btn-student');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
                const auth = getAuth();
                signOut(auth).then(() => { window.location.href = '/login.html'; });
            });
        }
    }
}
customElements.define('student-left-panel', StudentLeftPanel);
