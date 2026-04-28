/**
 * =======================================================================
 * STORAGE DIAGNOSTICS - Dashboard admin SBI 5.4
 * =======================================================================
 * Analyse les anciens contenus base64 restants et permet la migration des
 * avatars vers Firebase Storage.
 * =======================================================================
 */

import {
    migrateAllLegacyAvatars,
    scanLegacyStorageUsage
} from '/js/avatar-storage.js';

const formatBytes = (bytes) => {
    const value = Number(bytes) || 0;

    if (value < 1024) return `${value} o`;

    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} Ko`;

    return `${(kb / 1024).toFixed(2)} Mo`;
};

const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
};

const setBadge = (text, color, background) => {
    const badge = document.getElementById('storage-status-badge');
    if (!badge) return;

    badge.textContent = text;
    badge.style.color = color;
    badge.style.background = background;
};

const setLog = (html) => {
    const log = document.getElementById('storage-migration-log');
    if (log) log.innerHTML = html;
};

const renderDiagnostics = (stats) => {
    const sizeDisplay = document.getElementById('storage-size-display');
    const gauge = document.getElementById('storage-gauge');
    const alertZone = document.getElementById('storage-alert-zone');
    const migrateBtn = document.getElementById('btn-migrate-legacy-avatars');

    const totalLegacyBytes = stats.firestoreLegacyBytes || 0;
    const limitBytes = 50 * 1024 * 1024;
    const percentage = Math.min((totalLegacyBytes / limitBytes) * 100, 100);

    if (sizeDisplay) sizeDisplay.textContent = formatBytes(totalLegacyBytes);
    if (gauge) gauge.style.width = `${percentage}%`;

    setText('storage-legacy-avatars', String(stats.avatarsLegacy || 0));
    setText('storage-legacy-originals', String(stats.avatarOriginalLegacy || 0));
    setText('storage-storage-avatars', String(stats.avatarsStorage || 0));
    setText('storage-course-base64-images', String(stats.courseImagesLegacy || 0));
    setText('storage-course-base64-videos', String(stats.courseVideosLegacy || 0));
    setText('storage-course-storage-media', String((stats.courseImagesStorage || 0) + (stats.courseVideosStorage || 0)));

    if (totalLegacyBytes === 0) {
        setBadge('Propre', 'var(--accent-green)', 'rgba(16, 185, 129, 0.1)');
        if (gauge) gauge.style.background = 'var(--accent-green)';
        if (alertZone) {
            alertZone.style.display = 'block';
            alertZone.style.borderColor = 'rgba(16,185,129,.35)';
            alertZone.style.background = 'rgba(16,185,129,.06)';
            alertZone.innerHTML = `
                <h4 style="margin: 0 0 0.5rem 0; color: var(--accent-green);">Firestore léger</h4>
                <p style="margin: 0; color: #aaa; font-size: 0.9rem;">Aucun ancien contenu base64 lourd détecté dans les avatars ou médias de cours.</p>
            `;
        }
    } else if (totalLegacyBytes < 10 * 1024 * 1024) {
        setBadge('Faible', 'var(--accent-green)', 'rgba(16, 185, 129, 0.1)');
        if (gauge) gauge.style.background = 'var(--accent-green)';
        if (alertZone) alertZone.style.display = 'none';
    } else if (totalLegacyBytes < limitBytes) {
        setBadge('À nettoyer', 'var(--accent-yellow)', 'rgba(251, 188, 4, 0.1)');
        if (gauge) gauge.style.background = 'var(--accent-yellow)';
        if (alertZone) alertZone.style.display = 'none';
    } else {
        setBadge('Lourd', 'var(--accent-red)', 'rgba(255, 74, 74, 0.1)');
        if (gauge) gauge.style.background = 'var(--accent-red)';
        if (alertZone) {
            alertZone.style.display = 'block';
            alertZone.style.borderColor = 'var(--accent-red)';
            alertZone.style.background = 'rgba(255, 74, 74, 0.05)';
            alertZone.innerHTML = `
                <h4 style="margin: 0 0 0.5rem 0; color: var(--accent-red);">Base64 trop présent</h4>
                <p style="margin: 0; color: #aaa; font-size: 0.9rem;">Les avatars ou médias anciens alourdissent encore Firestore. Lance la migration des avatars, puis vérifie les images de cours restantes.</p>
            `;
        }
    }

    if (migrateBtn) {
        migrateBtn.disabled = (stats.avatarsLegacy || 0) === 0;
        migrateBtn.style.opacity = migrateBtn.disabled ? '0.5' : '1';
        migrateBtn.style.cursor = migrateBtn.disabled ? 'not-allowed' : 'pointer';
    }
};

const loadStorageDiagnostics = async () => {
    const sizeDisplay = document.getElementById('storage-size-display');
    if (!sizeDisplay) return;

    try {
        sizeDisplay.textContent = 'Analyse...';
        setBadge('Analyse en cours', 'var(--accent-yellow)', 'rgba(251, 188, 4, 0.1)');
        setLog('');

        const stats = await scanLegacyStorageUsage();
        renderDiagnostics(stats);
    } catch (error) {
        console.error('[SBI Storage] Diagnostic impossible :', error);
        sizeDisplay.textContent = 'Erreur';
        setBadge('Erreur', 'var(--accent-red)', 'rgba(255, 74, 74, 0.1)');
        setLog(`<span style="color: var(--accent-red);">Erreur diagnostic : ${error?.message || error}</span>`);
    }
};

const runAvatarMigration = async () => {
    const btn = document.getElementById('btn-migrate-legacy-avatars');
    if (!btn || btn.disabled) return;

    const confirmed = confirm(
        "Migrer automatiquement les anciens avatars base64 vers Firebase Storage ?\n\n" +
        "Firestore ne gardera ensuite que l'URL Storage et le champ photoOriginal sera supprimé."
    );

    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = 'Migration en cours...';
    setLog('<span style="color:#aaa;">Migration des avatars lancée...</span>');

    try {
        const result = await migrateAllLegacyAvatars({
            onProgress: (progress) => {
                setLog(`
                    <span style="color:#aaa;">
                        Migration : ${progress.current}/${progress.total}<br>
                        Migrés : ${progress.migrated} · Nettoyés : ${progress.cleaned || 0} · Échecs : ${progress.failed}
                    </span>
                `);
            }
        });

        const errorHtml = result.errors.length
            ? `<br><span style="color: var(--accent-red);">${result.errors.length} erreur(s). Voir la console.</span>`
            : '';

        setLog(`
            <span style="color: var(--accent-green);">
                Migration terminée : ${result.migrated} avatar(s) migré(s), ${result.cleaned || 0} photoOriginal nettoyée(s) sur ${result.total} profil(s).
            </span>${errorHtml}
        `);

        await loadStorageDiagnostics();
    } catch (error) {
        console.error('[SBI Storage] Migration impossible :', error);
        setLog(`<span style="color: var(--accent-red);">Migration impossible : ${error?.message || error}</span>`);
    } finally {
        btn.textContent = 'Migrer les anciens avatars';
        btn.disabled = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const btnRefresh = document.getElementById('btn-refresh-server-stats');
    if (btnRefresh) btnRefresh.addEventListener('click', loadStorageDiagnostics);

    const btnMigrate = document.getElementById('btn-migrate-legacy-avatars');
    if (btnMigrate) btnMigrate.addEventListener('click', runAvatarMigration);

    const settingsView = document.getElementById('view-settings');

    if (settingsView) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.style.display === 'block' && mutation.target.id === 'view-settings') {
                    loadStorageDiagnostics();
                }
            });
        });

        observer.observe(settingsView, { attributes: true, attributeFilter: ['style'] });
    }

    if (settingsView && window.getComputedStyle(settingsView).display !== 'none') {
        loadStorageDiagnostics();
    }
});
