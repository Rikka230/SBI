/**
 * =======================================================================
 * WEB COMPONENTS - Éléments HTML personnalisés réutilisables
 * =======================================================================
 */

const styleFix = document.createElement('style');
styleFix.textContent = `
    .nav-item { white-space: nowrap !important; overflow: hidden !important; }
    .nav-text { display: inline-block; transition: opacity 0.2s ease; }
    .left-collapsed .nav-text { opacity: 0; pointer-events: none; }
    .left-collapsed .nav-item { padding-left: 15px; padding-right: 15px; justify-content: center; }
    
    .global-search-results { position: absolute; top: calc(100% + 5px); left: 0; right: 0; background: var(--bg-card, #ffffff); z-index: 9999; border-radius: 8px; display: none; max-height: 350px; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid var(--border-color, #e5e7eb); }
    .admin-theme .global-search-results { background: #1e1e1e; border-color: #333; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    .search-result-item { padding: 12px 15px; cursor: pointer; border-bottom: 1px solid var(--border-color, #f3f4f6); display: flex; align-items: center; gap: 12px; color: var(--text-main, #1f2937); transition: 0.2s; }
    .admin-theme .search-result-item { border-color: #333; color: #fff; }
    .search-result-item:hover { background: rgba(16, 185, 129, 0.05); }
    .search-result-title { font-weight: bold; font-size: 0.9rem; margin-bottom: 2px; }
    .search-result-sub { font-size: 0.75rem; color: var(--text-muted, #6b7280); }
    .admin-return-link { display: none !important; width: 100%; padding: 0.75rem 0.8rem; margin-bottom: 0.7rem; background: rgba(42, 87, 255, 0.08); color: var(--accent-blue, #2a57ff); border: 1px solid rgba(42, 87, 255, 0.25); border-radius: 10px; font-weight: 800; cursor: pointer; align-items: center; justify-content: center; gap: 0.5rem; transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease; white-space: nowrap; }
    body.sbi-admin-visitor .admin-return-link { display: flex !important; }
    .admin-return-link:hover { transform: translateY(-1px); background: rgba(42, 87, 255, 0.14); border-color: rgba(42, 87, 255, 0.45); }
    .admin-return-link svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
    .left-collapsed .admin-return-link { padding-left: 0.75rem; padding-right: 0.75rem; }
`;
document.head.appendChild(styleFix);

