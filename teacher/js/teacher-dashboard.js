/**
 * SBI 8.0G - Teacher dashboard data bridge
 *
 * Le topbar teacher est rendu par Web Components chargés dynamiquement.
 * Ce fichier attend leur disponibilité avant d'injecter les infos Firestore.
 * 8.0G : compatible montage PJAX via mountTeacherDashboard().
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';

let activeCleanup = null;

export function mountTeacherDashboard() {
    activeCleanup?.({ reason: 'remount' });

    let disposed = false;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (disposed) return;

        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        try {
            await waitForSbiTopbar();
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (!userSnap.exists() || disposed) return;

            updateTeacherTopbar(userSnap.data() || {});
        } catch (error) {
            console.warn('[SBI Teacher Dashboard] Profil dashboard indisponible :', error);
        } finally {
            document.body.classList.remove('preload');
        }
    });

    const cleanup = () => {
        disposed = true;
        unsubscribeAuth?.();
        if (activeCleanup === cleanup) activeCleanup = null;
    };

    activeCleanup = cleanup;
    bindTeacherDashboardLinks(cleanup);
    return cleanup;
}

function bindTeacherDashboardLinks() {
    document.querySelectorAll('a.sbi-dashboard-primary-link, a.sbi-dashboard-secondary-link').forEach((link) => {
        if (link.dataset.sbiTeacherDashboardBound === 'true') return;
        link.dataset.sbiTeacherDashboardBound = 'true';

        const href = link.getAttribute('href');
        if (href) link.setAttribute('data-sbi-href', href);
    });
}

function updateTeacherTopbar(profile) {
    const displayName = `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.displayName || 'Professeur';
    const avatarUrl = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111&color=fff`;

    const topName = document.getElementById('top-user-name');
    if (topName) topName.textContent = displayName;

    const topLevel = document.getElementById('top-user-level');
    if (topLevel) topLevel.textContent = 'Coach SBI';

    const topAvatar = document.getElementById('top-user-avatar');
    if (topAvatar) {
        topAvatar.innerHTML = `<img src="${escapeAttr(avatarUrl)}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(displayName.charAt(0).toUpperCase())}';">`;
    }
}

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#096;');
}

function autoMountTeacherDashboard() {
    if (window.__SBI_APP_SHELL_MOUNTING_TEACHER_DASHBOARD) return;
    if (!document.querySelector('.sbi-teacher-dashboard')) return;
    mountTeacherDashboard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountTeacherDashboard, { once: true });
} else {
    autoMountTeacherDashboard();
}
