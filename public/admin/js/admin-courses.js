/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Formations et Accès
 * =======================================================================
 *
 * Étape 5.2.4 : Query-safe consolidation.
 * =======================================================================
 */
import { db, auth, app } from '/js/firebase-init.js';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    deleteDoc,
    updateDoc,
    serverTimestamp,
    getDoc,
    query,
    where,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { logoutUser } from '/js/auth.js?v=8.0P.167.44';
import {
    setPendingImageFile,
    setPendingVideoFile,
    captureActiveMediaInputs,
    restoreCurrentMediaPreview,
    syncChapterMediaFromDom,
    uploadPendingMediaForChapters,
    hasPendingMedia,
    clearAllPendingMedia,
    clearPendingMediaForChapter,
    clearChapterMedia,
    hasChapterMedia,
    consumePendingMediaDeletes,
    deleteStoredMediaByUrl,
    validateCourseDocumentSize,
    validateVideoFileForStorage,
    deleteUnusedCourseMediaFromStorage
// 8.0P.167.359 : import AVEC jeton — l'import sans jeton servait une version
// en cache sans les nouveaux exports (clearChapterMedia…) → module entier KO
// (bibliothèque vide + rechargement). Règle : module modifié ⇒ jeton partout.
} from '/admin/js/course-media-storage.js?v=8.0P.167.359';
import {
    syncUserFormationIndexesFromData
} from '/admin/js/user-formation-index.js';
import {
    loadUsersForCourseAccess,
    loadFormationsForCourseAccess,
    loadCoursesForCourseAccess,
    loadCoursesLibraryView,
    loadCoursesForMediaSafety
} from '/admin/js/course-data-access.js?v=8.0P.167.373';
import { renderCourseActionButtons } from '/admin/js/course-action-buttons.js?v=8.0P.167.188';
import { SVG_PREVIEW, SVG_QUIZ_LIST } from '/admin/js/courses/course-icons.js';
import {
    addQuizQuestion,
    addOptionToQuestion,
    gatherQuizQuestions,
    renderQuizBuilder
} from '/admin/js/courses/course-quiz-builder.js';
import {
    setupFormationSearch as setupFormationSearchUi,
    getAccessibleFormations as getAccessibleFormationsUi,
    renderFormationsList as renderFormationsListUi,
    openFormationModal as openFormationModalUi,
    renderFormationsPillsAndFilters as renderFormationsPillsAndFiltersUi,
    refreshBlocsList as refreshBlocsListUi
} from '/admin/js/courses/course-formations-ui.js';
import {
    showSaveConfirmation,
    isAdminAuthor as isAdminAuthorBase,
    shouldHideDraftForAdmin as shouldHideDraftForAdminBase,
    getAuthorName as getAuthorNameBase
} from '/admin/js/courses/course-save-feedback.js';
import { getCourseTargetingSnapshot } from '/admin/js/courses/course-targeting.js?v=8.0P.167.85';
import {
    syncTeacherCourseAccessIndexForCourse,
    syncTeacherCourseAccessIndexForCourses
} from '/admin/js/courses/teacher-course-access-index.js?v=8.0P.167.85';
let currentUid = null;
let currentUserProfile = null;
let currentChapters = [];
let activeChapterId = null;
let allFormationsData = [];
let allUsersForAccess = [];
let allCoursesData = [];

let editingCourseAuthorId = null;
let editingCourseOriginalStatus = null;
let editingCourseOriginalActive = false;

let formationIndexSyncedOnce = false;
let courseTeacherTargetsSyncedOnce = false;

// État de la bibliothèque (filtres/tri). DÉCLARÉ ICI (et pas plus bas) car
// resetAdminCoursesStateForMount() les réinitialise, et cette fonction tourne
// dès l'évaluation du module via autoMount (type=module différé). Les déclarer
// plus bas = zone morte temporelle (TDZ) → ReferenceError qui casserait toute
// la page gestionnaire de cours (cf. incident viewer .367/.368).
const libraryView = { formation: 'all', search: '', group: 'bloc', sort: 'cursus' };
const libraryCursusCache = new Map(); // formationId -> { orderMap: Map(courseId -> ordre), promoName }
let libraryFiltersWired = false;

window.addOptionToQuestion = addOptionToQuestion;

const courseUiState = {
    get currentUid() { return currentUid; },
    get currentUserProfile() { return currentUserProfile; },
    get allFormationsData() { return allFormationsData; },
    get allUsersForAccess() { return allUsersForAccess; },
    get allCoursesData() { return allCoursesData; },
    openFormationModal: (formationId) => openFormationModal(formationId)
};

function setupFormationSearch() {
    setupFormationSearchUi();
}

function getAccessibleFormations() {
    return getAccessibleFormationsUi(courseUiState);
}

function renderFormationsList() {
    renderFormationsListUi(courseUiState);
}

function openFormationModal(formationId) {
    openFormationModalUi(courseUiState, formationId);
}

window.openFormationModal = openFormationModal;

async function mountPublicFormationsAdminSafely(cleanups) {
    const publicCatalogRoot = document.querySelector('#tab-public-formations [data-sbi-public-formations-admin]');

    if (!publicCatalogRoot) return;

    try {
        const module = await import('/admin/js/public-formations-admin.js?v=8.0P.151');
        const initPublicFormationsAdmin = module?.initPublicFormationsAdmin || window.SBI_INIT_PUBLIC_FORMATIONS_ADMIN;

        if (typeof initPublicFormationsAdmin !== 'function') return;

        const cleanupPublicFormationsAdmin = initPublicFormationsAdmin({
            root: document.getElementById('tab-public-formations') || publicCatalogRoot,
            source: 'admin-courses'
        });

        if (typeof cleanupPublicFormationsAdmin === 'function') cleanups.push(cleanupPublicFormationsAdmin);
    } catch (error) {
        console.warn('[SBI Public Formations Admin] Module isolé non chargé. Le gestionnaire de cours reste disponible :', error);
        const status = document.getElementById('public-formations-admin-status');
        if (status) {
            status.dataset.tone = 'error';
            status.textContent = 'Catalogue public indisponible. Recharge la page ou vérifie les droits admin.';
        }
    }
}


async function mountPublicResourcesAdminSafely(cleanups) {
    const publicResourcesRoot = document.querySelector('#tab-public-resources [data-sbi-public-resources-admin]');

    if (!publicResourcesRoot) return;

    try {
        const module = await import('/admin/js/public-resources-admin.js?v=8.0P.119');
        const initPublicResourcesAdmin = module?.initPublicResourcesAdmin || window.SBI_INIT_PUBLIC_RESOURCES_ADMIN;

        if (typeof initPublicResourcesAdmin !== 'function') return;

        const cleanupPublicResourcesAdmin = initPublicResourcesAdmin({
            root: document.getElementById('tab-public-resources') || publicResourcesRoot,
            source: 'admin-courses'
        });

        if (typeof cleanupPublicResourcesAdmin === 'function') cleanups.push(cleanupPublicResourcesAdmin);
    } catch (error) {
        console.warn('[SBI Public Resources Admin] Module isolé non chargé. Le gestionnaire de cours reste disponible :', error);
        const status = document.getElementById('public-resources-admin-status');
        if (status) {
            status.dataset.tone = 'error';
            status.textContent = 'Brochures indisponibles. Recharge la page ou vérifie les droits admin.';
        }
    }
}

