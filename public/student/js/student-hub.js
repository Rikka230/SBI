/**
 * =======================================================================
 * STUDENT HUB - Tableau de bord étudiant
 * =======================================================================
 *
 * Patch 6.7D.1 :
 * - attend les Web Components avant d'écrire dans la topbar ;
 * - accès formations robuste : formationIds, formationsAcces, students[] ;
 * - accès cours dashboard par ID de formation + titre legacy ;
 * - aucune erreur Firestore ne doit déconnecter visuellement le dashboard.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';

const state = {
    uid: null,
    userData: {},
    formations: [],
    courses: []
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        state.uid = user.uid;

        try {
            await waitForSbiTopbar();
            await loadStudentData(user.uid);
        } catch (error) {
            console.error('[SBI Student Hub] Erreur de chargement :', error);
            renderFormationError();
        } finally {
            document.body.classList.remove('preload');
        }
    });
});

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
        const ready = ids.every((id) => document.getElementById(id));
        if (ready) return true;
        await sleep(50);
    }

    return false;
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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

    state.formations = await fetchAssignedFormations(uid, state.userData);
    state.courses = await fetchAssignedCourses(state.formations, state.userData);

    renderAssignedFormations();
    updateContinueLearningCard();
}

function updateTopBar(userData) {
    const name = `${userData.prenom || ''} ${userData.nom || ''}`.trim() || userData.displayName || 'Étudiant';

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) {
        topUserName.textContent = name;
    }

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
    if (topUserLevel) {
        topUserLevel.textContent = `Niveau ${level}`;
    }

    const hubLevel = document.getElementById('hub-level');
    if (hubLevel) {
        hubLevel.textContent = String(level);
    }

    const hubXp = document.getElementById('hub-xp');
    if (hubXp) {
        hubXp.textContent = String(xp);
    }

    window.setTimeout(() => {
        const xpFill = document.getElementById('hub-xp-fill');
        if (xpFill) {
            xpFill.style.width = `${percent}%`;
        }
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
        const count = countCoursesForFormation(formation);
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
            window.location.href = '/student/mes-cours.html';
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

async function fetchAssignedFormations(uid, userData) {
    const isAdminPreview = userData.role === 'admin' || userData.isGod === true;

    if (isAdminPreview) {
        const allSnap = await safeGetDocs(collection(db, 'formations'), 'toutes les formations admin preview');
        return allSnap ? snapToArray(allSnap).sort(sortByTitle) : [];
    }

    const byIds = await loadFormationsByIds(userData.formationIds || []);
    const byTitles = await loadFormationsByTitles(userData.formationsAcces || []);
    const byMembership = await loadFormationsByMembership(uid);

    return uniqById([...byIds, ...byTitles, ...byMembership]).sort(sortByTitle);
}

async function loadFormationsByIds(formationIds) {
    const ids = normalizeList(formationIds);
    if (!ids.length) return [];

    const formations = [];

    for (const chunk of chunkArray(ids, 10)) {
        const q = query(collection(db, 'formations'), where(documentId(), 'in', chunk));
        const snap = await safeGetDocs(q, 'formations étudiant par IDs');
        if (snap) formations.push(...snapToArray(snap));
    }

    return formations;
}

async function loadFormationsByTitles(titles) {
    const safeTitles = normalizeList(titles);
    if (!safeTitles.length) return [];

    const formations = [];

    for (const chunk of chunkArray(safeTitles, 10)) {
        const q = query(collection(db, 'formations'), where('titre', 'in', chunk));
        const snap = await safeGetDocs(q, 'formations étudiant par titres legacy');
        if (snap) formations.push(...snapToArray(snap));
    }

    return formations;
}

async function loadFormationsByMembership(uid) {
    const q = query(collection(db, 'formations'), where('students', 'array-contains', uid));
    const snap = await safeGetDocs(q, 'formations étudiant par students[]');
    return snap ? snapToArray(snap) : [];
}

async function fetchAssignedCourses(formations, userData) {
    const isAdminPreview = userData.role === 'admin' || userData.isGod === true;

    if (isAdminPreview) {
        const snap = await safeGetDocs(query(collection(db, 'courses'), where('actif', '==', true)), 'cours actifs admin preview');
        return snap ? snapToArray(snap).sort(sortCourses) : [];
    }

    const formationIds = formations.map((formation) => formation.id).filter(Boolean);
    const formationTitles = formations.map((formation) => formation.titre).filter(Boolean);

    const byIds = await loadCoursesByFormationValues(formationIds);
    const byTitles = await loadCoursesByFormationValues(formationTitles);

    return uniqById([...byIds, ...byTitles]).sort(sortCourses);
}

async function loadCoursesByFormationValues(values) {
    const safeValues = normalizeList(values);
    if (!safeValues.length) return [];

    const courses = [];

    for (const chunk of chunkArray(safeValues, 10)) {
        const q = query(
            collection(db, 'courses'),
            where('formations', 'array-contains-any', chunk),
            where('actif', '==', true)
        );
        const snap = await safeGetDocs(q, 'cours dashboard étudiant par formations');
        if (snap) courses.push(...snapToArray(snap));
    }

    return courses;
}

function countCoursesForFormation(formation) {
    return state.courses.filter((course) => courseBelongsToFormation(course, formation)).length;
}

function courseBelongsToFormation(course, formation) {
    if (!Array.isArray(course.formations)) return false;

    const courseValues = normalizeList(course.formations);
    const formationId = formation.id ? String(formation.id).trim() : '';
    const formationTitle = formation.titre ? String(formation.titre).trim() : '';

    return Boolean(
        (formationId && courseValues.includes(formationId)) ||
        (formationTitle && courseValues.includes(formationTitle))
    );
}

async function safeGetDocs(queryRef, label) {
    try {
        return await getDocs(queryRef);
    } catch (error) {
        console.warn(`[SBI Student Hub] ${label} ignoré :`, error);
        return null;
    }
}

function snapToArray(snapshot) {
    const items = [];
    snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
    });
    return items;
}

function normalizeList(values) {
    if (!Array.isArray(values)) return [];
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function chunkArray(items, size = 10) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function uniqById(items) {
    const map = new Map();
    items.forEach((item) => {
        if (item?.id) map.set(item.id, item);
    });
    return Array.from(map.values());
}

function sortByTitle(a, b) {
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' });
}

function sortCourses(a, b) {
    const blocCompare = String(a.bloc || '').localeCompare(String(b.bloc || ''), 'fr', { sensitivity: 'base' });
    if (blocCompare !== 0) return blocCompare;
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' });
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
