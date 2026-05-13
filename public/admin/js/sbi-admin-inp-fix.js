/**
 * SBI 8.0P.127 - Helpers UI admin comptes
 *
 * Ce fichier ne pilote plus la suppression utilisateur : admin-core.js reste
 * l’unique source de vérité. Il expose seulement une confirmation stylisée
 * pour éviter la double logique click/capture qui bloquait le flux natif.
 */

function closeConfirm(modal) {
    if (!modal) return;
    modal.style.opacity = '0';
    const panel = modal.querySelector('[data-panel]');
    if (panel) panel.style.transform = 'translateY(10px) scale(0.98)';
    window.setTimeout(() => modal.remove(), 180);
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showConfirm({ title, text, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', tone = 'danger' }) {
    return new Promise((resolve) => {
        let modal = document.getElementById('sbi-admin-delete-confirm');
        if (modal) modal.remove();

        const isDanger = tone !== 'info';
        const accent = isDanger ? '#ff4a4a' : '#2A57FF';
        const safeTitle = escapeHTML(title);
        const safeText = escapeHTML(text);
        const safeConfirm = escapeHTML(confirmLabel);
        const safeCancel = escapeHTML(cancelLabel);

        modal = document.createElement('div');
        modal.id = 'sbi-admin-delete-confirm';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10080;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);opacity:0;transition:opacity .18s ease;';
        modal.innerHTML = `
            <div data-panel style="width:min(92vw,440px);background:linear-gradient(145deg,#0d1327,#070b18);border:1px solid ${accent}66;padding:1.6rem;box-shadow:0 24px 70px rgba(0,0,0,.5);clip-path:polygon(0 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%);transform:translateY(10px) scale(.98);transition:transform .18s ease;">
                <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1.2rem;">
                    <div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:${accent};background:${accent}1A;border:1px solid ${accent}47;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);flex:0 0 auto;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2 1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    </div>
                    <div>
                        <h3 style="margin:0;color:#fff;font-size:1.12rem;font-weight:950;letter-spacing:-.03em;">${safeTitle}</h3>
                        <p style="margin:.45rem 0 0;color:#9ca3af;font-size:.92rem;line-height:1.45;">${safeText}</p>
                    </div>
                </div>
                <div style="display:flex;gap:.75rem;justify-content:flex-end;">
                    <button data-cancel style="padding:.82rem 1rem;border:1px solid rgba(148,163,184,.28);background:transparent;color:#fff;font-weight:800;cursor:pointer;clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);">${safeCancel}</button>
                    <button data-confirm style="padding:.82rem 1rem;border:1px solid ${accent}73;background:${accent}1F;color:${accent};font-weight:900;cursor:pointer;clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);">${safeConfirm}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            const panel = modal.querySelector('[data-panel]');
            if (panel) panel.style.transform = 'translateY(0) scale(1)';
        });

        const finish = (value) => {
            closeConfirm(modal);
            resolve(value);
        };

        modal.querySelector('[data-cancel]')?.addEventListener('click', () => finish(false));
        modal.querySelector('[data-confirm]')?.addEventListener('click', () => finish(true));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) finish(false);
        });
    });
}

window.SBIAdminConfirm = showConfirm;