function renderFormationsPillsAndFilters() {
    renderFormationsPillsAndFiltersUi(courseUiState);
}

function refreshBlocsList() {
    refreshBlocsListUi(courseUiState);
}

// SBI 8.0P.167.280 — Les notifications du workflow cours sont desormais creees
// cote SERVEUR (Cloud Function emitCourseWorkflowNotifications). Le client se
// contente de declencher l'action ; plus aucune ecriture client dans /notifications.
const sbiFunctions = getFunctions(app, 'europe-west1');
const emitCourseWorkflowNotificationsCallable = httpsCallable(sbiFunctions, 'emitCourseWorkflowNotifications');

async function emitCourseWorkflowNotifications(courseId, action) {
    if (!courseId || !action) return;
    try {
        await emitCourseWorkflowNotificationsCallable({ courseId, action });
    } catch (error) {
        console.warn('[SBI Courses] Notification workflow non envoyée :', error);
    }
}

function isAdminAuthor(authorId) {
    return isAdminAuthorBase(authorId, allUsersForAccess);
}

function shouldHideDraftForAdmin(courseData) {
    return shouldHideDraftForAdminBase(courseData, {
        currentUserProfile,
        currentUid,
        users: allUsersForAccess
    });
}

function getAuthorName(authorId, courseData = null) {
    return getAuthorNameBase(authorId, courseData, {
        currentUserProfile,
        currentUid,
        users: allUsersForAccess
    });
}


function normalizeLmsFormationIds(targetFormationIds = [], selectedFormationRefs = []) {
    const ids = Array.isArray(targetFormationIds) ? targetFormationIds : [];
    const refs = Array.isArray(selectedFormationRefs) ? selectedFormationRefs : [];

    return Array.from(new Set([...ids, ...refs]
        .map(value => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)));
}

function getLmsStatusFromCourseState(statutValidation, isActive) {
    if (statutValidation === 'pending') return 'pending_review';
    if (isActive === true || statutValidation === 'approved') return 'published';
    return 'draft';
}

function countChapterResources(chapter) {
    if (!chapter || typeof chapter !== 'object') return 0;

    let total = 0;

    if (chapter.mediaImage || chapter.mediaImagePath || chapter.imageUrl) total += 1;
    if (chapter.mediaVideo || chapter.mediaVideoPath || chapter.videoUrl) total += 1;
    if (Array.isArray(chapter.resources)) total += chapter.resources.filter(Boolean).length;
    if (Array.isArray(chapter.documents)) total += chapter.documents.filter(Boolean).length;

    return total;
}

function buildLmsCourseFields({ chapters = [], selectedFormationRefs = [], targetFormationIds = [], statutValidation = 'draft', isActive = false } = {}) {
    const safeChapters = Array.isArray(chapters) ? chapters : [];
    const lessonCount = safeChapters.filter(chapter => chapter?.type !== 'quiz').length;
    const quizCount = safeChapters.filter(chapter => chapter?.type === 'quiz' || Array.isArray(chapter?.questions)).length;
    const resourceCount = safeChapters.reduce((total, chapter) => total + countChapterResources(chapter), 0);

    return {
        schemaVersion: 'lms-course-v1',
        lmsStatus: getLmsStatusFromCourseState(statutValidation, isActive),
        formationIds: normalizeLmsFormationIds(targetFormationIds, selectedFormationRefs),
        lessonCount,
        quizCount,
        resourceCount,
        lessonType: safeChapters.some(chapter => chapter?.type === 'quiz') ? 'mixed' : 'text',
        xpEnabled: true,
        xpRules: [],
        rewardRuleIds: [],
        checkpointIds: [],
        recommendedStartAt: null,
        recommendedEndAt: null,
        priorityLevel: 'normal'
    };
}



let activeAdminCoursesCleanup = null;

function resetAdminCoursesStateForMount() {
    currentUid = null;
    currentUserProfile = null;
    currentChapters = [];
    activeChapterId = null;
    allFormationsData = [];
    allUsersForAccess = [];
    allCoursesData = [];
    editingCourseAuthorId = null;
    editingCourseOriginalStatus = null;
    editingCourseOriginalActive = false;
    formationIndexSyncedOnce = false;
    courseTeacherTargetsSyncedOnce = false;
    // CORRECTIF tri biblio : en PJAX, le DOM de la page (et donc les contrôles
    // de tri/filtre) est recréé à chaque montage. Sans ce reset, le garde-fou
    // restait à true → wireLibraryFilters() sortait tôt → les nouveaux <select>
    // n'avaient plus d'écouteur → « le menu réagit mais ne trie rien ».
    libraryFiltersWired = false;
    libraryCursusCache.clear();
    libraryView.formation = 'all';
    libraryView.search = '';
    libraryView.group = 'bloc';
    libraryView.sort = 'cursus';
    clearAllPendingMedia();
}

function bindCourseEvent(target, eventName, handler, cleanups, options = undefined) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(eventName, handler, options);
    cleanups.push(() => target.removeEventListener(eventName, handler, options));
}

