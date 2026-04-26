/**
 * =======================================================================
 * GLOBAL SEARCH
 * =======================================================================
 *
 * Recherche globale query-safe :
 *
 * Admin / isGod :
 * - users : tous
 * - courses : tous
 *
 * Prof / élève :
 * - users : profils qui partagent au moins une formation via formationIds
 * - courses : cours actifs liés à ses formationIds
 * - teacher : ajoute aussi ses propres cours, même brouillons
 * - aucun admin visible côté prof/élève
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

const escapeHTML = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const chunkArray = (items, size = 10) => {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
};

const uniqById = (items) => {
    const map = new Map();

    items.forEach((item) => {
        if (item?.id) {
            map.set(item.id, item);
        }
    });

    return Array.from(map.values());
};

const getCurrentRole = () => {
    const profile = activeSearchContext.currentUserProfile;

    if (profile?.isGod === true) return 'admin';
    if (profile?.role) return profile.role;

    if (window.location.pathname.includes('/admin/')) return 'admin';
    if (window.location.pathname.includes('/teacher/')) return 'teacher';

    return 'student';
};

const isAdminLikeUser = (userData) => {
    return userData?.isGod === true || userData?.role === 'admin';
};

const getFormationIdsFromProfile = async () => {
    const { currentUid } = activeSearchContext;

    if (!currentUid) return [];

    let profile = activeSearchContext.currentUserProfile || {};

    if (!Array.isArray(profile.formationIds)) {
        try {
            const freshSnap = await getDoc(doc(db, "users", currentUid));

            if (freshSnap.exists()) {
                profile = {
                    ...profile,
                    ...freshSnap.data()
                };

                activeSearchContext.currentUserProfile = profile;
            }
        } catch (error) {
            console.warn("[SBI Search] Impossible de rafraîchir le profil :", error);
        }
    }

    return Array.isArray(profile.formationIds)
        ? profile.formationIds.filter(Boolean).map(String)
        : [];
};

const buildSearchCacheKey = async () => {
    const { currentUid } = activeSearchContext;
    const role = getCurrentRole();
    const formationIds = await getFormationIdsFromProfile();

    return JSON.stringify({
        uid: currentUid,
        role,
        formationIds: formationIds.slice().sort()
    });
};

const loadAdminSearchData = async () => {
    const [usersSnap, coursesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "courses"))
    ]);

    const users = [];
    const courses = [];

    usersSnap.forEach((userDoc) => {
        users.push({
            id: userDoc.id,
            ...userDoc.data()
        });
    });

    coursesSnap.forEach((courseDoc) => {
        courses.push({
            id: courseDoc.id,
            ...courseDoc.data()
        });
    });

    return {
        users,
        courses
    };
};

const loadRestrictedUsers = async (formationIds) => {
    if (!formationIds.length) return [];

    const users = [];
    const chunks = chunkArray(formationIds, 10);

    for (const chunk of chunks) {
        const usersQuery = query(
            collection(db, "users"),
            where("formationIds", "array-contains-any", chunk)
        );

        const snap = await getDocs(usersQuery);

        snap.forEach((userDoc) => {
            const data = {
                id: userDoc.id,
                ...userDoc.data()
            };

            if (!isAdminLikeUser(data)) {
                users.push(data);
            }
        });
    }

    return uniqById(users);
};

const loadRestrictedCourses = async (formationIds, role) => {
    const courses = [];
    const chunks = chunkArray(formationIds, 10);

    for (const chunk of chunks) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await getDocs(coursesQuery);

        snap.forEach((courseDoc) => {
            courses.push({
                id: courseDoc.id,
                ...courseDoc.data()
            });
        });
    }

    if (role === 'teacher' && activeSearchContext.currentUid) {
        const ownCoursesQuery = query(
            collection(db, "courses"),
            where("auteurId", "==", activeSearchContext.currentUid)
        );

        const ownSnap = await getDocs(ownCoursesQuery);

        ownSnap.forEach((courseDoc) => {
            courses.push({
                id: courseDoc.id,
                ...courseDoc.data()
            });
        });
    }

    return uniqById(courses);
};

const ensureSearchDataCache = async () => {
    const key = await buildSearchCacheKey();

    if (searchCache.ready && searchCache.key === key) {
        return;
    }

    const role = getCurrentRole();

    if (role === 'admin') {
        const data = await loadAdminSearchData();

        searchCache = {
            key,
            ready: true,
            users: data.users,
            courses: data.courses
        };

        return;
    }

    const formationIds = await getFormationIdsFromProfile();

    const [users, courses] = await Promise.all([
        loadRestrictedUsers(formationIds),
        loadRestrictedCourses(formationIds, role)
    ]);

    searchCache = {
        key,
        ready: true,
        users,
        courses
    };
};

const userMatchesSearchTerm = (userData, term, role) => {
    const fullName = `${userData.prenom || ''} ${userData.nom || ''}`.toLowerCase();
    const email = String(userData.email || '').toLowerCase();

    if (role === 'admin') {
        return fullName.includes(term) || email.includes(term);
    }

    return fullName.includes(term);
};

const courseMatchesSearchTerm = (courseData, term) => {
    return String(courseData.titre || '').toLowerCase().includes(term);
};

const buildUserSearchResults = (term, role) => {
    return searchCache.users
        .filter((userData) => userMatchesSearchTerm(userData, term, role))
        .filter((userData) => role === 'admin' || !isAdminLikeUser(userData))
        .slice(0, 6);
};

const buildCourseSearchResults = (term) => {
    return searchCache.courses
        .filter((courseData) => courseMatchesSearchTerm(courseData, term))
        .slice(0, 6);
};

const getProfileLinkForSearchResult = (userData, role) => {
    if (role === 'admin') {
        return `/admin/admin-profile.html?id=${userData.id}`;
    }

    if (role === 'teacher') {
        return `/teacher/mon-profil.html?id=${userData.id}`;
    }

    return `/student/mon-profil.html?id=${userData.id}`;
};

const getCourseLinkForSearchResult = (courseData, role) => {
    if (role === 'admin') {
        return `/admin/formations-cours.html?edit=${courseData.id}`;
    }

    if (role === 'teacher') {
        if (courseData.auteurId === activeSearchContext.currentUid) {
            return `/teacher/mes-cours.html?edit=${courseData.id}`;
        }

        return `/student/cours-viewer.html?id=${courseData.id}&preview=true`;
    }

    return `/student/cours-viewer.html?id=${courseData.id}`;
};

const getUserSearchSubText = (userData, role) => {
    if (role === 'admin') {
        return userData.email || '';
    }

    if (userData.role === 'teacher') {
        return 'Professeur';
    }

    return 'Élève';
};

const renderSearchResults = ({ container, term, users, courses, role }) => {
    let html = '';

    if (courses.length > 0) {
        html += `<div style="padding: 6px 15px; font-size: 0.75rem; color: var(--text-muted, #888); background: rgba(0,0,0,0.05); font-weight: bold;">COURS PÉDAGOGIQUES</div>`;

        courses.forEach((course) => {
            const link = getCourseLinkForSearchResult(course, role);

            html += `
                <div class="search-result-item" data-url="${link}">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="opacity: 0.6; min-width: 18px; flex-shrink: 0;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>
                    <div>
                        <div class="search-result-title">${escapeHTML(course.titre)}</div>
                    </div>
                </div>
            `;
        });
    }

    if (users.length > 0) {
        html += `<div style="padding: 6px 15px; font-size: 0.75rem; color: var(--text-muted, #888); background: rgba(0,0,0,0.05); font-weight: bold;">UTILISATEURS</div>`;

        users.forEach((userData) => {
            const profileLink = getProfileLinkForSearchResult(userData, role);
            const subText = getUserSearchSubText(userData, role);
            const displayName = `${userData.prenom || ''} ${userData.nom || ''}`.trim() || 'Utilisateur';

            html += `
                <div class="search-result-item" data-url="${profileLink}">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="opacity: 0.6; min-width: 18px; flex-shrink: 0;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    <div>
                        <div class="search-result-title">${escapeHTML(displayName)}</div>
                        <div class="search-result-sub">${escapeHTML(subText)}</div>
                    </div>
                </div>
            `;
        });
    }

    if (html === '') {
        html = `<div style="padding: 15px; color: var(--text-muted, #888); text-align: center; font-size: 0.85rem;">Aucun résultat pour "${escapeHTML(term)}"</div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
};

export function setupGlobalSearch({ currentUid, currentUserProfile } = {}) {
    activeSearchContext = {
        currentUid,
        currentUserProfile
    };

    const searchInputs = document.querySelectorAll('.global-search-input');

    searchInputs.forEach((input) => {
        if (input.dataset.searchAttached) return;

        input.dataset.searchAttached = 'true';

        const resultsContainer = input.nextElementSibling;

        if (!resultsContainer) return;

        input.addEventListener('focus', async () => {
            try {
                await ensureSearchDataCache();
            } catch (error) {
                console.error("[SBI Search] Préchargement impossible :", error);
            }
        });

        input.addEventListener('input', async (e) => {
            const term = e.target.value.toLowerCase().trim();

            if (term.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }

            resultsContainer.innerHTML = `<div style="padding: 15px; color: var(--text-muted, #888); text-align: center; font-size: 0.85rem;">Recherche...</div>`;
            resultsContainer.style.display = 'block';

            try {
                await ensureSearchDataCache();

                const role = getCurrentRole();
                const courses = buildCourseSearchResults(term);
                const users = buildUserSearchResults(term, role);

                renderSearchResults({
                    container: resultsContainer,
                    term,
                    users,
                    courses,
                    role
                });

            } catch (error) {
                console.error("[SBI Search] Recherche impossible :", error);

                resultsContainer.innerHTML = `
                    <div style="padding: 15px; color: var(--accent-red, #ff4a4a); text-align: center; font-size: 0.85rem;">
                        Recherche indisponible. Vérifie la console.
                    </div>
                `;
                resultsContainer.style.display = 'block';
            }
        });

        resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');

            if (item && item.dataset.url) {
                window.location.assign(item.dataset.url);
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    });
}

export function clearGlobalSearchCache() {
    searchCache = {
        key: null,
        ready: false,
        users: [],
        courses: []
    };
}
