/**
 * =======================================================================
 * MES COURS - Bibliothèque étudiant SBI
 * =======================================================================
 *
 * 8.0P.167.201 : ordre Programme + blocs cours futurs affichés comme "Prochainement".
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
let currentCourseViewMode = 'program';
let currentHideCompletedCourses = false;
let loadedStudentPromotions = [];

function resetState() {
    currentUid = null;
    userData = {};
    allCourses = [];
    assignedFormations = [];
    userProgress = { courses: {}, formations: {} };
    currentOpenFormationId = '';
    currentOpenFormationTitle = '';
    currentCourseViewMode = 'program';
    currentHideCompletedCourses = false;
    loadedStudentPromotions = [];
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
        const formation = getFormationCardsToRender().find((item) => item.id === title || item.promotionId === title || item.__courseProgramFormationId === title);
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

function getPlanCourseId(item = {}) {
    return String(
        item.courseId
        || item.courseID
        || item.courseDocId
        || item.courseRef
        || item.id
        || ''
    ).trim();
}

function isRealCoursePlanItem(item = {}) {
    // Le coursePlan est l'autorité du programme. On conserve tous les items
    // qui pointent vers un cours, même si leur type legacy n'est pas
    // exactement "real_course". Les périodes sans courseId restent exclues.
    if (isFutureCoursePlanItem(item)) return false;
    return Boolean(getPlanCourseId(item));
}

function isFutureCoursePlanItem(item = {}) {
    const type = String(item.originalType || getPlanItemType(item) || '').trim();
    return type === 'placeholder_course';
}

function getPlanItemStableId(item = {}) {
    return String(
        item.itemId
        || item.placeholderId
        || item.id
        || item.originalOrder
        || item.order
        || 'future'
    ).trim();
}

function buildSyntheticCourseId(prefix = 'plan', ...parts) {
    return [prefix, ...parts]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('_')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 180) || `${prefix}_future`;
}

function getPriorityLabel(priority = '') {
    const safePriority = String(priority || '').trim().toLowerCase();
    if (safePriority === 'urgent') return 'Priorité urgente';
    if (safePriority === 'high' || safePriority === 'haute') return 'Priorité haute';
    return '';
}

function getPriorityTone(priority = '') {
    const safePriority = String(priority || '').trim().toLowerCase();
    if (safePriority === 'urgent') return 'urgent';
    if (safePriority === 'high' || safePriority === 'haute') return 'high';
    return '';
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
        courseId: getPlanCourseId(item),
        originalType: getPlanItemType(item),
        originalOrder: item.order,
        order: index,
        coursePlanOrder: index,
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

function buildPlanOnlyCourse(item = {}) {
    const title = item.courseTitle || item.title || item.label || 'Cours prévu';
    const bloc = item.blockTitle || item.bloc || item.moduleTitle || item.moduleName || 'Programme';
    return {
        id: getPlanCourseId(item),
        titre: title,
        title,
        bloc,
        blockTitle: bloc,
        chapitres: [],
        actif: true,
        statutValidation: 'planned',
        __planOnly: true,
        __planOnlyReason: 'course-document-not-hydrated'
    };
}

function buildFuturePlanBlock(item = {}) {
    const plannedTitle = item.courseTitle || item.title || item.label || 'Cours à venir';
    const bloc = item.blockTitle || item.bloc || item.moduleTitle || item.moduleName || 'Programme';
    return {
        id: buildSyntheticCourseId('future-course', item.promotionId, getPlanItemStableId(item)),
        titre: 'Bloc prochainement',
        title: 'Bloc prochainement',
        bloc,
        blockTitle: bloc,
        chapitres: [],
        actif: false,
        statutValidation: 'coming_soon',
        __planOnly: true,
        __futureCourseBlock: true,
        __notOpenable: true,
        __futureCourseTitle: plannedTitle,
        __planOnlyReason: 'placeholder_course'
    };
}

function ensurePromotionFormationCard(promotion = {}) {
    const promotionId = String(promotion.id || '').trim();
    if (!promotionId) return;

    const formationId = String(promotion.formationId || '').trim();
    const formationName = String(promotion.formationName || promotion.name || promotion.promotionName || 'Parcours de promotion').trim();

    const alreadyExists = assignedFormations.some((formation) => {
        return formation.__promotionLinked === true && String(formation.promotionId || '') === promotionId;
    });

    if (alreadyExists) return;

    assignedFormations.push({
        id: promotionId,
        titre: formationName,
        title: formationName,
        __promotionLinked: true,
        __courseProgramFormationId: formationId,
        promotionId,
        promotionName: promotion.name || promotion.promotionName || formationName,
        startDate: promotion.startDate || '',
        endDate: promotion.endDate || ''
    });
}

async function loadPromotionPlanCourses() {
    loadedStudentPromotions = [];
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

            loadedStudentPromotions.push(promotion);
            ensurePromotionFormationCard(promotion);

            const planItems = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
            const normalizedItems = planItems
                .map((item, index) => normalizePromotionPlanItem(item, promotion, index))
                .sort(compareCoursePlansLikeQa);
            const realItems = normalizedItems.filter(isRealCoursePlanItem);
            const futureItems = normalizedItems.filter(isFutureCoursePlanItem);

            const courses = await fetchCoursesByIds(realItems.map((item) => item.courseId));
            const coursesById = new Map(courses.map((course) => [course.id, course]));

            realItems.forEach((item) => {
                const course = coursesById.get(item.courseId);

                if (course) {
                    // Le planning de promotion est l'autorité pédagogique : si un cours
                    // est placé dans le cursus d'une promotion assignée, il doit rester
                    // ouvrable par l'élève même s'il vient d'une autre formation source.
                    loadedCourses.push(attachPromotionPlan(course, item));
                    return;
                }

                // Filet de sécurité : on garde une ligne de programme uniquement si le
                // document du cours n'est pas lisible. Après déploiement des règles,
                // les cours transversaux du cursus doivent normalement s'ouvrir.
                loadedCourses.push(attachPromotionPlan(buildPlanOnlyCourse(item), item));
            });

            futureItems.forEach((item) => {
                loadedCourses.push(attachPromotionPlan(buildFuturePlanBlock(item), item));
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
        .filter(Boolean)
        .filter((course) => course && course.id)
        .filter((course) => course.__planOnly === true || course.__promotionLinked === true || isAdminPreview() || isCourseVisible(course, { allowProgress: true }));
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

function getCoursePlanSortOrder(plan = {}) {
    const candidates = [
        plan.coursePlanOrder,
        plan.coursePlanIndex,
        plan.programOrder,
        plan.curriculumOrder,
        plan.displayOrder,
        plan.order,
        plan.position,
        plan.index
    ];

    for (const value of candidates) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }

    return Number.POSITIVE_INFINITY;
}

function getPlanStartSortValue(plan = {}) {
    const ms = toMillis(plan.recommendedStartAt || plan.plannedStartAt || plan.startAt || plan.startDate);
    return ms || Number.POSITIVE_INFINITY;
}

function getPlanEndSortValue(plan = {}) {
    const ms = toMillis(plan.recommendedEndAt || plan.plannedEndAt || plan.endAt || plan.endDate || plan.deadlineAt || plan.dueAt);
    return ms || Number.POSITIVE_INFINITY;
}

function compareCoursePlansLikeQa(planA = {}, planB = {}) {
    const startA = getPlanStartSortValue(planA);
    const startB = getPlanStartSortValue(planB);
    if (startA !== startB) return startA - startB;

    const orderA = getCoursePlanSortOrder(planA);
    const orderB = getCoursePlanSortOrder(planB);
    if (orderA !== orderB) return orderA - orderB;

    const endA = getPlanEndSortValue(planA);
    const endB = getPlanEndSortValue(planB);
    if (endA !== endB) return endA - endB;

    return String(planA.courseId || '').localeCompare(String(planB.courseId || ''), 'fr', { sensitivity: 'base' });
}

function planMatchesCurrentContext(plan = {}) {
    const activePromotionId = String(currentOpenFormationId || '').trim();
    return Boolean(activePromotionId && String(plan.promotionId || '').trim() === activePromotionId);
}

function getPrimaryCoursePlan(course = {}) {
    const plans = Array.isArray(course.__promotionPlans)
        ? course.__promotionPlans
        : course.__promotionPlan
            ? [course.__promotionPlan]
            : [];

    return [...plans].sort((a, b) => {
        const contextA = planMatchesCurrentContext(a) ? 0 : 1;
        const contextB = planMatchesCurrentContext(b) ? 0 : 1;
        if (contextA !== contextB) return contextA - contextB;

        return compareCoursePlansLikeQa(a, b);
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
    const typeLabel = formation.__directCourses ? 'Cours directs' : (formation.__promotionLinked ? 'Cursus' : 'Formation');

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
    const promotionCards = assignedFormations.filter((formation) => formation.__promotionLinked === true);
    const usablePromotionCards = promotionCards.filter((formation) => getCoursesForFormation(formation).length > 0);

    const sourceFormationIds = new Set(usablePromotionCards.map((formation) => String(formation.__courseProgramFormationId || '').trim()).filter(Boolean));

    const baseCards = usablePromotionCards.length
        ? usablePromotionCards
        : assignedFormations.filter((formation) => {
            if (formation.__promotionLinked === true) return getCoursesForFormation(formation).length > 0;
            const id = String(formation.id || '').trim();
            return !sourceFormationIds.has(id);
        });

    const cards = [...baseCards];

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
        if (!course || !course.id) return false;
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

    if (formation?.__promotionLinked === true) {
        const promotionId = String(formation.promotionId || formation.id || '').trim();
        const sourceFormation = {
            id: String(formation.__courseProgramFormationId || '').trim(),
            titre: formation.titre || formation.title || ''
        };

        const plannedCourses = allCourses.filter((course) => {
            if (!course || !course.id) return false;
            const plans = Array.isArray(course.__promotionPlans)
                ? course.__promotionPlans
                : course.__promotionPlan
                    ? [course.__promotionPlan]
                    : [];
            return plans.some((plan) => String(plan.promotionId || '').trim() === promotionId);
        });

        const plannedIds = new Set(plannedCourses.map((course) => course.id));
        const libraryCourses = allCourses.filter((course) => {
            if (!course || !course.id || plannedIds.has(course.id)) return false;
            if (course.__promotionLinked === true) return false;
            return sharedCourseBelongsToFormation(course, sourceFormation, assignedFormations)
                || courseBelongsToPromotionFormation(course, sourceFormation);
        });

        let courses = uniqById([...plannedCourses, ...libraryCourses]);

        if (!courses.length && loadedStudentPromotions.length === 1) {
            courses = allCourses.filter((course) => course && course.id && getPrimaryCoursePlan(course));
        }

        return courses;
    }

    return allCourses.filter((course) => {
        if (!course || !course.id) return false;
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
    const { plannedCourses, complementaryCourses } = splitCoursesForFormationView(coursesInFormation);
    const requestedMode = getRequestedCourseViewMode();
    currentCourseViewMode = resolveCourseViewMode(requestedMode, plannedCourses, complementaryCourses);
    syncStudentCourseViewUrl(formation, currentCourseViewMode);
    renderCourseViewSummary(formation, getCoursesForCurrentMode(plannedCourses, complementaryCourses));

    container.innerHTML = '';

    if (coursesInFormation.length === 0) {
        container.innerHTML = '<div class="student-library-empty"><strong>Aucun cours actif dans cette formation.</strong><span>Les contenus apparaîtront ici dès publication.</span></div>';
        return;
    }

    renderCourseSections(container, coursesInFormation);
};


function openRequestedFormationFromUrl() {
    const params = new URL(window.location.href).searchParams;
    const formId = params.get('formId') || params.get('formationId') || '';
    if (!formId) return;

    const cards = getFormationCardsToRender();
    const target = cards.find((formation) => {
        return String(formation.id || '') === formId
            || String(formation.promotionId || '') === formId
            || String(formation.__courseProgramFormationId || '') === formId
            || String(formation.titre || formation.title || '') === formId;
    });

    if (target) window.openFormation(target);
}


function isCourseCompleted(course = {}) {
    return userProgress.courses?.[course.id]?.status === 'done';
}

function filterCompletedCoursesForDisplay(courses = []) {
    const safeCourses = Array.isArray(courses) ? courses.filter((course) => course && course.id) : [];
    if (!currentHideCompletedCourses) return safeCourses;
    return safeCourses.filter((course) => !isCourseCompleted(course));
}

function renderCourseSections(container, coursesInFormation = []) {
    ensureStudentCourseSwitchStyles();

    coursesInFormation = Array.isArray(coursesInFormation) ? coursesInFormation.filter((course) => course && course.id) : [];
    const { plannedCourses, complementaryCourses } = splitCoursesForFormationView(coursesInFormation);
    const visiblePlannedCourses = filterCompletedCoursesForDisplay(plannedCourses);
    const visibleComplementaryCourses = filterCompletedCoursesForDisplay(complementaryCourses);
    currentCourseViewMode = resolveCourseViewMode(currentCourseViewMode, visiblePlannedCourses, visibleComplementaryCourses);
    const hiddenCompletedCount = currentHideCompletedCourses
        ? coursesInFormation.filter((course) => course && course.id && isCourseCompleted(course)).length
        : 0;

    container.innerHTML = `
        <div class="student-course-switch" role="tablist" aria-label="Choisir le type de liste">
            <button type="button" class="student-course-switch__btn" data-course-view="program">Programme</button>
            <button type="button" class="student-course-switch__btn" data-course-view="library">Liste bibliothèque</button>
            <button type="button" class="student-course-switch__btn student-course-switch__btn--toggle${currentHideCompletedCourses ? ' is-active' : ''}" data-hide-completed aria-pressed="${currentHideCompletedCourses ? 'true' : 'false'}">
                ${currentHideCompletedCourses ? `Terminés masqués${hiddenCompletedCount ? ` (${hiddenCompletedCount})` : ''}` : 'Masquer terminés'}
            </button>
        </div>
        <div class="student-course-view" data-course-view-panel="program"></div>
        <div class="student-course-view" data-course-view-panel="library"></div>
    `;

    const programPanel = container.querySelector('[data-course-view-panel="program"]');
    const libraryPanel = container.querySelector('[data-course-view-panel="library"]');

    if (programPanel) {
        programPanel.innerHTML = visiblePlannedCourses.length
            ? `<section class="student-course-section student-course-section--planned">
                <div class="student-course-section__head">
                    <div>
                        <strong>Parcours défini par la promotion</strong>
                        <span>Cours ordonnés selon le planning pédagogique.</span>
                    </div>
                    <em>${visiblePlannedCourses.length}${currentHideCompletedCourses && visiblePlannedCourses.length !== plannedCourses.length ? ` / ${plannedCourses.length}` : ''} cours</em>
                </div>
                <div class="student-course-bloc__list">${visiblePlannedCourses.map(buildCourseItemHTML).join('')}</div>
            </section>`
            : `<div class="student-library-empty"><strong>${currentHideCompletedCourses && plannedCourses.length ? 'Tous les cours du programme sont terminés.' : 'Aucun cours dans le programme.'}</strong><span>${currentHideCompletedCourses && plannedCourses.length ? 'Désactivez “Terminés masqués” pour les revoir.' : 'Le planning de promotion ne contient pas encore de cours publié.'}</span></div>`;
    }

    if (libraryPanel) {
        const rawLibraryCourses = complementaryCourses.length ? complementaryCourses : plannedCourses;
        const libraryCourses = complementaryCourses.length ? visibleComplementaryCourses : visiblePlannedCourses;
        if (libraryCourses.length) {
            const coursesByBloc = groupCoursesByBloc(libraryCourses);
            const libraryLabel = complementaryCourses.length
                ? 'Contenus complémentaires de la formation, hors planning daté.'
                : 'Vue liste des cours accessibles dans ce programme.';
            libraryPanel.innerHTML = `
                <section class="student-course-section student-course-section--library">
                    <div class="student-course-section__head">
                        <div>
                            <strong>Liste bibliothèque</strong>
                            <span>${escapeHTML(libraryLabel)}</span>
                        </div>
                        <em>${libraryCourses.length}${currentHideCompletedCourses && libraryCourses.length !== rawLibraryCourses.length ? ` / ${rawLibraryCourses.length}` : ''} cours</em>
                    </div>
                </section>
                ${Object.entries(coursesByBloc).map(([blocName, courses]) => `<section class="student-course-bloc"><div class="bloc-title">${escapeHTML(blocName)}</div><div class="student-course-bloc__list">${courses.map(buildCourseItemHTML).join('')}</div></section>`).join('')}
            `;
        } else {
            libraryPanel.innerHTML = `<div class="student-library-empty"><strong>${currentHideCompletedCourses && rawLibraryCourses.length ? 'Tous les cours de cette liste sont terminés.' : 'Aucun cours disponible.'}</strong><span>${currentHideCompletedCourses && rawLibraryCourses.length ? 'Désactivez “Terminés masqués” pour les revoir.' : 'La formation n’a pas encore de contenu publié.'}</span></div>`;
        }
    }

    bindCourseViewSwitch(container, plannedCourses, complementaryCourses, coursesInFormation);
    applyCourseViewMode(container, currentCourseViewMode, plannedCourses, complementaryCourses);
    bindCourseCardNavigation(container);
}
function splitCoursesForFormationView(coursesInFormation = []) {
    const safeCourses = Array.isArray(coursesInFormation) ? coursesInFormation.filter((course) => course && course.id) : [];
    const plannedCourses = safeCourses.filter((course) => getPrimaryCoursePlan(course)).sort(sortCourses);
    const plannedIds = new Set(plannedCourses.map((course) => course.id));
    const complementaryCourses = safeCourses.filter((course) => !plannedIds.has(course.id));
    return { plannedCourses, complementaryCourses };
}

function getRequestedCourseViewMode() {
    try {
        const mode = new URL(window.location.href).searchParams.get('view');
        return mode === 'library' ? 'library' : mode === 'program' ? 'program' : '';
    } catch {
        return '';
    }
}

function resolveCourseViewMode(requestedMode, plannedCourses = [], complementaryCourses = []) {
    if (requestedMode === 'library') return 'library';
    if (requestedMode === 'program') return 'program';
    if (plannedCourses.length) return 'program';
    if (complementaryCourses.length) return 'library';
    return 'program';
}

function getCoursesForCurrentMode(plannedCourses = [], complementaryCourses = []) {
    const courses = currentCourseViewMode !== 'library'
        ? plannedCourses
        : complementaryCourses.length ? complementaryCourses : plannedCourses;
    return filterCompletedCoursesForDisplay(courses);
}

function getActivePromotionIdForCurrentFormation(courses = []) {
    const safeCourses = Array.isArray(courses) ? courses.filter(Boolean) : [];
    const plan = safeCourses.map(getPrimaryCoursePlan).find(Boolean);
    return String(plan?.promotionId || '').trim();
}

function syncStudentCourseViewUrl(formation = {}, mode = currentCourseViewMode) {
    try {
        if (!window.location.pathname.endsWith('/student/mes-cours.html')) return;
        const params = new URLSearchParams();
        const formId = String(formation.id || currentOpenFormationId || '').trim();
        if (formId) params.set('formId', formId);
        params.set('view', mode === 'library' ? 'library' : 'program');
        const promotionId = String(formation.promotionId || '').trim();
        if (promotionId) params.set('promotionId', promotionId);
        const nextUrl = `/student/mes-cours.html?${params.toString()}`;
        window.history.replaceState({ sbiStudentCourseView: mode, formId }, '', nextUrl);
        window.SBI_APP_SHELL_CURRENT_URL = window.location.href;
    } catch {}
}

function applyCourseViewMode(container, mode, plannedCourses = [], complementaryCourses = []) {
    currentCourseViewMode = resolveCourseViewMode(mode, plannedCourses, complementaryCourses);
    const activeCourses = getCoursesForCurrentMode(plannedCourses, complementaryCourses);
    const formation = getFormationCardsToRender().find((item) => item.id === currentOpenFormationId) || { id: currentOpenFormationId, titre: currentOpenFormationTitle };

    container.querySelectorAll('[data-course-view-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.courseViewPanel !== currentCourseViewMode;
    });
    container.querySelectorAll('[data-course-view]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.courseView === currentCourseViewMode);
    });

    renderCourseViewSummary(formation, activeCourses);
    syncStudentCourseViewUrl(formation, currentCourseViewMode);
    filterVisibleCourseCards();
}

function bindCourseViewSwitch(container, plannedCourses = [], complementaryCourses = [], coursesInFormation = []) {
    container.querySelectorAll('[data-course-view]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            applyCourseViewMode(container, button.dataset.courseView, plannedCourses, complementaryCourses);
        });
    });

    const hideCompletedButton = container.querySelector('[data-hide-completed]');
    if (hideCompletedButton) {
        hideCompletedButton.addEventListener('click', () => {
            currentHideCompletedCourses = !currentHideCompletedCourses;
            renderCourseSections(container, coursesInFormation);
        });
    }
}
function bindCourseCardNavigation(container) {
    container.querySelectorAll('.course-item').forEach((item) => {
        item.addEventListener('click', () => {
            const href = item.dataset.href;
            if (href) window.location.href = href;
        });
    });
}

function ensureStudentCourseSwitchStyles() {
    if (document.getElementById('student-course-switch-style-8-0p-167-156')) return;
    const style = document.createElement('style');
    style.id = 'student-course-switch-style-8-0p-167-156';
    style.textContent = `
        .student-course-switch {
            display: flex;
            flex-wrap: wrap;
            gap: 0.55rem;
            margin: 0 0 1rem;
            padding: 0.45rem;
            border: 1px solid var(--border-color, rgba(255,255,255,0.12));
            border-radius: 16px;
            background: rgba(255,255,255,0.045);
        }
        .student-course-switch__btn {
            min-height: 40px;
            border: 1px solid transparent;
            border-radius: 12px;
            padding: 0.65rem 1rem;
            background: transparent;
            color: var(--text-muted);
            font-weight: 900;
            cursor: pointer;
        }
        .student-course-switch__btn.is-active {
            background: rgba(42,87,255,0.14);
            color: var(--accent-blue, #2A57FF);
            border-color: rgba(42,87,255,0.28);
        }
        .student-course-switch__btn:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
        .student-course-switch__btn--toggle {
            margin-left: auto;
            border-color: rgba(42,87,255,0.18);
        }
        .student-course-switch__btn--toggle.is-active {
            background: rgba(42,87,255,0.14);
            color: var(--accent-blue, #2A57FF);
            border-color: rgba(42,87,255,0.32);
        }
        .student-course-badge--late {
            background: rgba(239,68,68,0.1);
            color: #dc2626;
        }
        .student-course-badge--future {
            background: rgba(42,87,255,0.1);
            color: var(--accent-blue, #2A57FF);
        }
        .student-course-badge--soon {
            background: rgba(245,158,11,0.12);
            color: #b45309;
        }
        .student-course-card.is-plan-only {
            opacity: 0.92;
        }
        .student-course-card.is-future-placeholder {
            cursor: default;
            border-color: rgba(245,158,11,0.24);
            background: rgba(245,158,11,0.055);
        }
        .student-course-card.is-future-placeholder .student-course-card__icon {
            background: rgba(245,158,11,0.12);
            color: #b45309;
        }
        .student-course-view[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
}

function renderCourseViewSummary(formation, courses = []) {
    const root = document.getElementById('student-course-summary');
    if (!root) return;

    courses = Array.isArray(courses) ? courses.filter((course) => course && course.id) : [];
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

    courses.filter((course) => course && course.id).forEach((course) => {
        const blocName = course.bloc || course.blockTitle || course.blockName || "Cours sans bloc";
        if (!coursesByBloc[blocName]) coursesByBloc[blocName] = [];
        coursesByBloc[blocName].push(course);
    });

    Object.keys(coursesByBloc).forEach((blocName) => {
        coursesByBloc[blocName].sort(sortCourses);
    });

    return coursesByBloc;
}

function buildCourseReturnUrl(course = {}) {
    const params = new URLSearchParams();
    if (currentOpenFormationId) params.set('formId', currentOpenFormationId);
    params.set('view', currentCourseViewMode === 'library' ? 'library' : 'program');
    const plan = getPrimaryCoursePlan(course);
    const promotionId = String(plan?.promotionId || '').trim();
    if (promotionId) params.set('promotionId', promotionId);
    return `/student/mes-cours.html${params.toString() ? `?${params.toString()}` : ''}`;
}

function buildCourseItemHTML(course) {
    if (!course || !course.id) return '';
    const progressData = userProgress.courses[course.id] || { status: 'todo', completedChapters: [] };
    const plan = getPrimaryCoursePlan(course);
    const isFutureBlock = course.__futureCourseBlock === true || plan?.originalType === 'placeholder_course';
    const totalChapters = isFutureBlock ? 0 : (Array.isArray(course.chapitres) ? course.chapitres.length : 0);
    const doneChapters = Array.isArray(progressData.completedChapters) ? progressData.completedChapters.length : 0;
    const progressPercent = totalChapters === 0 ? 0 : Math.round((doneChapters / totalChapters) * 100);
    const statusBadge = isFutureBlock
        ? '<span class="student-course-badge student-course-badge--soon">Prochainement</span>'
        : buildStatusBadge(progressData, doneChapters, totalChapters, plan);
    const quizHtml = buildQuizScoreHTML(course, progressData);
    const title = isFutureBlock ? 'Bloc prochainement' : (course.titre || course.title || 'Cours');
    const futureTitle = course.__futureCourseTitle || plan?.courseTitle || plan?.title || 'Cours à venir';
    const bloc = course.bloc || course.blockTitle || course.blockName || 'Bloc non renseigné';
    const isPlanOnly = course.__planOnly === true;
    const returnTo = buildCourseReturnUrl(course);
    const promotionId = String(plan?.promotionId || '').trim();
    const promotionQuery = promotionId ? `&promotionId=${encodeURIComponent(promotionId)}` : '';
    const href = isFutureBlock ? '' : `/student/cours-viewer.html?id=${encodeURIComponent(course.id)}${promotionQuery}&returnTo=${encodeURIComponent(returnTo)}`;
    const planLabel = plan ? getCoursePlanDatesLabel(plan) : '';
    const priorityLabel = plan ? getPriorityLabel(plan.priorityLevel) : '';
    const priorityTone = plan ? getPriorityTone(plan.priorityLevel) : '';
    const priorityHtml = priorityLabel
        ? `<span class="student-course-priority student-course-priority--${escapeAttr(priorityTone)}">${escapeHTML(priorityLabel)}</span>`
        : '';
    const planMetaHtml = plan
        ? `<div class="student-course-card__plan">
            <span>${escapeHTML(isFutureBlock ? `Dates estimées : ${planLabel}` : planLabel)}</span>
            ${priorityHtml}
          </div>`
        : '';

    return `
        <article class="course-item student-course-card${isPlanOnly ? ' is-plan-only' : ''}${isFutureBlock ? ' is-future-placeholder' : ''}" ${href ? `data-href="${escapeAttr(href)}" data-sbi-no-pjax="true"` : 'aria-disabled="true"'} data-search="${escapeAttr(`${title} ${futureTitle} ${bloc} ${planLabel} ${priorityLabel}`)}">
            <div class="student-course-card__main">
                <div class="student-course-card__icon" aria-hidden="true">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="student-course-card__content">
                    <div class="course-title student-course-card__title">${escapeHTML(title)}</div>
                    <div class="student-course-card__meta">
                        <span>${escapeHTML(isFutureBlock ? futureTitle : `${totalChapters} étape${totalChapters > 1 ? 's' : ''}`)}</span>
                        <span>${escapeHTML(bloc)}</span>
                    </div>
                    ${planMetaHtml}
                    <div class="student-course-card__progress" aria-hidden="true"><span style="width:${progressPercent}%;"></span></div>
                </div>
            </div>
            <div class="student-course-card__side">
                ${isFutureBlock ? '' : isPlanOnly ? '<span class="student-course-badge student-course-badge--todo">Ouvrir</span>' : quizHtml}
                ${isFutureBlock || !isPlanOnly ? statusBadge : ''}
                ${isFutureBlock ? '' : '<svg width="24" height="24" fill="var(--text-muted)" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'}
            </div>
        </article>
    `;
}

function getScheduleStatus(plan = {}) {
    if (!plan) return '';

    const now = Date.now();
    const start = toMillis(plan.recommendedStartAt || plan.plannedStartAt || plan.startAt);
    const end = toMillis(plan.deadlineAt || plan.dueAt || plan.recommendedEndAt || plan.plannedEndAt || plan.endAt);

    if (start && now < start) return 'future';
    if (end && now > end) return 'late';
    if (start && now >= start) return 'active';
    return '';
}

function buildStatusBadge(progressData, doneChapters, totalChapters, plan = null) {
    if (progressData.status === 'done') {
        return `<span class="student-course-badge student-course-badge--done">Terminé</span>`;
    }

    const scheduleStatus = getScheduleStatus(plan);

    if (scheduleStatus === 'late') {
        return `<span class="student-course-badge student-course-badge--late">En retard</span>`;
    }

    if (scheduleStatus === 'future') {
        return `<span class="student-course-badge student-course-badge--future">À venir</span>`;
    }

    if (progressData.status === 'in_progress' || scheduleStatus === 'active') {
        return `<span class="student-course-badge student-course-badge--progress">En cours (${doneChapters}/${totalChapters})</span>`;
    }

    return `<span class="student-course-badge student-course-badge--todo">À commencer</span>`;
}

function getCourseChapterMaxScore(chapter = {}) {
    const explicitScore = Number(chapter.maxScore ?? chapter.score);
    if (Number.isFinite(explicitScore) && explicitScore > 0) return explicitScore;

    const type = chapter.type || chapter.activityType;
    if (type === 'checkpoint') {
        const checkpointScore = Number(chapter.checkpointScore ?? chapter.xpReward ?? 10);
        return Number.isFinite(checkpointScore) && checkpointScore > 0 ? checkpointScore : 10;
    }

    if (type === 'quiz') {
        return (Array.isArray(chapter.questions) ? chapter.questions : []).reduce((sum, question) => {
            const points = Number(question?.points);
            return sum + (Number.isFinite(points) && points > 0 ? points : 1);
        }, 0);
    }

    if (type === 'fill_blank' || chapter.activityType === 'fill_blank') {
        return (Array.isArray(chapter.blanks) ? chapter.blanks : []).reduce((sum, blank) => {
            const points = Number(blank?.points);
            return sum + (Number.isFinite(points) && points > 0 ? points : 1);
        }, 0);
    }

    return 0;
}

function buildQuizScoreHTML(course, progressData) {
    const chapters = Array.isArray(course.chapitres) ? course.chapitres : [];
    const scoredChapters = chapters.filter((chapter) => getCourseChapterMaxScore(chapter) > 0);
    if (!scoredChapters.length || !progressData.quizScores) return '';

    let totalPossible = 0;
    let earnedScore = 0;

    scoredChapters.forEach((chapter) => {
        totalPossible += getCourseChapterMaxScore(chapter);
        earnedScore += progressData.quizScores[chapter.id] || 0;
    });

    const starSvg = earnedScore === totalPossible && totalPossible > 0
        ? `<svg width="14" height="14" fill="var(--accent-blue)" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-left:4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
        : '';

    return `<span class="student-course-score">Score ${earnedScore}/${totalPossible} ${starSvg}</span>`;
}

function sortCourses(a, b) {
    const courseA = a && typeof a === 'object' ? a : {};
    const courseB = b && typeof b === 'object' ? b : {};

    const planA = getPrimaryCoursePlan(courseA);
    const planB = getPrimaryCoursePlan(courseB);

    if (planA || planB) {
        if (planA && !planB) return -1;
        if (!planA && planB) return 1;
        const planCompare = compareCoursePlansLikeQa(planA || {}, planB || {});
        if (planCompare !== 0) return planCompare;
    }

    const blocCompare = String(courseA.bloc || courseA.blockTitle || '').localeCompare(String(courseB.bloc || courseB.blockTitle || ''), 'fr', { sensitivity: 'base' });
    if (blocCompare !== 0) return blocCompare;
    return String(courseA.titre || courseA.title || '').localeCompare(String(courseB.titre || courseB.title || ''), 'fr', { sensitivity: 'base' });
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
            progress: userProgress.courses?.[course.id] || null,
            planOnly: course.__planOnly === true,
            promotionPlan: course.__promotionPlan || null
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