export function mountAdminCourses({ source = 'standard' } = {}) {
    activeAdminCoursesCleanup?.({ reason: 'remount' });
    resetAdminCoursesStateForMount();

    let disposed = false;
    const cleanups = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (disposed) return;

        if (user) {
            currentUid = user.uid;

            await loadUsersForAccess();
            if (disposed) return;

            await loadFormationsCategories();
            if (disposed) return;

            await loadCourses();
            if (disposed) return;

            await syncFormationIndexesIfAllowedOnce();
            if (disposed) return;

            const urlParams = new URLSearchParams(window.SBI_APP_SHELL_CURRENT_URL || window.location.href);
            const editId = urlParams.get('edit');

            if (editId) {
                window.location.assign(`/admin/course-editor.html?id=${encodeURIComponent(editId)}`);
                return;
            }

            setupPreviewButton();
            setupRejectButton();
            setupDropZone('drop-zone-image', 'chapter-image-upload');
            setupDropZone('drop-zone-video', 'chapter-video-upload');

            window.dispatchEvent(new CustomEvent('sbi:course-editor-mounted', {
                detail: { source, uid: currentUid }
            }));

        } else {
            window.location.replace('/login.html');
        }
    });

    cleanups.push(() => unsubscribeAuth?.());

    const logoutBtn = document.getElementById('logout-btn');
    bindCourseEvent(logoutBtn, 'click', logoutUser, cleanups);

    const cacheBtn = document.getElementById('btn-clear-cache');
    bindCourseEvent(cacheBtn, 'click', () => {
        if (confirm('Vider le cache local ? Cela rechargera la page.')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload(true);
        }
    }, cleanups);

    const btnDraft = document.getElementById('btn-save-draft');
    const btnSubmit = document.getElementById('btn-submit-validation');
    const btnSaveAdmin = document.getElementById('btn-save-course');

    bindCourseEvent(btnDraft, 'click', () => saveCourseToFirebase('draft'), cleanups);
    bindCourseEvent(btnSubmit, 'click', () => saveCourseToFirebase('submit'), cleanups);
    bindCourseEvent(btnSaveAdmin, 'click', () => saveCourseToFirebase('admin_save'), cleanups);

    const btnAddChapter = document.getElementById('btn-add-chapter');
    bindCourseEvent(btnAddChapter, 'click', () => createNewChapter('text'), cleanups);

    const btnAddQuiz = document.getElementById('btn-add-quiz');
    bindCourseEvent(btnAddQuiz, 'click', () => createNewChapter('quiz'), cleanups);

    const btnAddBloc = document.getElementById('btn-add-new-bloc');
    bindCourseEvent(btnAddBloc, 'click', () => {
        const newBlocName = prompt("Entrez le nom du nouveau bloc :");

        if (newBlocName && newBlocName.trim() !== "") {
            const select = document.getElementById('course-bloc-select');

            if (select) {
                const option = document.createElement('option');
                option.value = newBlocName.trim();
                option.textContent = newBlocName.trim();
                select.appendChild(option);
                select.value = newBlocName.trim();
            }
        }
    }, cleanups);

    const newCourseBtn = document.getElementById('btn-trigger-new-course');
    bindCourseEvent(newCourseBtn, 'click', (event) => {
        event?.preventDefault?.();
        window.location.assign('/admin/course-editor.html');
    }, cleanups);

    const addQuestionBtn = document.getElementById('btn-add-question');
    bindCourseEvent(addQuestionBtn, 'click', addQuizQuestion, cleanups);

    const chapterTitle = document.getElementById('chapter-title');
    bindCourseEvent(chapterTitle, 'input', updateActiveTitle, cleanups);

    const quizTitleInput = document.getElementById('quiz-title');
    bindCourseEvent(quizTitleInput, 'input', updateActiveTitle, cleanups);

    setupMediaInputs();
    setupFormationSearch();
    setupFormationModal();

    mountPublicFormationsAdminSafely(cleanups);
    mountPublicResourcesAdminSafely(cleanups);

    const cleanup = () => {
        disposed = true;
        cleanups.splice(0, cleanups.length).forEach((fn) => {
            try { fn(); } catch {}
        });

        if (activeAdminCoursesCleanup === cleanup) {
            activeAdminCoursesCleanup = null;
        }
    };

    activeAdminCoursesCleanup = cleanup;
    return cleanup;
}

function autoMountAdminCourses() {
    if (window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR) return;
    if (!document.getElementById('courses-list-container') && !document.getElementById('course-title')) return;
    mountAdminCourses({ source: 'auto' });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountAdminCourses, { once: true });
} else {
    autoMountAdminCourses();
}


function isAdminLikeUser() {
    return currentUserProfile?.isGod === true || currentUserProfile?.role === 'admin';
}

async function syncFormationIndexesIfAllowedOnce() {
    if (formationIndexSyncedOnce) return;
    if (!isAdminLikeUser()) return;

    formationIndexSyncedOnce = true;

    await syncFormationIndexesIfAllowed();
}

async function syncFormationIndexesIfAllowed() {
    if (!isAdminLikeUser()) return;

    try {
        const result = await syncUserFormationIndexesFromData({
            formations: allFormationsData,
            users: allUsersForAccess
        });

        if (result.updated > 0) {
            console.log(`[SBI Index] formationIds synchronisés pour ${result.updated} utilisateur(s).`);
            await loadUsersForAccess();
        }
    } catch (error) {
        console.warn("[SBI Index] Synchronisation formationIds impossible :", error);
    }
}

function normalizeCourseAccessValues(values = []) {
    if (!Array.isArray(values)) return [];

    return Array.from(new Set(values
        .map((value) => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)));
}

function getCourseFormationRefs(courseData = {}) {
    return normalizeCourseAccessValues([
        ...(Array.isArray(courseData.formations) ? courseData.formations : []),
        ...(Array.isArray(courseData.formationIds) ? courseData.formationIds : []),
        ...(Array.isArray(courseData.formationsIds) ? courseData.formationsIds : []),
        ...(Array.isArray(courseData.targetFormationIds) ? courseData.targetFormationIds : []),
        ...(Array.isArray(courseData.targetFormationTitles) ? courseData.targetFormationTitles : [])
    ]);
}

function resolveTeacherTargetsForCourse(courseData = {}) {
    const refs = getCourseFormationRefs(courseData);
    if (!refs.length || !Array.isArray(allFormationsData)) return [];

    const teachers = new Set();

    allFormationsData.forEach((formation) => {
        const formationId = formation?.id ? String(formation.id).trim() : '';
        const formationTitle = formation?.titre ? String(formation.titre).trim() : '';

        if (!refs.includes(formationId) && !refs.includes(formationTitle)) return;

        if (Array.isArray(formation.profs)) {
            formation.profs.forEach((teacherId) => {
                const safeTeacherId = typeof teacherId === 'string' ? teacherId.trim() : '';
                if (safeTeacherId) teachers.add(safeTeacherId);
            });
        }
    });

    return normalizeCourseAccessValues(Array.from(teachers));
}