/* --- 1. LE PANNEAU LATÉRAL GAUCHE (ADMIN) --- */
class AdminLeftPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="left-panel" class="side-panel admin-theme">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 15px; width: 100%; box-sizing: border-box;">
                    <div class="logo-zone" style="display: flex; align-items: center; overflow: hidden; white-space: nowrap;">
                        <span style="color: var(--accent-blue); font-weight: bold;">🔥 SBI</span><span>&nbsp;Console</span>
                    </div>
                    <button id="btn-toggle-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transition: transform 0.3s;"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                </div>
                
                <ul class="nav-menu">
                    <li class="nav-item" id="nav-dashboard" data-target="view-dashboard" onclick="window.location.href='/admin/index.html?tab=view-dashboard'">
                        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                        <span class="nav-text">Tableau de Bord</span>
                    </li>
                    <li class="nav-item" id="nav-users" data-target="view-users" onclick="window.location.href='/admin/index.html?tab=view-users'">
                        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        <span class="nav-text">Utilisateurs</span>
                    </li>
                    <li class="nav-item" id="nav-formations" data-target="view-formations" onclick="window.location.href='/admin/index.html?tab=view-formations'">
                        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span class="nav-text">Formations</span>
                    </li>
                    <li class="nav-item" id="nav-settings" data-target="view-settings" onclick="window.location.href='/admin/index.html?tab=view-settings'">
                        <svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 C13.96,21.59,14.15,21.76,14.4,21.76h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
                        <span class="nav-text">Serveur & Vidéos</span>
                    </li>
                </ul>
            </aside>
        `;

        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';

        if (path.includes('admin-profile.html')) {
            this.querySelector('#nav-users').classList.add('active');
        } else if (path.includes('formations-cours.html') || path.includes('formations-live.html')) {
            this.querySelector('#nav-formations').classList.add('active');
        } else {
            const activeNav = this.querySelector(`[data-target="${tab}"]`);
            if(activeNav) activeNav.classList.add('active');
        }
    }
}
customElements.define('admin-left-panel', AdminLeftPanel);

/* --- 2. LE PANNEAU LATÉRAL DROIT (ADMIN) --- */
class AdminRightPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="right-panel" class="side-panel admin-theme">
                <div class="panel-header" style="justify-content: space-between; align-items: center; padding: 0 1.5rem;">
                    <span style="font-weight: bold; font-size: 0.9rem; color: var(--text-muted); display: none;" id="notif-panel-title">NOTIFICATIONS</span>
                    <div style="display: flex; align-items: center; margin-left: auto;">
                        <div id="notif-bell-btn" style="position: relative; cursor: pointer; display: flex; align-items: center; padding: 5px;">
                            <svg style="width: 22px; height: 22px; fill: var(--text-muted); transition: fill 0.2s;" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                            <span class="notif-badge" id="bell-badge" style="display:none;">0</span>
                        </div>
                    </div>
                </div>

                <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #333; position: relative;">
                    <div style="position: relative; width: 100%;">
                        <svg viewBox="0 0 24 24" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; fill: #666;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        <input type="text" class="global-search-input" placeholder="Chercher utilisateur, cours..." style="width: 100%; box-sizing: border-box; padding: 0.6rem 1rem 0.6rem 2.2rem; border-radius: 6px; background: #111; color: white; border: 1px solid #333; outline: none; font-size: 0.85rem;">
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
                    
                    <button class="action-btn" id="btn-my-profile" style="color: var(--accent-blue); border-color: rgba(42, 87, 255, 0.3);">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> Mon Profil
                    </button>
                    <button class="action-btn" id="btn-clear-cache"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> Rafraîchir le Cache</button>
                    <button class="action-btn danger" id="logout-btn"><svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg> Déconnexion</button>
                </div>
                
                <div class="right-section" id="notifications-section" style="display:none; padding: 0; border:none;">
                    <div id="notifications-list" style="display: flex; flex-direction: column; max-height: 350px; overflow-y: auto;"></div>
                </div>
            </aside>
        `;

        const logoutBtn = this.querySelector('#logout-btn');
        if(logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
                const auth = getAuth();
                signOut(auth).then(() => { window.location.href = '/login.html'; });
            });
        }

        const cacheBtn = this.querySelector('#btn-clear-cache');
        if(cacheBtn) {
            cacheBtn.addEventListener('click', () => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            });
        }
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
                        <span style="color: var(--accent-blue); font-weight: bold;">🎓 SBI</span><span>&nbsp;Student</span>
                    </div>
                    <button id="btn-toggle-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transition: transform 0.3s;"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                </div>
                
                <ul class="nav-menu">
                    <li class="nav-item ${window.location.pathname.includes('dashboard.html') ? 'active' : ''}" onclick="window.location.href='dashboard.html'">
                        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                        <span class="nav-text">Mon Hub</span>
                    </li>
                    <li class="nav-item ${window.location.pathname.includes('mes-cours.html') ? 'active' : ''}" onclick="window.location.href='mes-cours.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span class="nav-text">Mes Cours</span>
                    </li>
                    <li class="nav-item ${window.location.pathname.includes('mon-profil.html') ? 'active' : ''}" onclick="window.location.href='mon-profil.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span class="nav-text">Mon Profil & XP</span>
                    </li>
                </ul>

                <div style="margin-top: auto; padding: 1rem; border-top: 1px solid var(--border-color); overflow: hidden;">
                    <button class="admin-return-link" type="button" onclick="window.location.href='/admin/index.html'" title="Retour au panel administrateur">
                        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg>
                        <span class="nav-text">Retour admin</span>
                    </button>
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

