/**
 * =======================================================================
 * STUDENT HUB - Tableau de bord étudiant
 * =======================================================================
 *
 * 8.0F : devient montable via mountStudentHub() pour le shell PJAX.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { getUserLearningProgress } from '/js/course-engine.js';
import {
    courseBelongsToFormation as sharedCourseBelongsToFormation,
    loadAssignedFormationsForUser,
    loadCoursesForUser
} from '/js/learning-access.js';

const state = {
    uid: null,
    userData: {},
    formations: [],
    courses: [],
    progress: { courses: {}, formations: {} }
};

let activeCleanup = null;

function resetState() {
    state.uid = null;
    state.userData = {};
    state.formations = [];
    state.courses = [];
    state.progress = { courses: {}, formations: {} };
}

export function mountStudentHub() {
    activeCleanup?.({ reason: 'remount' });
    resetState();

    let disposed = false;
    let unsubscribeAuth = null;
    const cleanups = [];

    const addCleanup = (cleanup) => {
        if (typeof cleanup === 'function') cleanups.push(cleanup);
    };

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (disposed) return;

        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        state.uid = user.uid;

        try {
            await waitForSbiTopbar();
            await loadStudentData(user.uid);
            bindHubActions(addCleanup);
        } catch (error) {
            console.error('[SBI Student Hub] Erreur de chargement :', error);
            renderFormationError();
        } finally {
            document.body.classList.remove('preload');
        }
    });

    const cleanup = () => {
        disposed = true;
        unsubscribeAuth?.();
        cleanups.splice(0, cleanups.length).forEach((fn) => {
            try { fn(); } catch {}
        });
        if (activeCleanup === cleanup) activeCleanup = null;
    };

    activeCleanup = cleanup;
    return cleanup;
}

function bindHubActions(addCleanup) {
    const exploreButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Explorer la bibliothèque'));

    if (exploreButton && exploreButton.dataset.sbiHubBound !== 'true') {
        exploreButton.dataset.sbiHubBound = 'true';
        exploreButton.removeAttribute('onclick');
        exploreButton.setAttribute('data-sbi-href', '/student/mes-cours.html');

        const handler = () => {
            window.SBI_APP_SHELL?.navigate?.(new URL('/student/mes-cours.html', window.location.origin), {
                historyMode: 'push',
                source: 'student-hub-cta'
            }) || (window.location.href = '/student/mes-cours.html');
        };

        exploreButton.addEventListener('click', handler);
        addCleanup(() => exploreButton.removeEventListener('click', handler));
    }
}

async function loadStudentData(uid) {
    const userSnap = await getDoc(doc(db, "users", uid));

    if (!userSnap.exists()) {
        console.warn('[SBI Student Hub] Profil utilisateur introuvable.');
        window.location.replace('/login.html');
        return;
    }

    state.userData = userSnap.data() || {};

    updateTopBar(state.userData);
    updateGamification(state.userData);

    state.progress = await getUserLearningProgress(uid);
    state.formations = await loadAssignedFormationsForUser({
        uid,
        userData: state.userData,
        role: 'student'
    });
    state.courses = await loadCoursesForUser({
        uid: state.uid,
        userData: state.userData,
        role: 'student',
        formations: state.formations,
        progress: state.progress,
        includeProgress: true,
        activeOnly: true
    });

    renderAssignedFormations();
    updateContinueLearningCard();
}

function updateTopBar(userData) {
    const name = `${userData.prenom || ''} ${userData.nom || ''}`.trim() || userData.displayName || 'Étudiant';

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) topUserName.textContent = name;

    const topUserAvatar = document.getElementById('top-user-avatar');
    if (topUserAvatar) {
        if (userData.photoURL) {
            topUserAvatar.innerHTML = `<img src="${escapeAttr(userData.photoURL)}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(name.charAt(0).toUpperCase())}';">`;
        } else {
            topUserAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

function updateGamification(userData) {
    const xp = Number(userData.xp || 0);
    const level = Math.floor(xp / 100) + 1;
    const percent = Math.min((xp / 1000) * 100, 100);

    const topUserLevel = document.getElementById('top-user-level');
    if (topUserLevel) topUserLevel.textContent = `Niveau ${level}`;

    const hubLevel = document.getElementById('hub-level');
    if (hubLevel) hubLevel.textContent = String(level);

    const hubXp = document.getElementById('hub-xp');
    if (hubXp) hubXp.textContent = String(xp);

    window.setTimeout(() => {
        const xpFill = document.getElementById('hub-xp-fill');
        if (xpFill) xpFill.style.width = `${percent}%`;
    }, 250);
}

function renderAssignedFormations() {
    const formationsList = document.getElementById('assigned-formations-list');
    if (!formationsList) return;

    if (state.formations.length === 0) {
        formationsList.innerHTML = `
            <p style="color:var(--text-muted); font-style:italic;">
                Aucun module ne vous a été assigné par l'équipe pédagogique.
            </p>
        `;
        return;
    }

    formationsList.innerHTML = state.formations.map((formation) => {
        const title = escapeHTML(formation.titre || 'Formation');
        const count = state.courses.filter((course) => sharedCourseBelongsToFormation(course, formation, state.formations)).length;
        const courseLabel = count > 1 ? `${count} cours actifs` : count === 1 ? '1 cours actif' : 'Aucun cours actif';

        return `
            <button type="button" class="hub-formation-link" data-formation-id="${escapeAttr(formation.id)}" style="width:100%; text-align:left; padding:1rem; background:#0a0a0c; border:1px solid #222; border-radius:6px; color:white; display:flex; align-items:center; gap:.8rem; cursor:pointer; transition:.2s;">
                <span style="width:8px; height:8px; background:var(--accent-blue); border-radius:50%; flex-shrink:0;"></span>
                <span style="min-width:0; flex:1;">
                    <span style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:800;">${title}</span>
                    <span style="display:block; margin-top:.25rem; color:rgba(255,255,255,.62); font-size:.78rem;">${courseLabel}</span>
                </span>
            </button>
        `;
    }).join('');

    formationsList.querySelectorAll('.hub-formation-link').forEach((button) => {
        button.addEventListener('mouseenter', () => { button.style.borderColor = 'var(--accent-blue)'; });
        button.addEventListener('mouseleave', () => { button.style.borderColor = '#222'; });
        button.addEventListener('click', () => {
            window.SBI_APP_SHELL?.navigate?.(new URL('/student/mes-cours.html', window.location.origin), {
                historyMode: 'push',
                source: 'student-hub-formation'
            }) || (window.location.href = '/student/mes-cours.html');
        });
    });
}

function updateContinueLearningCard() {
    const card = document.querySelector('.hub-card[style*="linear-gradient"] p');
    if (!card) return;

    const courseCount = state.courses.length;

    if (courseCount === 0) {
        card.textContent = "Vos formations sont prêtes. Les prochains cours actifs apparaîtront ici dès qu'ils seront publiés.";
        return;
    }

    card.textContent = courseCount > 1
        ? `Vous avez ${courseCount} cours actifs dans votre bibliothèque. Ne perdez pas le rythme !`
        : "Vous avez 1 cours actif dans votre bibliothèque. Ne perdez pas le rythme !";
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#096;');
}

function renderFormationError() {
    const formationsList = document.getElementById('assigned-formations-list');
    if (!formationsList) return;

    formationsList.innerHTML = `
        <p style="color: var(--accent-red, #ff4a4a); font-style: italic;">
            Impossible de charger vos formations pour le moment.
        </p>
    `;
}

function autoMountStudentHub() {
    if (window.__SBI_APP_SHELL_MOUNTING_STUDENT_HUB) return;
    if (!document.getElementById('assigned-formations-list')) return;
    mountStudentHub();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountStudentHub, { once: true });
} else {
    autoMountStudentHub();
}
