/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Formations et Accès
 * =======================================================================
 *
 * Étape 5.2.4 : Query-safe consolidation.
 * =======================================================================
 */
import { db, auth } from '/js/firebase-init.js';
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
import { logoutUser } from '/js/auth.js';
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
    validateCourseDocumentSize,
    validateVideoFileForStorage,
    deleteUnusedCourseMediaFromStorage
} from '/admin/js/course-media-storage.js';
import {
    syncUserFormationIndexesFromData
} from '/admin/js/user-formation-index.js';
import {
    loadUsersForCourseAccess,
    loadFormationsForCourseAccess,
    loadCoursesForCourseAccess,
    loadCoursesForMediaSafety
} from '/admin/js/course-data-access.js';
import { renderCourseActionButtons } from '/admin/js/course-action-buttons.js';
import { notifyCourseDeletedIfNeeded } from '/admin/js/course-delete-notifications.js';
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
import {
    resolveCourseValidationNotifications as resolveCourseValidationNotificationsService,
    handleCourseNotifications as handleCourseNotificationsService
} from '/admin/js/courses/course-notifications.js';
import { getCourseTargetingSnapshot } from '/admin/js/courses/course-targeting.js';
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

function renderFormationsPillsAndFilters() {
    renderFormationsPillsAndFiltersUi(courseUiState);
}

function refreshBlocsList() {
    refreshBlocsListUi(courseUiState);
}

async function resolveCourseValidationNotifications(courseId) {
    return resolveCourseValidationNotificationsService({ courseId, currentUid });
}

async function handleCourseNotifications(args) {
    return handleCourseNotificationsService({
        ...args,
        currentUid,
        currentUserProfile,
        editingCourseAuthorId,
        allFormationsData
    });
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
                window.editCourse(editId);

                if (typeof window.switchCourseTab === 'function') {
                    window.history.replaceState({}, document.title, window.location.pathname + "?tab=tab-editor");
                }
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
    bindCourseEvent(newCourseBtn, 'click', window.prepareNewCourse, cleanups);

    const addQuestionBtn = document.getElementById('btn-add-question');
    bindCourseEvent(addQuestionBtn, 'click', addQuizQuestion, cleanups);

    const chapterTitle = document.getElementById('chapter-title');
    bindCourseEvent(chapterTitle, 'input', updateActiveTitle, cleanups);

    const quizTitleInput = document.getElementById('quiz-title');
    bindCourseEvent(quizTitleInput, 'input', updateActiveTitle, cleanups);

    setupMediaInputs();
    setupFormationSearch();
    setupFormationModal();

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

function setupMediaInputs() {
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
    editingCourseAuthorId = null;
    editingCourseOriginalStatus = null;
    editingCourseOriginalActive = false;
    window.editingCourseOriginalActive = false;

    clearAllPendingMedia();

    const editCourseIdEl = document.getElementById('edit-course-id');
    if (editCourseIdEl) editCourseIdEl.value = '';

    const courseTitleEl = document.getElementById('course-title');
    if (courseTitleEl) courseTitleEl.value = '';

    const selectBloc = document.getElementById('course-bloc-select');
    if (selectBloc) selectBloc.value = '';

    currentChapters = [];
    activeChapterId = null;

    document.querySelectorAll('.formation-pill').forEach(p => p.classList.remove('selected'));

    const noChapterZone = document.getElementById('no-chapter-zone');
    if (noChapterZone) noChapterZone.style.display = 'flex';

    const chapterEditorZone = document.getElementById('chapter-editor-zone');
    if (chapterEditorZone) chapterEditorZone.style.display = 'none';

    const quizEditorZone = document.getElementById('quiz-editor-zone');
    if (quizEditorZone) quizEditorZone.style.display = 'none';

    const warningBanner = document.getElementById('lock-warning-banner');
    if (warningBanner) warningBanner.style.display = 'none';

    document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
        el.disabled = false;
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
    });

    if (window.quill) window.quill.enable(true);

    renderChaptersList();

    if (typeof window.switchCourseTab === 'function') {
        window.switchCourseTab('tab-editor');
    }
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
    try {
        const docSnap = await getDoc(doc(db, "courses", id));

        if (docSnap.exists()) {
            const data = docSnap.data();

            clearAllPendingMedia();

            const editCourseIdEl = document.getElementById('edit-course-id');
            if (editCourseIdEl) editCourseIdEl.value = id;

            const courseTitleEl = document.getElementById('course-title');
            if (courseTitleEl) courseTitleEl.value = data.titre || '';

            const activeCb = document.getElementById('course-active');
            if (activeCb) activeCb.checked = data.actif;

            const selectBloc = document.getElementById('course-bloc-select');
            if (selectBloc) selectBloc.value = data.bloc || '';

            editingCourseAuthorId = data.auteurId || currentUid;
            editingCourseOriginalStatus = data.statutValidation || 'approved';
            editingCourseOriginalActive = data.actif === true;
            window.editingCourseOriginalActive = editingCourseOriginalActive;

            document.querySelectorAll('.formation-pill').forEach(pill => {
                const val = pill.getAttribute('data-val');

                if (data.formations && (data.formations.includes(val) || data.formations.includes(pill.textContent))) {
                    pill.classList.add('selected');
                } else {
                    pill.classList.remove('selected');
                }
            });

            currentChapters = data.chapitres || [];

            if (typeof window.switchCourseTab === 'function') {
                window.switchCourseTab('tab-editor');
            }

            handleEditorLockState();
            handleRejectButtonVisibility();

            if (currentChapters.length > 0) selectChapter(currentChapters[0].id);
            else renderChaptersList();
        }

    } catch (error) {
        console.error(error);
        alert("Impossible de charger le cours.");
    }
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

        const courseData = {
            titre: title,
            bloc: bloc,
            actif: isActive,
            statutValidation: finalStatut,
            formations: selectedPills,
            targetFormationIds,
            targetFormationTitles,
            targetStudents: targetStudentsForCourse,
            auteurId: finalAuteurId,
            chapitres: currentChapters
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
            await handleCourseNotifications({
                actionType,
                courseRefId,
                title,
                selectedPills,
                targetStudentsForCourse,
                targetFormationIds,
                targetFormationTitles,
                isPublishing,
                isRejecting,
                currentUid,
                currentUserProfile,
                editingCourseAuthorId: finalAuteurId,
                allFormationsData
            });
        } catch (notificationError) {
            console.warn("[SBI Courses] Cours sauvegardé, mais notification non envoyée :", notificationError);
        }

        editingCourseOriginalStatus = finalStatut;
        editingCourseOriginalActive = isActive === true;
        window.editingCourseOriginalActive = editingCourseOriginalActive;

        await loadCourses();

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