/* --- 4. LA BARRE SUPÉRIEURE (ÉTUDIANT) --- */
class StudentTopBar extends HTMLElement {
    connectedCallback() {
        document.body.classList.add('no-right-panel'); // Injecte la classe protectrice
        this.innerHTML = `
            <header class="top-bar" style="border-bottom: 1px solid var(--border-color); background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px);">
                <button class="mobile-toggle left-toggle" id="btn-toggle-mobile"><svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg></button>
                
                <div class="search-bar-top" style="position: relative; flex-grow: 1; max-width: 450px; margin-left: 2rem;">
                    <svg viewBox="0 0 24 24" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); width: 18px; fill: var(--text-muted);"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                    <input type="text" class="global-search-input" placeholder="Rechercher un cours, une ressource..." style="width: 100%; box-sizing: border-box; padding: 0.7rem 1.5rem 0.7rem 2.8rem; background: #f9fafb; border: 1px solid var(--border-color); border-radius: 20px; outline: none; font-size: 0.95rem; color: var(--text-main);">
                    <div class="global-search-results"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 1.5rem; margin-left: auto; padding-right: 1rem;">
                    
                    <div style="position: relative;">
                        <div id="notif-bell-btn" style="position: relative; cursor: pointer; padding: 5px;">
                            <svg style="width: 22px; height: 22px; fill: var(--text-muted); transition: fill 0.2s;" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                            <span class="notif-badge" id="bell-badge" style="display:none;">0</span>
                        </div>
                        <div id="notifications-section" style="position: absolute; top: calc(100% + 10px); right: -50px; width: 320px; background: white; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); z-index: 1000; display: none;">
                            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); font-weight: bold; color: var(--text-main); font-size: 0.9rem;" id="notif-panel-title">VOS NOTIFICATIONS</div>
                            <div id="notifications-list" style="display: flex; flex-direction: column; max-height: 350px; overflow-y: auto;"></div>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 1rem; cursor: pointer; border-left: 1px solid var(--border-color); padding-left: 1.5rem; transition: opacity 0.2s;" onclick="window.location.href='/student/mon-profil.html'" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
                            <p id="top-user-name" style="margin: 0; font-weight: bold; font-size: 0.95rem; line-height: 1.2;">Chargement...</p>
                            <p id="top-user-level" style="margin: 0; color: var(--accent-blue); font-size: 0.75rem; font-weight: bold; line-height: 1.2; margin-top: 2px;">Niveau -</p>
                        </div>
                        <div id="top-user-avatar" style="width: 42px; height: 42px; border-radius: 50%; background: var(--bg-body); border: 2px solid var(--border-color); overflow: hidden; display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--text-main); flex-shrink: 0;"></div>
                    </div>
                </div>
            </header>
        `;
    }
}
customElements.define('student-top-bar', StudentTopBar);

