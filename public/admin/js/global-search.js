/**
 * =======================================================================
 * GLOBAL SEARCH
 * =======================================================================
 *
 * 6.7E.2 : recherche pédagogique robuste.
 * - prof -> recherche élèves de ses formations ;
 * - élève -> recherche profs de ses formations ;
 * - cours -> récupérés par formation + progression ;
 * - une requête Firestore refusée ne bloque plus la recherche entière.
 * =======================================================================
 */

import {
    getUserProfile,
    isAdminLike,
    loadAssignedFormationsForUser,
    loadCoursesForUser,
    loadSearchUsersForRole,
    roleOf
} from '/js/learning-access.js';

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


function isDebugSearchEnabled() {
    try {
        return localStorage.getItem('sbiDebugAccess') === 'true';
    } catch {
        return false;
    }
}

function isExpectedSearchAccessError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('permission-denied')
        || code.includes('failed-precondition')
        || message.includes('missing or insufficient permissions')
        || message.includes('permission')
        || message.includes('index');
}

function reportSearchLimit(label, error) {
    if (isExpectedSearchAccessError(error)) {
        if (isDebugSearchEnabled()) console.debug(`[SBI Search] ${label} :`, error);
        return;
    }

    console.warn(`[SBI Search] ${label} :`, error);
}

function getCurrentRole() {
    const profile = activeSearchContext.currentUserProfile || {};
    if (profile?.isGod === true) return 'admin';
    if (profile?.role) return roleOf(profile);
    if (window.location.pathname.includes('/admin/')) return 'admin';
    if (window.location.pathname.includes('/teacher/')) return 'teacher';
    return 'student';
}

async function refreshCurrentProfile() {
    const { currentUid } = activeSearchContext;
    let profile = activeSearchContext.currentUserProfile || {};

    if (!currentUid) return profile;

    if (!profile.role || !Array.isArray(profile.formationIds) || !Array.isArray(profile.formationsAcces)) {
        const fresh = await getUserProfile(currentUid);
        if (fresh) profile = { ...profile, ...fresh };
    }

    activeSearchContext.currentUserProfile = profile;
    return profile;
}

async function buildSearchCacheKey() {
    const profile = await refreshCurrentProfile();
    const role = getCurrentRole();
    return JSON.stringify({
        uid: activeSearchContext.currentUid,
        role,
        formationIds: [...(profile.formationIds || [])].sort(),
        formationsAcces: [...(profile.formationsAcces || [])].sort()
    });
}

async function ensureSearchDataCache() {
    const key = await buildSearchCacheKey();
    if (searchCache.ready && searchCache.key === key) return;

    const profile = await refreshCurrentProfile();
    const role = getCurrentRole();
    const uid = activeSearchContext.currentUid;

    const formations = await loadAssignedFormationsForUser({
        uid,
        userData: profile,
        role
    });

    const [users, courses] = await Promise.all([
        loadSearchUsersForRole({ uid, userData: profile, role, formations }),
        loadCoursesForUser({ uid, userData: profile, role, formations, includeProgress: true, activeOnly: true })
    ]);

    searchCache = {
        key,
        ready: true,
        users,
        courses
    };
}

function userMatchesSearchTerm(userData, term, role) {
    const fullName = `${userData.prenom || ''} ${userData.nom || ''}`.toLowerCase();
    const email = String(userData.email || '').toLowerCase();
    return role === 'admin'
        ? fullName.includes(term) || email.includes(term)
        : fullName.includes(term);
}

function courseMatchesSearchTerm(courseData, term) {
    return String(courseData.titre || '').toLowerCase().includes(term);
}

function buildUserSearchResults(term, role) {
    return searchCache.users
        .filter((userData) => userMatchesSearchTerm(userData, term, role))
        .filter((userData) => role === 'admin' || !isAdminLike(userData))
        .slice(0, 8);
}

function buildCourseSearchResults(term) {
    return searchCache.courses
        .filter((courseData) => courseMatchesSearchTerm(courseData, term))
        .slice(0, 8);
}

function getProfileLinkForSearchResult(userData, role) {
    if (role === 'admin') return `/admin/admin-profile.html?id=${userData.id}`;

    /**
     * Important : un élève n'a pas le droit d'entrer dans /teacher/* et un prof
     * n'a pas le droit d'entrer dans /student/*. Les pages rôle déclenchent
     * donc un guard qui renvoie au dashboard.
     *
     * Pour consulter un profil depuis la recherche, on reste dans l'espace du
     * viewer et on passe seulement l'id du profil cible. profile-core.js sait
     * afficher un autre utilisateur via ?id=.
     */
    if (role === 'teacher') return `/teacher/mon-profil.html?id=${userData.id}`;
    return `/student/mon-profil.html?id=${userData.id}`;
}

function getCourseLinkForSearchResult(courseData, role) {
    if (role === 'admin') return `/admin/formations-cours.html?edit=${courseData.id}`;
    if (role === 'teacher') {
        if (courseData.auteurId === activeSearchContext.currentUid) return `/teacher/mes-cours.html?edit=${courseData.id}`;
        return `/teacher/cours-viewer.html?id=${courseData.id}&preview=true`;
    }
    return `/student/cours-viewer.html?id=${courseData.id}`;
}

function getUserSearchSubText(userData, role) {
    if (role === 'admin') return userData.email || '';
    const targetRole = roleOf(userData, userData.role);
    if (targetRole === 'teacher') return 'Professeur';
    return 'Élève';
}

function renderSearchResults({ container, term, users, courses, role }) {
    let html = '';

    if (courses.length > 0) {
        html += `<div style="padding:6px 15px;font-size:.75rem;color:var(--text-muted,#888);background:rgba(0,0,0,.05);font-weight:bold;">COURS PÉDAGOGIQUES</div>`;
        courses.forEach((course) => {
            const link = getCourseLinkForSearchResult(course, role);
            html += `
                <div class="search-result-item" data-url="${link}">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="opacity:.6;min-width:18px;flex-shrink:0;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>
                    <div><div class="search-result-title">${escapeHTML(course.titre || 'Cours')}</div></div>
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
            catch (error) { reportSearchLimit('Préchargement limité', error); }
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
                reportSearchLimit('Recherche limitée', error);
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