function listsAreSame(a = [], b = []) {
    const left = normalizeCourseAccessValues(a).sort();
    const right = normalizeCourseAccessValues(b).sort();

    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

async function syncCourseTeacherTargetsIfAllowedOnce() {
    if (courseTeacherTargetsSyncedOnce) return;
    if (!isAdminLikeUser()) return;

    courseTeacherTargetsSyncedOnce = true;

    try {
        const updates = [];

        allCoursesData.forEach((courseData) => {
            if (!courseData?.id) return;

            const targetTeacherIds = resolveTeacherTargetsForCourse(courseData);
            if (!targetTeacherIds.length) return;
            if (listsAreSame(courseData.targetTeacherIds, targetTeacherIds)) return;

            updates.push(updateDoc(doc(db, 'courses', courseData.id), {
                targetTeacherIds
            }));
        });

        if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[SBI Courses] targetTeacherIds synchronisés pour ${updates.length} cours.`);
            allCoursesData = await loadCoursesForCourseAccess({
                currentUid,
                currentUserProfile
            });
        }

        const indexedCount = await syncTeacherCourseAccessIndexForCourses(allCoursesData, allFormationsData);
        if (indexedCount > 0) {
            console.log(`[SBI Courses] Index accès prof synchronisé pour ${indexedCount} cours.`);
        }
    } catch (error) {
        console.warn('[SBI Courses] Synchronisation targetTeacherIds / index accès prof impossible :', error);
    }
}

function setupPreviewButton() {
    if (document.getElementById('btn-preview-course')) return;

    const targetBtn = document.getElementById('btn-submit-validation') || document.getElementById('btn-save-course');

    if (!targetBtn) return;

    targetBtn.insertAdjacentHTML(
        'afterend',
        `<button id="btn-preview-course" class="action-btn" style="width: 100%; margin-top: 1rem; background: transparent; color: var(--text-main); border: 1px solid var(--border-color); padding: 1rem; font-size: 1rem; cursor: pointer; transition: 0.2s; font-weight:bold;">${SVG_PREVIEW} Visualiser le rendu actuel</button>`
    );

    document.getElementById('btn-preview-course').addEventListener('click', async () => {
        const cId = document.getElementById('edit-course-id').value;

        if (!cId) {
            alert("Veuillez enregistrer le cours comme brouillon une première fois avant de le visualiser.");
            return;
        }

        if (shouldOpenPreviewWithoutSaving()) {
            openCoursePreview(cId);
            return;
        }

        await saveCourseToFirebase('preview');
    });
}

function getCourseViewerBasePath() {
    return currentUserProfile?.role === 'teacher' && !isAdminLikeUser() ? '/teacher/cours-viewer.html' : '/student/cours-viewer.html';
}

function openCoursePreview(courseId) {
    if (courseId) window.open(`${getCourseViewerBasePath()}?id=${courseId}&preview=true`, '_blank');
}

function shouldOpenPreviewWithoutSaving() {
    return currentUserProfile?.role === 'teacher' && !isAdminLikeUser() && editingCourseOriginalStatus && editingCourseOriginalStatus !== 'draft';
}

function setupRejectButton() {
    if (document.getElementById('btn-reject-course')) return;

    const saveAdminBtn = document.getElementById('btn-save-course');

    if (!saveAdminBtn) return;

    saveAdminBtn.insertAdjacentHTML(
        'beforebegin',
        `<button id="btn-reject-course" class="action-btn danger" style="margin-right: 10px; display: none;">Refuser</button>`
    );

    document.getElementById('btn-reject-course').addEventListener('click', async () => {
        if (confirm("Refuser ce cours et demander des modifications au professeur ?")) {
            await saveCourseToFirebase('reject');
        }
    });
}

// 8.0P.167.358 — boutons « Retirer l'image / la vidéo » (éditeur legacy).
function updateLegacyMediaRemoveButtons(chapter) {
    const imageBtn = document.getElementById('media-image-remove');
    const videoBtn = document.getElementById('media-video-remove');
    if (imageBtn) imageBtn.style.display = chapter && hasChapterMedia(chapter.id, chapter, 'image') ? '' : 'none';
    if (videoBtn) videoBtn.style.display = chapter && hasChapterMedia(chapter.id, chapter, 'video') ? '' : 'none';
}

function setupMediaRemoveButtons() {
    const bind = (buttonId, kind) => {
        const button = document.getElementById(buttonId);
        if (!button || button.dataset.sbiMediaRemoveBound === 'true') return;
        button.dataset.sbiMediaRemoveBound = 'true';
        button.addEventListener('click', () => {
            if (!activeChapterId) return;
            const chapter = currentChapters.find(c => c.id === activeChapterId);
            if (!chapter) return;
            const label = kind === 'video' ? 'la vidéo' : "l'image";
            if (!confirm(`Retirer ${label} de cette étape ? Le retrait sera définitif à la prochaine sauvegarde.`)) return;
            clearChapterMedia(activeChapterId, chapter, kind);
            updateLegacyMediaRemoveButtons(chapter);
        });
    };
    bind('media-image-remove', 'image');
    bind('media-video-remove', 'video');
}

function setupMediaInputs() {
    setupMediaRemoveButtons();
    const imgUpload = document.getElementById('chapter-image-upload');

    if (imgUpload) {
        imgUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (!activeChapterId) {
                alert("Sélectionne une étape avant d'ajouter une image.");
                e.target.value = '';
                return;
            }

            try {
                setPendingImageFile(activeChapterId, file);
                e.target.value = '';

                const chapter = currentChapters.find(c => c.id === activeChapterId);
                restoreCurrentMediaPreview(activeChapterId, chapter);
                updateLegacyMediaRemoveButtons(chapter);

            } catch (error) {
                e.target.value = '';
                alert(`${error.message}`);
            }
        });
    }

    const vidUpload = document.getElementById('chapter-video-upload');

    if (vidUpload) {
        vidUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (!activeChapterId) {
                alert("Sélectionne une étape avant d'ajouter une vidéo.");
                e.target.value = '';
                return;
            }

            try {
                validateVideoFileForStorage(file);
                setPendingVideoFile(activeChapterId, file);
                e.target.value = '';

                const chapter = currentChapters.find(c => c.id === activeChapterId);
                restoreCurrentMediaPreview(activeChapterId, chapter);
                updateLegacyMediaRemoveButtons(chapter);

            } catch (error) {
                e.target.value = '';
                alert(`${error.message}`);
            }
        });
    }
}

function setupFormationModal() {
    const btnCreateForm = document.getElementById('btn-create-formation');
    if (btnCreateForm) btnCreateForm.addEventListener('click', () => openFormationModal(null));

    const closeFormBtn = document.getElementById('close-formation-modal-btn');
    if (closeFormBtn) closeFormBtn.addEventListener('click', () => document.getElementById('formation-modal').style.display = 'none');

    const formForm = document.getElementById('formation-form');

    if (formForm) {
        formForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formId = document.getElementById('edit-formation-id').value;
            const titre = document.getElementById('formation-titre').value.trim();

            const profs = Array.from(document.querySelectorAll('.cb-formation-user[data-role="teacher"]:checked')).map(cb => cb.dataset.uid);
            const students = Array.from(document.querySelectorAll('.cb-formation-user[data-role="student"]:checked')).map(cb => cb.dataset.uid);

            const data = { titre, profs, students };

            try {
                if (formId) {
                    await updateDoc(doc(db, "formations", formId), data);
                } else {
                    data.auteurId = currentUid;
                    data.dateCreation = serverTimestamp();
                    await addDoc(collection(db, "formations"), data);
                }

                document.getElementById('formation-modal').style.display = 'none';

                await loadFormationsCategories();
                await syncFormationIndexesIfAllowed();

            } catch (err) {
                console.error(err);
                alert('Erreur de sauvegarde');
            }
        });
    }

    const deleteFormBtn = document.getElementById('delete-formation-btn');

    if (deleteFormBtn) {
        deleteFormBtn.addEventListener('click', async () => {
            const formId = document.getElementById('edit-formation-id').value;

            if (confirm('DANGER : Supprimer cette catégorie ? Les cours associés perdront leur tag.')) {
                await deleteDoc(doc(db, "formations", formId));
                document.getElementById('formation-modal').style.display = 'none';

                await loadFormationsCategories();
                await syncFormationIndexesIfAllowed();
            }
        });
    }
}

function updateActiveTitle(e) {
    if (activeChapterId) {
        const chapter = currentChapters.find(c => c.id === activeChapterId);

        if (chapter) {
            chapter.titre = e.target.value;
            renderChaptersList();
        }
    }
}

function setupDropZone(dropZoneId, inputId) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    if (!dropZone || !input) return;

    dropZone.addEventListener('click', () => input.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            const event = new Event('change');
            input.dispatchEvent(event);
        }
    });
}

async function loadUsersForAccess() {
    if (!currentUid) return;
    if (!currentUserProfile) {
        const ownSnap = await getDoc(doc(db, "users", currentUid));
        if (ownSnap.exists()) currentUserProfile = { id: ownSnap.id, ...ownSnap.data() };
    }
    allUsersForAccess = await loadUsersForCourseAccess({ currentUid, currentUserProfile });
    const loadedProfile = allUsersForAccess.find(u => u.id === currentUid);
    if (loadedProfile) currentUserProfile = loadedProfile;
    else if (currentUserProfile) allUsersForAccess.unshift({ id: currentUid, ...currentUserProfile });
}

async function loadFormationsCategories() {
    allFormationsData = await loadFormationsForCourseAccess({
        currentUid,
        currentUserProfile
    });

    renderFormationsList();
    renderFormationsPillsAndFilters();
}

window.prepareNewCourse = function() {
    window.location.assign('/admin/course-editor.html');
};

function createNewChapter(type) {
    saveCurrentChapterContent();

    const newId = 'chap_' + Date.now().toString();

    const newChap = {
        id: newId,
        type: type,
        titre: type === 'quiz' ? `Examen` : `Leçon ${currentChapters.filter(c => c.type === 'text').length + 1}`,
        contenu: '',
        mediaType: 'image',
        mediaImage: '',
        mediaVideo: '',
        questions: []
    };

    currentChapters.push(newChap);
    selectChapter(newId);
}

function saveCurrentChapterContent() {
    if (!activeChapterId) return;

    const chapter = currentChapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    if (chapter.type === 'text') {
        const cTitle = document.getElementById('chapter-title');
        if (cTitle) chapter.titre = cTitle.value;

        const mediaChecked = document.querySelector('input[name="media_type"]:checked');
        if (mediaChecked) chapter.mediaType = mediaChecked.value;

        syncChapterMediaFromDom(chapter);

        chapter.contenu = window.quill ? window.quill.root.innerHTML : '';

    } else if (chapter.type === 'quiz') {
        const qTitle = document.getElementById('quiz-title');
        if (qTitle) chapter.titre = qTitle.value;

        chapter.questions = gatherQuizQuestions();
    }
}

window.selectChapter = function(id) {
    if (activeChapterId) {
        captureActiveMediaInputs(activeChapterId);
    }

    saveCurrentChapterContent();

    activeChapterId = id;

    const chapter = currentChapters.find(c => c.id === id);
    if (!chapter) return;

    const noChapterZone = document.getElementById('no-chapter-zone');
    if (noChapterZone) noChapterZone.style.display = 'none';

    if (chapter.type === 'quiz') {
        document.getElementById('chapter-editor-zone').style.display = 'none';
        document.getElementById('quiz-editor-zone').style.display = 'flex';
        document.getElementById('quiz-title').value = chapter.titre || '';
        renderQuizBuilder(chapter.questions || []);

    } else {
        document.getElementById('quiz-editor-zone').style.display = 'none';
        document.getElementById('chapter-editor-zone').style.display = 'flex';

        document.getElementById('chapter-title').value = chapter.titre || '';

        const mediaImageRadio = document.querySelector('input[name="media_type"][value="image"]');
        const mediaVideoRadio = document.querySelector('input[name="media_type"][value="video"]');

        if (chapter.mediaType === 'video') {
            if (mediaVideoRadio) mediaVideoRadio.checked = true;
            document.getElementById('media-image-zone').style.display = 'none';
            document.getElementById('media-video-zone').style.display = 'flex';
        } else {
            if (mediaImageRadio) mediaImageRadio.checked = true;
            document.getElementById('media-image-zone').style.display = 'flex';
            document.getElementById('media-video-zone').style.display = 'none';
        }

        restoreCurrentMediaPreview(chapter.id, chapter);
        updateLegacyMediaRemoveButtons(chapter);

        if (window.quill) {
            window.quill.setContents([]);
            window.quill.clipboard.dangerouslyPasteHTML(chapter.contenu || '');
        }
    }

    renderChaptersList();
};

window.deleteChapter = function(id, event) {
    event.stopPropagation();

    if (confirm('Supprimer cette étape ?')) {
        clearPendingMediaForChapter(id);

        currentChapters = currentChapters.filter(c => c.id !== id);

        if (activeChapterId === id) {
            activeChapterId = null;

            const noChapterZone = document.getElementById('no-chapter-zone');
            if (noChapterZone) noChapterZone.style.display = 'flex';

            const chapterEditorZone = document.getElementById('chapter-editor-zone');
            if (chapterEditorZone) chapterEditorZone.style.display = 'none';

            const quizEditorZone = document.getElementById('quiz-editor-zone');
            if (quizEditorZone) quizEditorZone.style.display = 'none';
        }

        renderChaptersList();
    }
};

function renderChaptersList() {
    const list = document.getElementById('chapters-list');
    if (!list) return;

    list.innerHTML = '';

    currentChapters.forEach((chapter, index) => {
        const isActive = chapter.id === activeChapterId;

        const bg = isActive ? 'var(--accent-blue-light, rgba(42, 87, 255, 0.1))' : 'var(--bg-card, #111)';
        const border = isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-color, #333)';
        const color = chapter.type === 'quiz' ? 'var(--accent-yellow, #fbbc04)' : (isActive ? 'var(--accent-blue)' : 'var(--text-main, white)');
        const icon = chapter.type === 'quiz' ? SVG_QUIZ_LIST : `${index + 1}. `;

        const li = `
            <li onclick="selectChapter('${chapter.id}')" style="padding: 0.8rem; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: ${color}; font-weight: ${isActive ? 'bold' : 'normal'};">
                <span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${icon}${chapter.titre}</span>
                <button onclick="deleteChapter('${chapter.id}', event)" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer;">&times;</button>
            </li>
        `;

        list.insertAdjacentHTML('beforeend', li);
    });
}

window.editCourse = async (id) => {
    const safeId = id ? `?id=${encodeURIComponent(id)}` : '';
    window.location.assign(`/admin/course-editor.html${safeId}`);
};

function handleEditorLockState() {
    const isTeacher = currentUserProfile && currentUserProfile.role === 'teacher';
    const warningBanner = document.getElementById('lock-warning-banner');

    if (isTeacher && editingCourseOriginalStatus === 'pending') {
        if (warningBanner) warningBanner.style.display = 'block';

        document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
            el.disabled = true;
            el.style.opacity = '0.5';
            el.style.pointerEvents = 'none';
        });

        if (window.quill) window.quill.enable(false);

    } else {
        if (warningBanner) warningBanner.style.display = 'none';

        document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        });

        if (window.quill) window.quill.enable(true);
    }
}

function handleRejectButtonVisibility() {
    const rejectBtn = document.getElementById('btn-reject-course');

    if (!rejectBtn) return;

    if (
        currentUserProfile &&
        (currentUserProfile.role === 'admin' || currentUserProfile.isGod) &&
        editingCourseOriginalStatus === 'pending'
    ) {
        rejectBtn.style.display = 'inline-block';
    } else {
        rejectBtn.style.display = 'none';
    }
}

async function saveCourseToFirebase(actionType = 'admin_save') {
    if (activeChapterId) {
        captureActiveMediaInputs(activeChapterId);
    }

    saveCurrentChapterContent();

    const courseIdEl = document.getElementById('edit-course-id');
    const titleEl = document.getElementById('course-title');
    const selectBloc = document.getElementById('course-bloc-select');

    if (!courseIdEl || !titleEl) return;

    const courseId = courseIdEl.value;
    const title = titleEl.value.trim();
    const bloc = selectBloc ? selectBloc.value.trim() : '';
    const selectedPills = Array.from(document.querySelectorAll('.formation-pill.selected')).map(p => p.getAttribute('data-val'));

    if (actionType === 'preview' && shouldOpenPreviewWithoutSaving()) {
        openCoursePreview(courseId);
        return;
    }

    if (!title) {
        alert('Veuillez entrer un titre global.');
        return;
    }

    if (currentChapters.length === 0) {
        alert('Ajoutez au moins une étape.');
        return;
    }

    let finalStatut = editingCourseOriginalStatus || 'draft';
    let isActive = editingCourseOriginalActive === true;

    if (actionType === 'draft') {
        finalStatut = 'draft';
        isActive = false;

    } else if (actionType === 'submit') {
        if (!confirm("ATTENTION : Une fois soumis à validation, ce cours sera verrouillé et vous ne pourrez plus le modifier pendant la durée de l'examen.\n\nConfirmer l'envoi ?")) {
            return;
        }

        finalStatut = 'pending';
        isActive = false;

    } else if (actionType === 'admin_save') {
        const activeCheckbox = document.getElementById('course-active');
        if (activeCheckbox) isActive = activeCheckbox.checked;

        if (isActive) {
            finalStatut = 'approved';
        } else if (editingCourseOriginalStatus === 'pending') {
            finalStatut = 'pending';
        } else {
            finalStatut = 'draft';
        }

    } else if (actionType === 'reject') {
        finalStatut = 'draft';
        isActive = false;

    } else if (actionType === 'preview') {
        isActive = editingCourseOriginalActive === true;
    }

    const finalAuteurId = courseId ? editingCourseAuthorId : currentUid;

    const isPublishing = (
        actionType === 'admin_save' &&
        isActive === true &&
        editingCourseOriginalActive !== true
    );

    const isRejecting = (
        actionType === 'reject' &&
        editingCourseOriginalStatus === 'pending'
    );

    try {
        let courseRefId = courseId;
        let newCourseRef = null;

        if (!courseRefId) {
            newCourseRef = doc(collection(db, "courses"));
            courseRefId = newCourseRef.id;
            courseIdEl.value = courseRefId;
        }

        const hadPendingMedia = hasPendingMedia();

        if (hadPendingMedia) {
            console.log("[SBI Courses] Upload médias vers Firebase Storage...");
            await uploadPendingMediaForChapters(courseRefId, currentChapters);
        }

        const courseTargeting = getCourseTargetingSnapshot(selectedPills, allFormationsData, {
            includeStudents: isActive
        });
        const targetFormationIds = courseTargeting.targetFormationIds;
        const targetFormationTitles = courseTargeting.targetFormationTitles;
        const targetStudentsForCourse = courseTargeting.targetStudents;
        const targetTeacherIdsForCourse = Array.isArray(courseTargeting.targetTeacherIds) ? courseTargeting.targetTeacherIds : [];

        const lmsCourseFields = buildLmsCourseFields({
            chapters: currentChapters,
            selectedFormationRefs: selectedPills,
            targetFormationIds,
            statutValidation: finalStatut,
            isActive
        });

        const courseData = {
            titre: title,
            bloc: bloc,
            actif: isActive,
            statutValidation: finalStatut,
            formations: selectedPills,
            targetFormationIds,
            targetFormationTitles,
            targetStudents: targetStudentsForCourse,
            targetTeacherIds: targetTeacherIdsForCourse,
            auteurId: finalAuteurId,
            chapitres: currentChapters,
            ...lmsCourseFields
        };

        validateCourseDocumentSize(courseData);

        if (newCourseRef) {
            await setDoc(newCourseRef, {
                ...courseData,
                dateCreation: serverTimestamp()
            });
        } else {
            await updateDoc(doc(db, "courses", courseRefId), courseData);
        }

        try {
            await syncTeacherCourseAccessIndexForCourse({
                courseId: courseRefId,
                courseData,
                allFormationsData
            });
        } catch (teacherAccessError) {
            console.warn('[SBI Courses] Cours sauvegardé, mais index accès prof non synchronisé :', teacherAccessError);
        }

        try {
            // Le doc cours vient d'être écrit ci-dessus : la Cloud Function lit ce
            // doc (auteur/cibles) et crée les notifications serveur (idempotent).
            let notifAction = '';
            if (actionType === 'submit') notifAction = 'submit';
            else if (isPublishing) notifAction = 'publish';
            else if (isRejecting) notifAction = 'reject';
            if (notifAction) await emitCourseWorkflowNotifications(courseRefId, notifAction);
        } catch (notificationError) {
            console.warn("[SBI Courses] Cours sauvegardé, mais notification non envoyée :", notificationError);
        }

        // 8.0P.167.358 — médias retirés : le doc ne les référence plus, purge
        // best effort des anciens fichiers Storage.
        for (const mediaUrl of consumePendingMediaDeletes()) {
            void deleteStoredMediaByUrl(mediaUrl);
        }

        editingCourseOriginalStatus = finalStatut;
        editingCourseOriginalActive = isActive === true;
        window.editingCourseOriginalActive = editingCourseOriginalActive;

        await loadCourses();

        window.dispatchEvent(new CustomEvent('sbi:teacher-library-refresh', {
            detail: { source: 'course-saved', courseId: courseRefId, actionType }
        }));

        if (actionType === 'preview') {
            openCoursePreview(courseRefId);

        } else {
            showSaveConfirmation({ actionType, isPublishing, isRejecting, hadPendingMedia });

            if (typeof window.prepareNewCourse === 'function') window.prepareNewCourse();
            if (typeof window.switchCourseTab === 'function') window.switchCourseTab('tab-list');
        }

    } catch (error) {
        console.error("Erreur de sauvegarde :", error);
        alert(`${error.message || "Erreur de sauvegarde."}`);
    }
}

/* =======================================================================
 * Bibliothèque (8.0P.167.354) : filtre formation + recherche ACTIFS,
 * groupement par bloc partagé (accordéons dépliables) et tri selon
 * l'ORDRE DU CURSUS (promotions.coursePlan[].order de la formation).
 * ===================================================================== */

// (libraryView / libraryCursusCache / libraryFiltersWired sont déclarés en tête
//  de module — voir la note TDZ là-haut.)

// Ordre pédagogique : coursePlan de la promotion (active de préférence) de chaque formation.
async function getCursusOrderForFormation(formationId) {
    if (libraryCursusCache.has(formationId)) return libraryCursusCache.get(formationId);

    const entry = { orderMap: new Map(), promoName: '' };
    try {
        const snap = await getDocs(query(collection(db, 'promotions'), where('formationId', '==', formationId)));
        const promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const promo = promos.find(p => String(p.status || '').toLowerCase() === 'active') || promos[0];

        if (promo && Array.isArray(promo.coursePlan)) {
            entry.promoName = promo.name || '';
            promo.coursePlan.forEach((item, idx) => {
                if (item?.courseId && !entry.orderMap.has(item.courseId)) {
                    entry.orderMap.set(item.courseId, Number.isFinite(item.order) ? item.order : idx);
                }
            });
        }
    } catch (error) {
        console.warn('[SBI Courses] Cursus illisible pour', formationId, error);
    }

    libraryCursusCache.set(formationId, entry);
    return entry;
}

async function getMergedCursusOrder(formationIds) {
    const merged = new Map();
    const promoNames = [];

    for (const fid of formationIds) {
        const { orderMap, promoName } = await getCursusOrderForFormation(fid);
        if (promoName) promoNames.push(promoName);
        orderMap.forEach((order, courseId) => {
            if (!merged.has(courseId)) merged.set(courseId, order);
        });
    }
    return { orderMap: merged, promoNames };
}

function courseFormationRefs(data) {
    const refs = new Set();
    [data.formations, data.targetFormationIds, data.formationIds].forEach(list => {
        if (Array.isArray(list)) list.forEach(v => { if (v) refs.add(String(v)); });
    });
    return refs;
}

function renderLibraryCourseCard(data, cursusOrder) {
    const courseId = data.id;
    let statusHtml = '';

    if (data.statutValidation === 'pending') {
        statusHtml = `<span style="color: var(--accent-yellow, #fbbc04); font-weight: bold; font-size: 0.8rem;"><span style="display:inline-block;width:7px;height:7px;border-radius:999px;background:currentColor;margin-right:6px;vertical-align:middle;"></span>EN ATTENTE</span>`;
    } else {
        statusHtml = data.actif
            ? `<span style="color: var(--accent-green, #10b981); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>`
            : `<span style="color: var(--accent-red, #ff4a4a); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
    }

    const tagsHtml = data.formations
        ? data.formations.map(fId => {
            const formObj = allFormationsData.find(f => f.id === fId || f.titre === fId);
            const displayName = formObj ? formObj.titre : fId;

            return `<span class="tag" style="background: var(--bg-body, #222); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; border: 1px solid var(--border-color, #444);"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:4px;"><path d="M10 4 12 6h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6Z"/></svg>${displayName}</span>`;
        }).join(' ')
        : '';

    const cursusBadgeHtml = Number.isFinite(cursusOrder)
        ? `<span style="color: var(--accent-green, #10b981); font-size: 0.75rem; border: 1px solid var(--accent-green, #10b981); padding: 2px 8px; border-radius: 12px; margin-left: 10px; white-space: nowrap;">Cursus n°${cursusOrder + 1}</span>`
        : (libraryView.sort === 'cursus'
            ? `<span style="color: var(--text-muted, #888); font-size: 0.75rem; border: 1px dashed var(--border-color, #444); padding: 2px 8px; border-radius: 12px; margin-left: 10px; white-space: nowrap;">hors cursus</span>`
            : '');

    const blocHtml = data.bloc
        ? `<span style="color: var(--accent-blue); font-size: 0.8rem; border: 1px solid var(--accent-blue); padding: 2px 8px; border-radius: 12px; margin-left: 10px;">${data.bloc}</span>`
        : '';

    const nbChapitres = Number.isFinite(data.chapitresCount)
        ? data.chapitresCount
        : (data.chapitres ? data.chapitres.length : 0);
    const authorName = getAuthorName(data.auteurId, data);
    const actionButtonsHtml = renderCourseActionButtons({ courseId, courseData: data, currentUid, isAdminLike: isAdminLikeUser() });

    return `
    <div style="background: var(--bg-card, #111); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color, #333); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; opacity: ${data.actif ? '1' : '0.6'};">
        <div>
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
                ${statusHtml}
                <h3 style="margin: 0; display: flex; align-items: center; flex-wrap: wrap; color: var(--text-main, white);">
                    ${data.titre}
                    ${blocHtml}
                    ${cursusBadgeHtml}
                    <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted, #888); font-style: italic; margin-left: 0.8rem;">
                        par ${authorName}
                    </span>
                </h3>
            </div>
            <div style="color: var(--text-main, white);">${tagsHtml} <span style="color: var(--text-muted, #888); font-size: 0.85rem; margin-left: 1rem;">${nbChapitres} Étape(s)</span></div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
            ${actionButtonsHtml}
        </div>
    </div>`;
}

