/**
 * =======================================================================
 * WEB COMPONENTS - Éléments HTML personnalisés réutilisables
 * =======================================================================
 */

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
// On déclare notre nouvelle balise HTML !
customElements.define('admin-right-panel', AdminRightPanel);
