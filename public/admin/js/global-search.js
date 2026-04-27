/**
 * =======================================================================
 * GLOBAL SEARCH
 * =======================================================================
 *
 * 6.7E.1 : recherche query-safe.
 * Une requête Firestore refusée ne fait plus tomber toute la recherche.
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let activeSearchContext = {
    currentUid: null,
    currentUserProfile: null
};

let searchCache = {
    key: null,
    ready: false,
    users: [],
    courses: []
};

const escapeHTML = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeList = (items) => {
    if (!Array.isArray(items)) return [];
    return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));
};

const chunkArray = (items, size = 10) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

const uniqById = (items) => {
    const map = new Map();
    items.forEach((item) => { if (item?.id) map.set(item.id, item); });
    return Array.from(map.values());
};

const snapToArray = (snapshot) => {
    const items = [];
    snapshot?.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
    return items;
};

async function safeGetDocs(queryRef, label = 'requête Firestore') {
    try {
        return await getDocs(queryRef);
    } catch (error) {
        console.warn(`[SBI Search] ${label} ignorée :`, error);
        return null;
    }
}

const getCurrentRole = () => {
    const profile = activeSearchContext.currentUserProfile;
    if (profile?.isGod === true) return 'admin';
    if (profile?.role) return profile.role;
    if (window.location.pathname.includes('/admin/')) return 'admin';
    if (window.location.pathname.includes('/teacher/')) return 'teacher';
    return 'student';
};

const isAdminLikeUser = (userData) => userData?.isGod === true || userData?.role === 'admin';

async function refreshCurrentProfileIfNeeded() {
    const { currentUid } = activeSearchContext;
    if (!currentUid) return activeSearchContext.currentUserProfile || {};

    let profile = activeSearchContext.currentUserProfile || {};

    if (!Array.isArray(profile.formationIds) || !Array.isArray(profile.formationsAcces) || !profile.role) {
        try {
            const freshSnap = await getDoc(doc(db, "users", currentUid));
            if (freshSnap.exists()) {
                profile = { ...profile, ...freshSnap.data() };
                activeSearchContext.currentUserProfile = profile;
            }
        } catch (error) {
            console.warn("[SBI Search] Impossible de rafraîchir le profil :", error);
        }
    }

    return profile;
}

async function loadMembershipFormations(uid, role) {
    if (!uid) return [];

    const fieldName = role === 'teacher' ? 'profs' : 'students';
    const formationsQuery = query(collection(db, "formations"), where(fieldName, "array-contains", uid));
    const snap = await safeGetDocs(formationsQuery, `formations par ${fieldName}`);
    return snap ? snapToArray(snap) : [];
}

async function getFormationLookupKeysFromProfile() {
    const { currentUid } = activeSearchContext;
    const role = getCurrentRole();
    const profile = await refreshCurrentProfileIfNeeded();

    const keys = [
        ...normalizeList(profile.formationIds),
        ...normalizeList(profile.formationsAcces)
    ];

    const membershipFormations = await loadMembershipFormations(currentUid, role);
    membershipFormations.forEach((formation) => {
        if (formation.id) keys.push(String(formation.id));
        if (formation.titre) keys.push(String(formation.titre));
    });

    return normalizeList(keys);
}

async function buildSearchCacheKey() {
    const role = getCurrentRole();
    const formationKeys = await getFormationLookupKeysFromProfile();
    return JSON.stringify({
        uid: activeSearchContext.currentUid,
        role,
        formationKeys: formationKeys.slice().sort()
    });
}

async function loadAdminSearchData() {
    const [usersSnap, coursesSnap] = await Promise.all([
        safeGetDocs(collection(db, "users"), 'utilisateurs admin'),
        safeGetDocs(collection(db, "courses"), 'cours admin')
    ]);

    return {
        users: usersSnap ? snapToArray(usersSnap) : [],
        courses: coursesSnap ? snapToArray(coursesSnap) : []
    };
}

async function loadRestrictedUsers(formationKeys) {
    const formationIdsOnly = normalizeList(formationKeys).filter((value) => !value.includes(' '));
    if (!formationIdsOnly.length) return [];

    const users = [];

    for (const chunk of chunkArray(formationIdsOnly, 10)) {
        const usersQuery = query(collection(db, "users"), where("formationIds", "array-contains-any", chunk));
        const snap = await safeGetDocs(usersQuery, 'utilisateurs par formations partagées');
        if (!snap) continue;

        snap.forEach((userDoc) => {
            const data = { id: userDoc.id, ...userDoc.data() };
            if (!isAdminLikeUser(data)) users.push(data);
        });
    }

    return uniqById(users);
}

async function loadRestrictedCourses(formationKeys, role) {
    const courses = [];
    const keys = normalizeList(formationKeys);

    for (const chunk of chunkArray(keys, 10)) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await safeGetDocs(coursesQuery, 'cours par formations partagées');
        if (snap) courses.push(...snapToArray(snap));
    }

    if (role === 'teacher' && activeSearchContext.currentUid) {
        const ownCoursesQuery = query(collection(db, "courses"), where("auteurId", "==", activeSearchContext.currentUid));
        const ownSnap = await safeGetDocs(ownCoursesQuery, 'cours propres professeur');
        if (ownSnap) courses.push(...snapToArray(ownSnap));
    }

    return uniqById(courses);
}

async function ensureSearchDataCache() {
    const key = await buildSearchCacheKey();
    if (searchCache.ready && searchCache.key === key) return;

    const role = getCurrentRole();

    if (role === 'admin') {
        const data = await loadAdminSearchData();
        searchCache = { key, ready: true, users: data.users, courses: data.courses };
        return;
    }

    const formationKeys = await getFormationLookupKeysFromProfile();
    const [users, courses] = await Promise.all([
        loadRestrictedUsers(formationKeys),
        loadRestrictedCourses(formationKeys, role)
    ]);

    searchCache = { key, ready: true, users, courses };
}

const userMatchesSearchTerm = (userData, term, role) => {
    const fullName = `${userData.prenom || ''} ${userData.nom || ''}`.toLowerCase();
    const email = String(userData.email || '').toLowerCase();
    return role === 'admin' ? fullName.includes(term) || email.includes(term) : fullName.includes(term);
};

const courseMatchesSearchTerm = (courseData, term) => String(courseData.titre || '').toLowerCase().includes(term);

const buildUserSearchResults = (term, role) => searchCache.users
    .filter((userData) => userMatchesSearchTerm(userData, term, role))
    .filter((userData) => role === 'admin' || !isAdminLikeUser(userData))
    .slice(0, 6);

const buildCourseSearchResults = (term) => searchCache.courses
    .filter((courseData) => courseMatchesSearchTerm(courseData, term))
    .slice(0, 6);

const getProfileLinkForSearchResult = (userData, role) => {
    if (role === 'admin') return `/admin/admin-profile.html?id=${userData.id}`;
    if (role === 'teacher') return `/teacher/mon-profil.html?id=${userData.id}`;
    return `/student/mon-profil.html?id=${userData.id}`;
};

const getCourseLinkForSearchResult = (courseData, role) => {
    if (role === 'admin') return `/admin/formations-cours.html?edit=${courseData.id}`;
    if (role === 'teacher') {
        if (courseData.auteurId === activeSearchContext.currentUid) return `/teacher/mes-cours.html?edit=${courseData.id}`;
        return `/teacher/cours-viewer.html?id=${courseData.id}&preview=true`;
    }
    return `/student/cours-viewer.html?id=${courseData.id}`;
};

const getUserSearchSubText = (userData, role) => {
    if (role === 'admin') return userData.email || '';
    if (userData.role === 'teacher') return 'Professeur';
    return 'Élève';
};

function renderSearchResults({ container, term, users, courses, role }) {
    let html = '';

    if (courses.length > 0) {
        html += `<div style="padding:6px 15px;font-size:.75rem;color:var(--text-muted,#888);background:rgba(0,0,0,.05);font-weight:bold;">COURS PÉDAGOGIQUES</div>`;
        courses.forEach((course) => {
            const link = getCourseLinkForSearchResult(course, role);
            html += `
                <div class="search-result-item" data-url="${link}">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="opacity:.6;min-width:18px;flex-shrink:0;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>
                    <div><div class="search-result-title">${escapeHTML(course.titre)}</div></div>
                </div>`;
        });
    }

    if (users.length > 0) {
        html += `<div style="padding:6px 15px;font-size:.75rem;color:var(--text-muted,#888);background:rgba(0,0,0,.05);font-weight:bold;">UTILISATEURS</div>`;
        users.forEach((userData) => {
            const profileLink = getProfileLinkForSearchResult(userData, role);
            const subText = getUserSearchSubText(userData, role);
            const displayName = `${userData.prenom || ''} ${userData.nom || ''}`.trim() || 'Utilisateur';
            html += `
                <div class="search-result-item" data-url="${profileLink}">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="opacity:.6;min-width:18px;flex-shrink:0;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    <div><div class="search-result-title">${escapeHTML(displayName)}</div><div class="search-result-sub">${escapeHTML(subText)}</div></div>
                </div>`;
        });
    }

    if (!html) html = `<div style="padding:15px;color:var(--text-muted,#888);text-align:center;font-size:.85rem;">Aucun résultat pour "${escapeHTML(term)}"</div>`;

    container.innerHTML = html;
    container.style.display = 'block';
}

export function setupGlobalSearch({ currentUid, currentUserProfile } = {}) {
    activeSearchContext = { currentUid, currentUserProfile };
    const searchInputs = document.querySelectorAll('.global-search-input');

    searchInputs.forEach((input) => {
        if (input.dataset.searchAttached) return;
        input.dataset.searchAttached = 'true';

        const resultsContainer = input.nextElementSibling;
        if (!resultsContainer) return;

        input.addEventListener('focus', async () => {
            try { await ensureSearchDataCache(); }
            catch (error) { console.warn('[SBI Search] Préchargement limité :', error); }
        });

        input.addEventListener('input', async (e) => {
            const term = e.target.value.toLowerCase().trim();

            if (term.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }

            resultsContainer.innerHTML = `<div style="padding:15px;color:var(--text-muted,#888);text-align:center;font-size:.85rem;">Recherche...</div>`;
            resultsContainer.style.display = 'block';

            try {
                await ensureSearchDataCache();
                const role = getCurrentRole();
                renderSearchResults({
                    container: resultsContainer,
                    term,
                    users: buildUserSearchResults(term, role),
                    courses: buildCourseSearchResults(term),
                    role
                });
            } catch (error) {
                console.warn('[SBI Search] Recherche limitée :', error);
                resultsContainer.innerHTML = `<div style="padding:15px;color:var(--text-muted,#888);text-align:center;font-size:.85rem;">Recherche temporairement limitée.</div>`;
                resultsContainer.style.display = 'block';
            }
        });

        resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');
            if (item?.dataset.url) window.location.assign(item.dataset.url);
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !resultsContainer.contains(e.target)) resultsContainer.style.display = 'none';
        });
    });
}

export function clearGlobalSearchCache() {
    searchCache = { key: null, ready: false, users: [], courses: [] };
}