function wireLibraryFilters() {
    if (libraryFiltersWired) return;
    libraryFiltersWired = true;

    const formationFilter = document.getElementById('library-formation-filter');
    const searchInput = document.getElementById('search-course');
    const sortSelect = document.getElementById('library-sort');
    const groupSelect = document.getElementById('library-group');

    if (formationFilter) formationFilter.addEventListener('change', () => {
        libraryView.formation = formationFilter.value || 'all';
        renderCoursesLibrary();
    });
    if (searchInput) searchInput.addEventListener('input', () => {
        libraryView.search = (searchInput.value || '').trim().toLowerCase();
        renderCoursesLibrary();
    });
    if (sortSelect) sortSelect.addEventListener('change', () => {
        libraryView.sort = sortSelect.value || 'cursus';
        renderCoursesLibrary();
    });
    if (groupSelect) groupSelect.addEventListener('change', () => {
        libraryView.group = groupSelect.value || 'bloc';
        renderCoursesLibrary();
    });
}

function libraryTimestampMs(data) {
    const ts = data.updatedAt || data.dateCreation || data.createdAt;
    if (ts?.seconds) return ts.seconds * 1000;
    if (ts?.toMillis) return ts.toMillis();
    return 0;
}

async function renderCoursesLibrary() {
    const listContainer = document.getElementById('courses-list-container');
    if (!listContainer) return;

    // 1) Filtres formation + recherche.
    let courses = allCoursesData.slice();
    if (libraryView.formation !== 'all') {
        courses = courses.filter(data => courseFormationRefs(data).has(libraryView.formation));
    }
    if (libraryView.search) {
        courses = courses.filter(data =>
            String(data.titre || '').toLowerCase().includes(libraryView.search)
            || String(data.bloc || '').toLowerCase().includes(libraryView.search));
    }

    if (!courses.length) {
        listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours ne correspond aux filtres.</p>';
        return;
    }

    // 2) Ordre du cursus (coursePlan des promotions de la/les formation(s) visée(s)).
    let orderMap = new Map();
    let promoNames = [];
    if (libraryView.sort === 'cursus') {
        const formationIds = libraryView.formation !== 'all'
            ? [libraryView.formation]
            : allFormationsData.map(f => f.id).filter(Boolean);
        ({ orderMap, promoNames } = await getMergedCursusOrder(formationIds));
    }

    const sortCourses = (a, b) => {
        if (libraryView.sort === 'cursus') {
            const oa = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
            const ob = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
            if (oa !== ob) return oa - ob;
        } else if (libraryView.sort === 'recent') {
            const diff = libraryTimestampMs(b) - libraryTimestampMs(a);
            if (diff !== 0) return diff;
        }
        return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr');
    };

    const cursusInfoHtml = (libraryView.sort === 'cursus' && promoNames.length)
        ? `<p style="color: var(--text-muted, #888); font-size: 0.8rem; margin: 0 0 1rem;">Ordre du cursus : ${promoNames.map(n => `<strong>${n}</strong>`).join(' · ')}</p>`
        : '';

    // 3) Rendu : liste à plat ou groupes par bloc dépliables.
    if (libraryView.group !== 'bloc') {
        courses.sort(sortCourses);
        listContainer.innerHTML = cursusInfoHtml + courses.map(data => renderLibraryCourseCard(data, orderMap.get(data.id))).join('');
        return;
    }

    const groups = new Map(); // bloc -> courses[]
    courses.forEach(data => {
        const bloc = String(data.bloc || '').trim() || 'Sans bloc';
        if (!groups.has(bloc)) groups.set(bloc, []);
        groups.get(bloc).push(data);
    });
    groups.forEach(list => list.sort(sortCourses));

    const orderedGroups = Array.from(groups.entries()).sort((a, b) => {
        if (a[0] === 'Sans bloc') return 1;
        if (b[0] === 'Sans bloc') return -1;
        if (libraryView.sort === 'cursus') {
            const minOrder = list => list.reduce((min, c) => Math.min(min, orderMap.has(c.id) ? orderMap.get(c.id) : Infinity), Infinity);
            const ma = minOrder(a[1]);
            const mb = minOrder(b[1]);
            if (ma !== mb) return ma - mb;
        }
        return a[0].localeCompare(b[0], 'fr', { numeric: true });
    });

    // 8.0P.167.355 : blocs REPLIÉS par défaut + rendu PARESSEUX — les cartes
    // d'un bloc ne sont générées dans le DOM qu'à sa première ouverture
    // (recherche active = exception : peu de résultats, on déplie tout).
    const expandForSearch = Boolean(libraryView.search);

    listContainer.innerHTML = cursusInfoHtml + orderedGroups.map(([bloc, list], index) => `
        <details class="sbi-lib-bloc" data-lib-group="${index}"${expandForSearch ? ' open' : ''}>
            <summary class="sbi-lib-bloc-header">
                <span class="sbi-lib-bloc-chevron">▸</span>
                <span class="sbi-lib-bloc-title">${bloc}</span>
                <span class="sbi-lib-bloc-count">${list.length} cours · ${list.filter(c => c.actif).length} actif(s)</span>
            </summary>
            <div class="sbi-lib-bloc-body" data-lib-pending="1"></div>
        </details>`).join('');

    const renderGroupBody = (detailsEl) => {
        const body = detailsEl.querySelector('[data-lib-pending]');
        if (!body) return;
        const list = orderedGroups[Number(detailsEl.dataset.libGroup)]?.[1] || [];
        body.innerHTML = list.map(data => renderLibraryCourseCard(data, orderMap.get(data.id))).join('');
        body.removeAttribute('data-lib-pending');
    };

    listContainer.querySelectorAll('details.sbi-lib-bloc').forEach(detailsEl => {
        detailsEl.addEventListener('toggle', () => {
            if (detailsEl.open) renderGroupBody(detailsEl);
        });
        if (detailsEl.open) renderGroupBody(detailsEl);
    });
}