/* --- 5. LE PANNEAU LATÉRAL GAUCHE (PROFESSEUR) --- */
class TeacherLeftPanel extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <aside id="left-panel" class="side-panel">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 15px; width: 100%; box-sizing: border-box;">
                    <div class="logo-zone" style="display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap;">
                        <svg width="24" height="24" fill="var(--accent-orange, #f59e0b)" viewBox="0 0 24 24"><path d="M12 3L1 9L5 11.18V17H3V10.09L12 5.28L21 10.09V17H19V11.18L15 9L12 3ZM12 12.72L18.82 9L12 5.28L5.18 9L12 12.72ZM17 15.99L12 18.72L7 15.99V19.72L12 21.45L17 19.72V15.99Z"/></svg>
                        <span style="color: var(--accent-orange, #f59e0b); font-weight: bold;">SBI</span><span>&nbsp;Teacher</span>
                    </div>
                    <button id="btn-toggle-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transition: transform 0.3s;"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                </div>
                
                <ul class="nav-menu">
                    <li class="nav-item ${window.location.pathname.includes('teacherindex.html') || window.location.pathname.includes('dashboard.html') ? 'active' : ''}" onclick="window.location.href='/teacher/dashboard.html'">
                        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                        <span class="nav-text">Mon Espace</span>
                    </li>
                    <li class="nav-item ${window.location.pathname.includes('mes-cours.html') ? 'active' : ''}" onclick="window.location.href='/teacher/mes-cours.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span class="nav-text">Formations & Cours</span>
                    </li>
                    <li class="nav-item ${window.location.pathname.includes('mon-profil.html') ? 'active' : ''}" onclick="window.location.href='/teacher/mon-profil.html'">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span class="nav-text">Mon Profil Public</span>
                    </li>
                </ul>

                <div style="margin-top: auto; padding: 1rem; border-top: 1px solid var(--border-color); overflow: hidden;">
                    <button class="admin-return-link" type="button" onclick="window.location.href='/admin/index.html'" title="Retour au panel administrateur">
                        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg>
                        <span class="nav-text">Retour admin</span>
                    </button>
                    <button id="logout-btn-teacher" style="width: 100%; padding: 0.8rem; background: rgba(255, 74, 74, 0.05); color: var(--accent-red); border: 1px solid rgba(255, 74, 74, 0.2); border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s; white-space: nowrap;" onmouseover="this.style.background='rgba(255, 74, 74, 0.1)'" onmouseout="this.style.background='rgba(255, 74, 74, 0.05)'">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink: 0;"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                        <span class="nav-text">Déconnexion</span>
                    </button>
                </div>
            </aside>
        `;

        const logoutBtn = this.querySelector('#logout-btn-teacher');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
                const auth = getAuth();
                signOut(auth).then(() => { window.location.href = '/login.html'; });
            });
        }
    }
}
customElements.define('teacher-left-panel', TeacherLeftPanel);

/* --- 6. LA BARRE SUPÉRIEURE (PROFESSEUR) --- */
class TeacherTopBar extends HTMLElement {
    connectedCallback() {
        document.body.classList.add('no-right-panel'); // Injecte la classe protectrice
        this.innerHTML = `
            <header class="top-bar" style="border-bottom: 1px solid var(--border-color); background-color: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px);">
                <button class="mobile-toggle left-toggle" id="btn-toggle-mobile"><svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg></button>
                
                <div class="search-bar-top" style="position: relative; flex-grow: 1; max-width: 450px; margin-left: 2rem;">
                    <svg viewBox="0 0 24 24" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); width: 18px; fill: var(--text-muted);"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                    <input type="text" class="global-search-input" placeholder="Rechercher un cours, une ressource..." style="width: 100%; box-sizing: border-box; padding: 0.7rem 1.5rem 0.7rem 2.8rem; background: #f9fafb; border: 1px solid var(--border-color); border-radius: 20px; outline: none; font-size: 0.95rem; color: var(--text-main);">
                    <div class="global-search-results"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 1.5rem; margin-left: auto; padding-right: 1rem;">
                    
                    <div style="position: relative;">
                        <div id="notif-bell-btn" style="position: relative; cursor: pointer; padding: 5px;">
                            <svg style="width: 22px; height: 22px; fill: var(--text-muted); transition: fill 0.2s;" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                            <span class="notif-badge" id="bell-badge" style="display:none;">0</span>
                        </div>
                        <div id="notifications-section" style="position: absolute; top: calc(100% + 10px); right: -50px; width: 320px; background: white; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); z-index: 1000; display: none;">
                            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); font-weight: bold; color: var(--text-main); font-size: 0.9rem;" id="notif-panel-title">VOS NOTIFICATIONS</div>
                            <div id="notifications-list" style="display: flex; flex-direction: column; max-height: 350px; overflow-y: auto;"></div>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 1rem; cursor: pointer; border-left: 1px solid var(--border-color); padding-left: 1.5rem; transition: opacity 0.2s;" onclick="window.location.href='/teacher/mon-profil.html'" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
                            <p id="top-user-name" style="margin: 0; font-weight: bold; font-size: 0.95rem; line-height: 1.2;">Chargement...</p>
                            <p id="top-user-level" style="margin: 0; color: var(--accent-orange, #f59e0b); font-size: 0.75rem; font-weight: bold; line-height: 1.2; margin-top: 2px;">Niveau -</p>
                        </div>
                        <div id="top-user-avatar" style="width: 42px; height: 42px; border-radius: 50%; background: var(--bg-body); border: 2px solid var(--border-color); overflow: hidden; display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--text-main); flex-shrink: 0;"></div>
                    </div>
                </div>
            </header>
        `;
    }
}
customElements.define('teacher-top-bar', TeacherTopBar);
