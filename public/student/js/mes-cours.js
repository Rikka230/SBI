/**
 * =======================================================================
 * MES COURS - Bibliothèque étudiant SBI
 * =======================================================================
 *
 * 8.0P.167.138 : bibliothèque séparée entre planning de promotion et cours complémentaires.
 * Le viewer de cours reste en navigation classique.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { getUserLearningProgress } from '/js/course-engine.js';
import {
    courseBelongsToFormation as sharedCourseBelongsToFormation,
    fetchCoursesByIds,
    isCourseVisible,
    loadAssignedFormationsForUser,
    loadCoursesForUser,
    uniqById
} from '/js/learning-access.js';

let currentUid = null;
let userData = {};
let allCourses = [];
let assignedFormations = [];
let userProgress = { courses: {}, formations: {} };
let activeCleanup = null;
let currentOpenFormationId = '';
let currentOpenFormationTitle = '';

function resetState() {
    currentUid = null;
    userData = {};
    allCourses = [];
    assignedFormations = [];
    userProgress = { courses: {}, formations: {} };
}

export function mountStudentCourses() {
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

        currentUid = user.uid;

        try {
            await hydrateStudentCourses();
            bindStudentCoursesEvents(addCleanup);
            renderAssignedFormations();
            openRequestedFormationFromUrl();
        } catch (error) {
            console.error("Erreur d'initialisation :", error);
            showFormationsError();
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

async function hydrateStudentCourses() {
    await waitForSbiTopbar();
    await loadStudentProfile();
    await loadStudentProgress();
    updateTopBar();
    updateLevel();
    await loadAssignedFormations();
    await loadAssignedCourses();
}

async function refreshStudentLibrary() {
    const list = document.getElementById('formations-list');
    if (list) list.innerHTML = '<div class="student-library-loading">Actualisation de la bibliothèque…</div>';

    await hydrateStudentCourses();
    renderAssignedFormations();

    const visibleCourses = document.getElementById('view-courses');
    if (visibleCourses?.style.display === 'flex') {
        const title = document.getElementById('current-formation-title')?.dataset?.formationId;
        const formation = getFormationCardsToRender().find((item) => item.id === title);
        if (formation) window.openFormation(formation);
    }
}

function bindStudentCoursesEvents(addCleanup) {
    const backButton = document.getElementById('btn-back-formations');
    const searchInput = document.getElementById('search-course-input');
    const librarySearchInput = document.getElementById('student-library-search');
    const refreshButton = document.getElementById('student-library-refresh');

    if (backButton && backButton.dataset.sbiBound !== 'true') {
        backButton.dataset.sbiBound = 'true';

        const handler = () => {
            const viewCourses = document.getElementById('view-courses');
            const viewFormations = document.getElementById('view-formations');
            if (viewCourses) viewCourses.style.display = 'none';
            if (viewFormations) viewFormations.style.display = 'flex';
        };

        backButton.addEventListener('click', handler);
        addCleanup(() => backButton.removeEventListener('click', handler));
    }

    if (searchInput && searchInput.dataset.sbiBound !== 'true') {
        searchInput.dataset.sbiBound = 'true';

        const handler = () => filterVisibleCourseCards();
        searchInput.addEventListener('input', handler);
        addCleanup(() => searchInput.removeEventListener('input', handler));
    }

    if (librarySearchInput && librarySearchInput.dataset.sbiBound !== 'true') {
        librarySearchInput.dataset.sbiBound = 'true';

        const handler = () => renderAssignedFormations();
        librarySearchInput.addEventListener('input', handler);
        addCleanup(() => librarySearchInput.removeEventListener('input', handler));
    }

    if (refreshButton && refreshButton.dataset.sbiBound !== 'true') {
        refreshButton.dataset.sbiBound = 'true';

        const handler = () => refreshStudentLibrary().catch((error) => {
            console.error('[SBI Student Courses] Actualisation impossible :', error);
            showFormationsError();
        });
        refreshButton.addEventListener('click', handler);
        addCleanup(() => refreshButton.removeEventListener('click', handler));
    }
}

async function loadStudentProfile() {
    const snap = await getDoc(doc(db, "users", currentUid));
    userData = snap.exists() ? snap.data() : {};
}

async function loadStudentProgress() {
    userProgress = await getUserLearningProgress(currentUid);
    if (!userProgress.courses) userProgress.courses = {};
    if (!userProgress.formations) userProgress.formations = {};
}

function updateTopBar() {
    const name = userData.prenom || userData.nom || "Étudiant";

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) topUserName.textContent = name;

    const topUserAvatar = document.getElementById('top-user-avatar');

    if (topUserAvatar) {
        if (userData.photoURL) {
            topUserAvatar.innerHTML = `<img src="${escapeAttr(userData.photoURL)}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            topUserAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

function updateLevel() {
    const xp = userData.xp || 0;
    const level = Math.floor(xp / 100) + 1;

    const topUserLevel = document.getElementById('top-user-level');
    if (topUserLevel) topUserLevel.textContent = `Niveau ${level}`;
}

function isAdminPreview() {
    return userData.role === 'admin' || userData.isGod === true;
}


function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
}

function formatDate(value) {
    const ms = toMillis(value);
    if (!ms) return '';

    try {
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(new Date(ms));
    } catch {
        return '';
    }
}

function getPlanItemType(item = {}) {
    if (item.type) return String(item.type).trim();
    if (item.itemType) return String(item.itemType).trim();
    return item.courseId ? 'real_course' : '';
}

function isRealCoursePlanItem(item = {}) {
    return getPlanItemType(item) === 'real_course' && String(item.courseId || '').trim();
}

function getPriorityLabel(priority = 'normal') {
    const safePriority = String(priority || '').trim().toLowerCase();
    if (safePriority === 'urgent') return 'Priorité urgente';
    if (safePriority === 'high' || safePriority === 'haute') return 'Priorité haute';
    return 'Priorité normale';
}

function getPriorityTone(priority = 'normal') {
    const safePriority = String(priority || '').trim().toLowerCase();
    if (safePriority === 'urgent') return 'urgent';
    if (safePriority === 'high' || safePriority === 'haute') return 'high';
    return 'normal';
}

function getCoursePlanDatesLabel(plan = {}) {
    const start = formatDate(plan.recommendedStartAt || plan.plannedStartAt || plan.startAt);
    const end = formatDate(plan.recommendedEndAt || plan.plannedEndAt || plan.endAt);
    const deadline = formatDate(plan.deadlineAt || plan.dueAt);

    if (start && end && start !== end) return `${start} → ${end}`;
    if (start) return `Début ${start}`;
    if (deadline) return `Échéance ${deadline}`;
    return 'Dates à confirmer';
}

function getPromotionIdsForStudent() {
    return normalizeList([
        userData.promotionId,
        userData.currentPromotionId,
        userData.cohortId,
        ...(Array.isArray(userData.promotionIds) ? userData.promotionIds : [])
    ]);
}

function normalizePromotionPlanItem(item = {}, promotion = {}, index = 0) {
    return {
        ...item,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        promotionId: promotion.id || '',
        promotionName: promotion.name || promotion.promotionName || 'Promotion',
        formationId: promotion.formationId || item.displayContextFormationId || '',
        formationName: promotion.formationName || item.displayContextFormationName || '',
        startDate: promotion.startDate || '',
        endDate: promotion.endDate || ''
    };
}

function attachPromotionPlan(course = {}, plan = {}) {
    const existing = Array.isArray(course.__promotionPlans) ? course.__promotionPlans : [];
    return {
        ...course,
        __promotionLinked: true,
        __promotionPlan: plan,
        __promotionPlans: [...existing, plan]
    };
}

function ensurePromotionFormationCard(promotion = {}) {
    const formationId = String(promotion.formationId || '').trim();
    const formationName = String(promotion.formationName || promotion.name || 'Promotion').trim();
    if (!formationId && !formationName) return;

    const alreadyExists = assignedFormations.some((formation) => {
        return (formationId && String(formation.id || '') === formationId)
            || (formationName && String(formation.titre || formation.title || '') === formationName);
    });

    if (alreadyExists) return;

    assignedFormations.push({
        id: formationId || `promotion-${promotion.id || formationName}`,
        titre: formationName,
        __promotionLinked: true,
        promotionId: promotion.id || ''
    });
}

async function loadPromotionPlanCourses() {
    if (!currentUid || isAdminPreview()) return [];

    const promotionIds = getPromotionIdsForStudent();
    if (!promotionIds.length) return [];

    const loadedCourses = [];

    await Promise.all(promotionIds.map(async (promotionId) => {
        try {
            const promotionSnap = await getDoc(doc(db, 'promotions', promotionId));
            if (!promotionSnap.exists()) return;

            const promotion = { id: promotionSnap.id, ...promotionSnap.data() };
            if ((promotion.status || 'active') === 'archived') return;

            ensurePromotionFormationCard(promotion);

            const planItems = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
            const realItems = planItems
                .map((item, index) => normalizePromotionPlanItem(item, promotion, index))
                .filter(isRealCoursePlanItem);

            const courses = await fetchCoursesByIds(realItems.map((item) => item.courseId));
            const coursesById = new Map(courses.map((course) => [course.id, course]));

            realItems.forEach((item) => {
                const course = coursesById.get(item.courseId);
                if (!course || (!isCourseVisible(course, { allowProgress: true }) && course.actif !== true)) return;
                loadedCourses.push(attachPromotionPlan(course, item));
            });
        } catch (error) {
            console.warn('[SBI Student Courses] Planning de promotion ignoré :', promotionId, error);
        }
    }));

    return loadedCourses;
}

function courseBelongsToPromotionFormation(course = {}, formation = {}) {
    const plans = Array.isArray(course.__promotionPlans)
        ? course.__promotionPlans
        : course.__promotionPlan
            ? [course.__promotionPlan]
            : [];

    if (!plans.length) return false;

    const formationId = String(formation?.id || '').trim();
    const formationTitle = String(formation?.titre || formation?.title || '').trim();

    return plans.some((plan) => {
        const planFormationId = String(plan.formationId || plan.displayContextFormationId || '').trim();
        const planFormationName = String(plan.formationName || plan.displayContextFormationName || '').trim();
        return Boolean(
            (formationId && planFormationId && planFormationId === formationId)
            || (formationTitle && planFormationName && planFormationName === formationTitle)
            || (formation?.__promotionLinked && plan.promotionId && plan.promotionId === formation.promotionId)
        );
    });
}

async function loadAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (list) list.innerHTML = '<div class="student-library-loading">Chargement des formations…</div>';

    assignedFormations = await loadAssignedFormationsForUser({
        uid: currentUid,
        userData,
        role: isAdminPreview() ? 'admin' : 'student'
    });
}

async function loadAssignedCourses() {
    const coursesFromAccess = await loadCoursesForUser({
        uid: currentUid,
        userData,
        role: isAdminPreview() ? 'admin' : 'student',
        formations: assignedFormations,
        progress: userProgress,
        includeProgress: true,
        activeOnly: !isAdminPreview()
    });

    const coursesFromPromotionPlan = await loadPromotionPlanCourses();
    const coursesFromNotifications = await loadNotificationLinkedCourses();

    allCourses = uniqById([...coursesFromAccess, ...coursesFromNotifications, ...coursesFromPromotionPlan])
        .filter((course) => isAdminPreview() || isCourseVisible(course, { allowProgress: true }));
}

async function loadNotificationLinkedCourses() {
    if (!currentUid || isAdminPreview()) return [];

    const courseIds = new Set();

    async function collectFromQuery(queryRef, label) {
        try {
            const snap = await getDocs(queryRef);

            snap.forEach((docSnap) => {
                const notif = docSnap.data() || {};
                if (notif.status === 'resolved' || notif.resolvedAt) return;

                const courseId = String(notif.courseId || '').trim();
                if (courseId) courseIds.add(courseId);
            });
        } catch (error) {
            const code = String(error?.code || '').toLowerCase();
            const message = String(error?.message || '').toLowerCase();
            const isPermissionLimit = code.includes('permission-denied') || message.includes('permission');

            if (isPermissionLimit) {
                console.info(`[SBI Student Courses] Notifications ${label} non lisibles avec les règles Firestore actuelles. Récupération ignorée.`);
            } else {
                console.warn(`[SBI Student Courses] Notifications ${label} non utilisables pour récupérer les cours :`, error);
            }
        }
    }

    await Promise.all([
        collectFromQuery(
            query(collection(db, 'notifications'), where('destinataireId', '==', currentUid)),
            'directes'
        ),
        collectFromQuery(
            query(collection(db, 'notifications'), where('targetStudents', 'array-contains', currentUid)),
            'targetStudents'
        )
    ]);

    const courses = await fetchCoursesByIds(Array.from(courseIds));
    return courses.map((course) => ({ ...course, __notificationLinked: true }));
}

function renderAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (!list) return;

    const formationCards = getFilteredFormationCardsToRender();
    renderStudentLibrarySummary();

    if (formationCards.length === 0) {
        const hasSearch = getLibrarySearchTerm().length > 0;
        list.innerHTML = `
            <div class="student-library-empty">
                <strong>${hasSearch ? 'Aucun résultat dans votre bibliothèque.' : 'Aucune formation ne vous est assignée.'}</strong>
                <span>${hasSearch ? 'Essayez avec un autre mot-clé ou videz la recherche.' : 'Les formations apparaîtront ici dès leur attribution par l’équipe SBI.'}</span>
            </div>
        `;
        return;
    }

    list.innerHTML = formationCards.map((formation) => buildFormationCardHTML(formation)).join('');

    list.querySelectorAll('.formation-folder').forEach((folder) => {
        folder.addEventListener('click', () => {
            const formation = getFormationCardsToRender().find((item) => item.id === folder.dataset.formationId);
            window.openFormation(formation || {
                id: folder.dataset.formationId,
                titre: folder.dataset.formationTitle
            });
        });
    });
}

function getPrimaryCoursePlan(course = {}) {
    const plans = Array.isArray(course.__promotionPlans)
        ? course.__promotionPlans
        : course.__promotionPlan
            ? [course.__promotionPlan]
            : [];

    return [...plans].sort((a, b) => {
        const aDate = toMillis(a.recommendedStartAt || a.plannedStartAt || a.startAt || a.deadlineAt || a.dueAt);
        const bDate = toMillis(b.recommendedStartAt || b.plannedStartAt || b.startAt || b.deadlineAt || b.dueAt);
        if (aDate && bDate && aDate !== bDate) return aDate - bDate;
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return Number(a.order || 0) - Number(b.order || 0);
    })[0] || null;
}

function buildInlinePlanHint(course = {}) {
    const plan = getPrimaryCoursePlan(course);
    if (!plan) return '';
    return ` · ${escapeHTML(getCoursePlanDatesLabel(plan))}`;
}

function buildFormationCardHTML(formation) {
    const courses = getCoursesForFormation(formation);
    const totalCourses = courses.length;
    const completedCourses = getCompletedCoursesForFormation(formation);
    const progressPercent = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);
    const nextCourse = getNextCourseForFormation(formation);
    const title = formation.titre || 'Formation';
    const typeLabel = formation.__directCourses ? 'Cours directs' : 'Formation';

    return `
        <article class="formation-folder" data-formation-id="${escapeAttr(formation.id)}" data-formation-title="${escapeAttr(title)}">
            <div class="formation-folder__topline">
                <span class="formation-folder__type">${escapeHTML(typeLabel)}</span>
                <span class="formation-folder__count">${totalCourses} cours</span>
            </div>
            <div class="formation-folder__title-row">
                <div class="formation-folder__icon" aria-hidden="true">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                </div>
                <h3>${escapeHTML(title)}</h3>
            </div>
            <div class="formation-folder__meta">
                <span>${completedCourses}/${totalCourses} terminés</span>
                <span>${progressPercent}%</span>
            </div>
            <div class="progress-bar-bg" aria-hidden="true">
                <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="formation-folder__next">
                ${nextCourse ? `Prochain cours : <strong>${escapeHTML(nextCourse.titre || nextCourse.title || 'Cours')}</strong>${buildInlinePlanHint(nextCourse)}` : 'Aucun cours restant détecté.'}
            </div>
        </article>
    `;
}

function renderStudentLibrarySummary() {
    const root = document.getElementById('student-library-summary');
    if (!root) return;

    const totalFormations = getFormationCardsToRender().length;
    const totalCourses = allCourses.length;
    const completedCourses = allCourses.filter((course) => userProgress.courses[course.id]?.status === 'done').length;
    const progressPercent = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);

    root.innerHTML = `
        <div class="student-library-stat"><strong>${totalFormations}</strong><span>Parcours</span></div>
        <div class="student-library-stat"><strong>${totalCourses}</strong><span>Cours accessibles</span></div>
        <div class="student-library-stat"><strong>${completedCourses}</strong><span>Cours terminés</span></div>
        <div class="student-library-stat"><strong>${progressPercent}%</strong><span>Progression globale</span></div>
    `;
}

function getFormationCardsToRender() {
    const directCourses = getDirectAssignedCoursesWithoutVisibleFormation();
    const cards = [...assignedFormations];

    if (directCourses.length > 0) {
        cards.push({
            id: '__direct_assigned_courses',
            titre: 'Cours assignés',
            __directCourses: true
        });
    }

    return cards;
}

function getFilteredFormationCardsToRender() {
    const search = getLibrarySearchTerm();
    const cards = getFormationCardsToRender();
    if (!search) return cards;

    return cards.filter((formation) => {
        const courses = getCoursesForFormation(formation);
        const haystack = [
            formation.titre,
            formation.title,
            ...courses.flatMap((course) => [course.titre, course.title, course.bloc, course.blockTitle, course.blockName])
        ].map((value) => String(value || '').toLowerCase()).join(' ');

        return haystack.includes(search);
    });
}

function getLibrarySearchTerm() {
    return String(document.getElementById('student-library-search')?.value || '').trim().toLowerCase();
}

function getDirectAssignedCoursesWithoutVisibleFormation() {
    return allCourses.filter((course) => {
        const isDirectlyLinked = course.__targetedToUser === true
            || course.__notificationLinked === true
            || course.__progressLinked === true
            || (Array.isArray(course.targetStudents) && course.targetStudents.includes(currentUid));

        if (course.__promotionLinked === true) return false;

        if (!isDirectlyLinked) return false;

        const belongsToVisibleFormation = assignedFormations.some((formation) => {
            return sharedCourseBelongsToFormation(course, formation, assignedFormations);
        });

        return !belongsToVisibleFormation;
    });
}

function getCoursesForFormation(formation) {
    if (formation?.__directCourses === true) return getDirectAssignedCoursesWithoutVisibleFormation();
    return allCourses.filter((course) => {
        return sharedCourseBelongsToFormation(course, formation, assignedFormations)
            || courseBelongsToPromotionFormation(course, formation);
    });
}

function getCompletedCoursesForFormation(formation) {
    return getCoursesForFormation(formation).filter((course) => userProgress.courses[course.id]?.status === 'done').length;
}

function getNextCourseForFormation(formation) {
    return getCoursesForFormation(formation).find((course) => userProgress.courses[course.id]?.status !== 'done') || null;
}

window.openFormation = function(formationOrId, formationTitre = '') {
    const formation = typeof formationOrId === 'object'
        ? formationOrId
        : assignedFormations.find((item) => item.id === formationOrId) || {
            id: formationOrId,
            titre: formationTitre
        };

    const viewFormations = document.getElementById('view-formations');
    const viewCourses = document.getElementById('view-courses');
    const title = document.getElementById('current-formation-title');
    const searchInput = document.getElementById('search-course-input');
    const container = document.getElementById('courses-list');

    if (viewFormations) viewFormations.style.display = 'none';
    if (viewCourses) viewCourses.style.display = 'flex';
    currentOpenFormationId = formation.id || '';
    currentOpenFormationTitle = formation.titre || formation.title || 'Formation';
    if (title) {
        title.textContent = currentOpenFormationTitle;
        title.dataset.formationId = currentOpenFormationId;
    }
    if (searchInput) searchInput.value = '';
    if (!container) return;

    const coursesInFormation = getCoursesForFormation(formation);
    renderCourseViewSummary(formation, coursesInFormation);

    container.innerHTML = '';

    if (coursesInFormation.length === 0) {
        container.innerHTML = '<div class="student-library-empty"><strong>Aucun cours actif dans cette formation.</strong><span>Les contenus apparaîtront ici dès publication.</span></div>';
        return;
    }

    renderCourseSections(container, coursesInFormation);

    container.querySelectorAll('.course-item').forEach((item) => {
        item.addEventListener('click', () => {
            const href = item.dataset.href;
            if (href) window.location.href = href;
        });
    });
};


function openRequestedFormationFromUrl() {
    const params = new URL(window.location.href).searchParams;
    const formId = params.get('formId') || params.get('formationId') || '';
    if (!formId) return;

    const cards = getFormationCardsToRender();
    const target = cards.find((formation) => {
        return String(formation.id || '') === formId
            || String(formation.promotionId || '') === formId
            || String(formation.titre || formation.title || '') === formId;
    });

    if (target) window.openFormation(target);
}

function renderCourseSections(container, coursesInFormation = []) {
    const plannedCourses = sortCourses(coursesInFormation.filter((course) => getPrimaryCoursePlan(course)));
    const plannedIds = new Set(plannedCourses.map((course) => course.id));
    const complementaryCourses = coursesInFormation.filter((course) => !plannedIds.has(course.id));

    if (plannedCourses.length) {
        container.insertAdjacentHTML('beforeend', `
            <section class="student-course-section student-course-section--planned">
                <div class="student-course-section__head">
                    <div>
                        <strong>Parcours défini par la promotion</strong>
                        <span>Cours ordonnés selon le planning pédagogique.</span>
                    </div>
                    <em>${plannedCourses.length} cours</em>
                </div>
                <div class="student-course-bloc__list">${plannedCourses.map(buildCourseItemHTML).join('')}</div>
            </section>
        `);
    }

    if (complementaryCourses.length) {
        const coursesByBloc = groupCoursesByBloc(complementaryCourses);
        container.insertAdjacentHTML('beforeend', `
            <section class="student-course-section student-course-section--library">
                <div class="student-course-section__head">
                    <div>
                        <strong>Cours complémentaires de la formation</strong>
                        <span>Contenus accessibles hors planning daté.</span>
                    </div>
                    <em>${complementaryCourses.length} cours</em>
                </div>
            </section>
        `);

        Object.entries(coursesByBloc).forEach(([blocName, courses]) => {
            container.insertAdjacentHTML('beforeend', `<section class="student-course-bloc"><div class="bloc-title">${escapeHTML(blocName)}</div><div class="student-course-bloc__list">${courses.map(buildCourseItemHTML).join('')}</div></section>`);
        });
    }
}

function renderCourseViewSummary(formation, courses = []) {
    const root = document.getElementById('student-course-summary');
    if (!root) return;

    const totalCourses = courses.length;
    const completedCourses = courses.filter((course) => userProgress.courses[course.id]?.status === 'done').length;
    const inProgressCourses = courses.filter((course) => userProgress.courses[course.id]?.status === 'in_progress').length;
    const progressPercent = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);

    root.innerHTML = `
        <div class="student-course-stat"><strong>${totalCourses}</strong><span>Cours</span></div>
        <div class="student-course-stat"><strong>${completedCourses}</strong><span>Terminés</span></div>
        <div class="student-course-stat"><strong>${inProgressCourses}</strong><span>En cours</span></div>
        <div class="student-course-stat"><strong>${progressPercent}%</strong><span>Progression</span></div>
    `;
}

function filterVisibleCourseCards() {
    const term = String(document.getElementById('search-course-input')?.value || '').trim().toLowerCase();

    document.querySelectorAll('.course-item').forEach(item => {
        const haystack = [
            item.querySelector('.course-title')?.textContent,
            item.dataset.search
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        item.style.display = haystack.includes(term) ? 'flex' : 'none';
    });
}

function groupCoursesByBloc(courses) {
    const coursesByBloc = {};

    courses.forEach((course) => {
        const blocName = course.bloc || course.blockTitle || course.blockName || "Cours sans bloc";
        if (!coursesByBloc[blocName]) coursesByBloc[blocName] = [];
        coursesByBloc[blocName].push(course);
    });

    Object.keys(coursesByBloc).forEach((blocName) => {
        coursesByBloc[blocName].sort(sortCourses);
    });

    return coursesByBloc;
}

function buildCourseItemHTML(course) {
    const progressData = userProgress.courses[course.id] || { status: 'todo', completedChapters: [] };
    const totalChapters = Array.isArray(course.chapitres) ? course.chapitres.length : 0;
    const doneChapters = Array.isArray(progressData.completedChapters) ? progressData.completedChapters.length : 0;
    const progressPercent = totalChapters === 0 ? 0 : Math.round((doneChapters / totalChapters) * 100);
    const statusBadge = buildStatusBadge(progressData, doneChapters, totalChapters);
    const quizHtml = buildQuizScoreHTML(course, progressData);
    const title = course.titre || course.title || 'Cours';
    const bloc = course.bloc || course.blockTitle || course.blockName || 'Bloc non renseigné';
    const returnTo = `/student/mes-cours.html?formId=${encodeURIComponent(currentOpenFormationId || '')}`;
    const href = `/student/cours-viewer.html?id=${encodeURIComponent(course.id)}&returnTo=${encodeURIComponent(returnTo)}`;
    const plan = getPrimaryCoursePlan(course);
    const planLabel = plan ? getCoursePlanDatesLabel(plan) : '';
    const priorityLabel = plan ? getPriorityLabel(plan.priorityLevel) : '';
    const priorityTone = plan ? getPriorityTone(plan.priorityLevel) : 'normal';
    const planSource = plan?.sourceFormationName && plan.sourceFormationName !== currentOpenFormationTitle ? ` · source : ${plan.sourceFormationName}` : '';
    const planMetaHtml = plan
        ? `<div class="student-course-card__plan">
            <span>${escapeHTML(planLabel)}</span>
            <span class="student-course-priority student-course-priority--${escapeAttr(priorityTone)}">${escapeHTML(priorityLabel)}</span>
            ${planSource ? `<span>${escapeHTML(planSource.replace(/^ · /, ''))}</span>` : ''}
          </div>`
        : '';

    return `
        <article class="course-item student-course-card" data-href="${escapeAttr(href)}" data-sbi-no-pjax="true" data-search="${escapeAttr(`${title} ${bloc} ${planLabel} ${priorityLabel}`)}">
            <div class="student-course-card__main">
                <div class="student-course-card__icon" aria-hidden="true">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="student-course-card__content">
                    <div class="course-title student-course-card__title">${escapeHTML(title)}</div>
                    <div class="student-course-card__meta">
                        <span>${totalChapters} étape${totalChapters > 1 ? 's' : ''}</span>
                        <span>${escapeHTML(bloc)}</span>
                    </div>
                    ${planMetaHtml}
                    <div class="student-course-card__progress" aria-hidden="true"><span style="width:${progressPercent}%;"></span></div>
                </div>
            </div>
            <div class="student-course-card__side">
                ${quizHtml}
                ${statusBadge}
                <svg width="24" height="24" fill="var(--text-muted)" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
        </article>
    `;
}

function buildStatusBadge(progressData, doneChapters, totalChapters) {
    if (progressData.status === 'done') {
        return `<span class="student-course-badge student-course-badge--done">Terminé</span>`;
    }

    if (progressData.status === 'in_progress') {
        return `<span class="student-course-badge student-course-badge--progress">En cours (${doneChapters}/${totalChapters})</span>`;
    }

    return `<span class="student-course-badge student-course-badge--todo">À commencer</span>`;
}

function buildQuizScoreHTML(course, progressData) {
    const chapters = Array.isArray(course.chapitres) ? course.chapitres : [];
    const hasQuiz = chapters.some((chapter) => chapter.type === 'quiz');
    if (!hasQuiz || !progressData.quizScores) return '';

    let totalPossible = 0;
    let earnedScore = 0;

    chapters.forEach((chapter) => {
        if (chapter.type !== 'quiz') return;
        const questions = Array.isArray(chapter.questions) ? chapter.questions : [];
        questions.forEach((question) => { totalPossible += question.points || 1; });
        earnedScore += progressData.quizScores[chapter.id] || 0;
    });

    const starSvg = earnedScore === totalPossible && totalPossible > 0
        ? `<svg width="14" height="14" fill="var(--accent-blue)" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-left:4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
        : '';

    return `<span class="student-course-score">Score ${earnedScore}/${totalPossible} ${starSvg}</span>`;
}

function sortCourses(a, b) {
    const planA = getPrimaryCoursePlan(a);
    const planB = getPrimaryCoursePlan(b);

    if (planA || planB) {
        const orderA = Number.isFinite(Number(planA?.order)) ? Number(planA.order) : Number.POSITIVE_INFINITY;
        const orderB = Number.isFinite(Number(planB?.order)) ? Number(planB.order) : Number.POSITIVE_INFINITY;
        if (orderA !== orderB) return orderA - orderB;

        const dateA = toMillis(planA?.recommendedStartAt || planA?.plannedStartAt || planA?.startAt);
        const dateB = toMillis(planB?.recommendedStartAt || planB?.plannedStartAt || planB?.startAt);
        if (dateA && dateB && dateA !== dateB) return dateA - dateB;
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
    }

    const blocCompare = String(a.bloc || a.blockTitle || '').localeCompare(String(b.bloc || b.blockTitle || ''), 'fr', { sensitivity: 'base' });
    if (blocCompare !== 0) return blocCompare;
    return String(a.titre || a.title || '').localeCompare(String(b.titre || b.title || ''), 'fr', { sensitivity: 'base' });
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

function showFormationsError() {
    const list = document.getElementById('formations-list');
    if (list) {
        list.innerHTML = '<div class="student-library-empty student-library-empty--error"><strong>Erreur lors du chargement des formations.</strong><span>Réessayez dans quelques instants.</span></div>';
    }
}

window.SBI_STUDENT_COURSES_DEBUG = function() {
    const payload = {
        uid: currentUid,
        assignedFormations: assignedFormations.map((formation) => ({ id: formation.id, titre: formation.titre })),
        courses: allCourses.map((course) => ({
            id: course.id,
            titre: course.titre || course.title,
            bloc: course.bloc || course.blockTitle,
            progress: userProgress.courses?.[course.id] || null
        })),
        progress: userProgress
    };

    console.table(payload.courses);
    return payload;
};

function autoMountStudentCourses() {
    if (window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES) return;
    if (!document.getElementById('formations-list')) return;
    mountStudentCourses();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountStudentCourses, { once: true });
} else {
    autoMountStudentCourses();
}