async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if (!listContainer) return;

    try {
        listContainer.innerHTML = '';
        // Bibliothèque = index léger (courseIndex) côté admin, pas tout le contenu.
        allCoursesData = await loadCoursesLibraryView({
            currentUid,
            currentUserProfile
        });

        await syncCourseTeacherTargetsIfAllowedOnce();

        if (isAdminLikeUser()) allCoursesData = allCoursesData.filter(courseData => !shouldHideDraftForAdmin(courseData));

        if (allCoursesData.length === 0) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours.</p>';
            refreshBlocsList();
            return;
        }

        wireLibraryFilters();
        await renderCoursesLibrary();

        refreshBlocsList();

    } catch (error) {
        console.error("[SBI Courses] Erreur chargement cours :", error);
        listContainer.innerHTML = '<p style="color:red; text-align:center;">Erreur système.</p>';
    }
}

window.duplicateCourse = async (id) => {
    if (confirm("Créer une copie identique de ce cours ?")) {
        try {
            const docSnap = await getDoc(doc(db, "courses", id));

            if (docSnap.exists()) {
                const data = docSnap.data();

                const copiedChapters = Array.isArray(data.chapitres) ? data.chapitres : [];
                const copiedFormations = Array.isArray(data.formations) ? data.formations : [];
                const copiedTargetFormationIds = Array.isArray(data.targetFormationIds) ? data.targetFormationIds : [];
                const copiedTargetTeacherIds = Array.isArray(data.targetTeacherIds) ? data.targetTeacherIds : [];

                const copyData = {
                    titre: data.titre + " (Copie)",
                    bloc: data.bloc || "",
                    actif: false,
                    statutValidation: "draft",
                    formations: copiedFormations,
                    targetFormationIds: copiedTargetFormationIds,
                    targetFormationTitles: Array.isArray(data.targetFormationTitles) ? data.targetFormationTitles : [],
                    targetStudents: [],
                    targetTeacherIds: copiedTargetTeacherIds,
                    auteurId: currentUid,
                    chapitres: copiedChapters,
                    dateCreation: serverTimestamp(),
                    ...buildLmsCourseFields({
                        chapters: copiedChapters,
                        selectedFormationRefs: copiedFormations,
                        targetFormationIds: copiedTargetFormationIds,
                        statutValidation: 'draft',
                        isActive: false
                    })
                };

                validateCourseDocumentSize(copyData);

                await addDoc(collection(db, "courses"), copyData);
                loadCourses();

                alert("Cours dupliqué avec succès.");
            }

        } catch (e) {
            alert(`${e.message || "Erreur lors de la duplication."}`);
        }
    }
};

