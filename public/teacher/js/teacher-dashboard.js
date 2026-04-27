/**
 * SBI 6.7D.1 - Teacher dashboard data bridge
 *
 * Le topbar teacher est rendu par Web Components chargés dynamiquement.
 * Ce fichier attend leur disponibilité avant d'injecter les infos Firestore.
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherDashboard);
} else {
    initTeacherDashboard();
}

function initTeacherDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        try {
            await waitForSbiComponents();
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (!userSnap.exists()) return;

            updateTeacherTopbar(userSnap.data() || {});
        } catch (error) {
            console.warn('[SBI Teacher Dashboard] Profil dashboard indisponible :', error);
        } finally {
            document.body.classList.remove('preload');
        }
    });
}

async function waitForSbiComponents() {
    if (window.__SBI_COMPONENTS_READY === true) {
        await waitForElements(['top-user-name', 'top-user-avatar'], 1000);
        return;
    }

    if (window.SBI_COMPONENTS_READY && typeof window.SBI_COMPONENTS_READY.then === 'function') {
        await Promise.race([
            window.SBI_COMPONENTS_READY.catch(() => {}),
            sleep(1200)
        ]);
    } else {
        await new Promise((resolve) => {
            const timeout = window.setTimeout(resolve, 1200);
            window.addEventListener('sbi:components-ready', () => {
                window.clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    }

    await waitForElements(['top-user-name', 'top-user-avatar'], 1200);
}

async function waitForElements(ids, timeoutMs = 1200) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (ids.every((id) => document.getElementById(id))) return true;
        await sleep(50);
    }

    return false;
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
        topAvatar.innerHTML = `<img src="${escapeAttr(avatarUrl)}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;">`;
    }
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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
