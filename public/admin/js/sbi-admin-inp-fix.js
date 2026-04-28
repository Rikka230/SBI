import { auth, app, db } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app);

function closeConfirm(modal) {
    if (!modal) return;
    modal.style.opacity = '0';
    const panel = modal.querySelector('[data-panel]');
    if (panel) panel.style.transform = 'translateY(10px) scale(0.98)';
    window.setTimeout(() => modal.remove(), 180);
}

function showConfirm({ title, text, confirmLabel = 'Confirmer', cancelLabel = 'Annuler' }) {
    return new Promise((resolve) => {
        let modal = document.getElementById('sbi-admin-delete-confirm');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'sbi-admin-delete-confirm';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10080;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);opacity:0;transition:opacity .18s ease;';
        modal.innerHTML = `
            <div data-panel style="width:min(92vw,440px);background:linear-gradient(145deg,#0d1327,#070b18);border:1px solid rgba(255,74,74,.34);padding:1.6rem;box-shadow:0 24px 70px rgba(0,0,0,.5);clip-path:polygon(0 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%);transform:translateY(10px) scale(.98);transition:transform .18s ease;">
                <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1.2rem;">
                    <div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:#ff4a4a;background:rgba(255,74,74,.1);border:1px solid rgba(255,74,74,.28);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);flex:0 0 auto;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2 1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    </div>
                    <div>
                        <h3 style="margin:0;color:#fff;font-size:1.12rem;font-weight:950;letter-spacing:-.03em;">${title}</h3>
                        <p style="margin:.45rem 0 0;color:#9ca3af;font-size:.92rem;line-height:1.45;">${text}</p>
                    </div>
                </div>
                <div style="display:flex;gap:.75rem;justify-content:flex-end;">
                    <button data-cancel style="padding:.82rem 1rem;border:1px solid rgba(148,163,184,.28);background:transparent;color:#fff;font-weight:800;cursor:pointer;clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);">${cancelLabel}</button>
                    <button data-confirm style="padding:.82rem 1rem;border:1px solid rgba(255,74,74,.45);background:rgba(255,74,74,.12);color:#ff4a4a;font-weight:900;cursor:pointer;clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);">${confirmLabel}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            const panel = modal.querySelector('[data-panel]');
            if (panel) panel.style.transform = 'translateY(0) scale(1)';
        });

        modal.querySelector('[data-cancel]').addEventListener('click', () => {
            closeConfirm(modal);
            resolve(false);
        });

        modal.querySelector('[data-confirm]').addEventListener('click', () => {
            closeConfirm(modal);
            resolve(true);
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeConfirm(modal);
                resolve(false);
            }
        });
    });
}

async function handleDeleteUser(event) {
    const button = event.target.closest('#delete-user-btn');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const userId = document.getElementById('edit-user-id')?.value;
    const currentUser = auth.currentUser;
    if (!userId || !currentUser) return;

    button.disabled = true;
    button.style.opacity = '0.62';

    try {
        if (userId === currentUser.uid) {
            await showConfirm({ title: 'Action impossible', text: 'Vous ne pouvez pas supprimer votre propre compte.', confirmLabel: 'Compris', cancelLabel: 'Fermer' });
            return;
        }

        const userSnap = await getDoc(doc(db, 'users', userId));
        const targetUser = userSnap.exists() ? userSnap.data() : null;

        if (targetUser?.isGod === true) {
            await showConfirm({ title: 'Compte protégé', text: 'Le compte Suprême ne peut pas être supprimé.', confirmLabel: 'Compris', cancelLabel: 'Fermer' });
            return;
        }

        const displayName = `${targetUser?.prenom || ''} ${targetUser?.nom || ''}`.trim() || targetUser?.email || 'cet utilisateur';
        const confirmed = await showConfirm({
            title: 'Supprimer définitivement ?',
            text: `Cette action supprimera le compte de ${displayName}. Elle ne doit être utilisée qu’en dernier recours.`,
            confirmLabel: 'Supprimer',
            cancelLabel: 'Annuler'
        });

        if (!confirmed) return;

        const deleteUserAccount = httpsCallable(functionsInstance, 'deleteUserAccount');
        await deleteUserAccount({ uid: userId });

        const modal = document.getElementById('edit-user-modal');
        if (modal) modal.style.display = 'none';
        window.location.reload();
    } catch (error) {
        await showConfirm({ title: 'Erreur serveur', text: 'La suppression n’a pas pu être finalisée.', confirmLabel: 'Compris', cancelLabel: 'Fermer' });
    } finally {
        button.disabled = false;
        button.style.opacity = '';
    }
}

document.addEventListener('click', handleDeleteUser, true);