window.deleteCourse = async (id) => {
    const verification = prompt(
        "ATTENTION : La suppression d'un cours est définitive.\n" +
        "Les médias Storage associés seront également supprimés s'ils ne sont utilisés par aucun autre cours.\n\n" +
        "Tapez 'SUPPRIMER' en majuscules pour confirmer :"
    );

    if (verification !== 'SUPPRIMER') {
        if (verification !== null) {
            alert("Suppression annulée. Vous n'avez pas tapé 'SUPPRIMER'.");
        }

        return;
    }

    try {
        const courseRef = doc(db, "courses", id);
        const courseSnap = await getDoc(courseRef);

        if (!courseSnap.exists()) {
            alert("Ce cours n'existe plus.");
            await loadCourses();
            return;
        }

        const courseData = courseSnap.data();

        const allCourses = await loadCoursesForMediaSafety({
            currentUid,
            currentUserProfile
        });

        const mediaDeleteResult = await deleteUnusedCourseMediaFromStorage({
            courseId: id,
            courseData,
            allCourses
        });

        // Notif serveur (course_deleted au prof si pending) AVANT la suppression
        // du doc, pour que la Cloud Function puisse encore le lire.
        await emitCourseWorkflowNotifications(id, 'deleted');
        await deleteDoc(courseRef);
        await loadCourses();

        let message = "Cours supprimé.";

        if (mediaDeleteResult.deleted > 0) {
            message += `\n${mediaDeleteResult.deleted} média(s) supprimé(s) de Firebase Storage.`;
        }

        if (mediaDeleteResult.skipped > 0) {
            message += `\n${mediaDeleteResult.skipped} média(s) conservé(s), car encore utilisé(s) par un autre cours.`;
        }

        if (mediaDeleteResult.failed > 0) {
            message += `\n${mediaDeleteResult.failed} média(s) n'ont pas pu être supprimé(s). Vérifie les règles Storage ou la console.`;
        }

        alert(message);

    } catch (error) {
        console.error("Erreur suppression cours :", error);
        alert(`Suppression impossible : ${error.message || "erreur inconnue."}`);
    }
};