async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if (!listContainer) return;

    try {
        listContainer.innerHTML = '';
        allCoursesData = await loadCoursesForCourseAccess({
            currentUid,
            currentUserProfile
        });

        if (isAdminLikeUser()) allCoursesData = allCoursesData.filter(courseData => !shouldHideDraftForAdmin(courseData));

        if (allCoursesData.length === 0) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours.</p>';
            refreshBlocsList();
            return;
        }

        allCoursesData.forEach((data) => {
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

            const blocHtml = data.bloc
                ? `<span style="color: var(--accent-blue); font-size: 0.8rem; border: 1px solid var(--accent-blue); padding: 2px 8px; border-radius: 12px; margin-left: 10px;">${data.bloc}</span>`
                : '';

            const nbChapitres = data.chapitres ? data.chapitres.length : 0;
            const authorName = getAuthorName(data.auteurId, data);
            const actionButtonsHtml = renderCourseActionButtons({ courseId, courseData: data, currentUid, isAdminLike: isAdminLikeUser() });

            const html = `
            <div style="background: var(--bg-card, #111); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color, #333); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; opacity: ${data.actif ? '1' : '0.6'};">
                <div>
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        ${statusHtml}
                        <h3 style="margin: 0; display: flex; align-items: center; color: var(--text-main, white);">
                            ${data.titre}
                            ${blocHtml}
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

            listContainer.insertAdjacentHTML('beforeend', html);
        });

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

                const copyData = {
                    titre: data.titre + " (Copie)",
                    bloc: data.bloc || "",
                    actif: false,
                    statutValidation: "draft",
                    formations: data.formations,
                    auteurId: currentUid,
                    chapitres: data.chapitres,
                    dateCreation: serverTimestamp()
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

        await notifyCourseDeletedIfNeeded({ courseId: id, courseData, currentUid });
        await resolveCourseValidationNotifications(id);
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
