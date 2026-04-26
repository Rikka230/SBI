/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Formations et Accès
 * =======================================================================
 *
 * Étape 4.2.2 :
 * - médias sortis dans course-media-storage.js
 * - correction upload prof grâce à captureActiveMediaInputs()
 * - admin-courses.js allégé et plus maintenable
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
    formatBytes,
    MAX_IMAGE_FILE_BYTES,
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
    validateVideoFileForStorage
} from '/admin/js/course-media-storage.js';

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

const SVG_PREVIEW = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:8px;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const SVG_QUIZ_LIST = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-right:4px;"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;

            await loadUsersForAccess();
            await loadFormationsCategories();
            await loadCourses();

            const urlParams = new URLSearchParams(window.location.search);
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

        } else {
            window.location.replace('/login.html');
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);

    const cacheBtn = document.getElementById('btn-clear-cache');

    if (cacheBtn) {
        cacheBtn.addEventListener('click', () => {
            if (confirm('Vider le cache local ? Cela rechargera la page.')) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            }
        });
    }

    const btnDraft = document.getElementById('btn-save-draft');
    const btnSubmit = document.getElementById('btn-submit-validation');
    const btnSaveAdmin = document.getElementById('btn-save-course');

    if (btnDraft) btnDraft.addEventListener('click', () => saveCourseToFirebase('draft'));
    if (btnSubmit) btnSubmit.addEventListener('click', () => saveCourseToFirebase('submit'));
    if (btnSaveAdmin) btnSaveAdmin.addEventListener('click', () => saveCourseToFirebase('admin_save'));

    const btnAddChapter = document.getElementById('btn-add-chapter');
    if (btnAddChapter) btnAddChapter.addEventListener('click', () => createNewChapter('text'));

    const btnAddQuiz = document.getElementById('btn-add-quiz');
    if (btnAddQuiz) btnAddQuiz.addEventListener('click', () => createNewChapter('quiz'));

    const btnAddBloc = document.getElementById('btn-add-new-bloc');

    if (btnAddBloc) {
        btnAddBloc.addEventListener('click', () => {
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
        });
    }

    const newCourseBtn = document.getElementById('btn-trigger-new-course');
    if (newCourseBtn) newCourseBtn.addEventListener('click', window.prepareNewCourse);

    const addQuestionBtn = document.getElementById('btn-add-question');
    if (addQuestionBtn) addQuestionBtn.addEventListener('click', addQuizQuestion);

    const chapterTitle = document.getElementById('chapter-title');
    if (chapterTitle) chapterTitle.addEventListener('input', updateActiveTitle);

    const quizTitleInput = document.getElementById('quiz-title');
    if (quizTitleInput) quizTitleInput.addEventListener('input', updateActiveTitle);

    setupMediaInputs();
    setupFormationSearch();
    setupFormationModal();
});

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
            alert("⚠️ Veuillez enregistrer le cours comme brouillon une première fois avant de le visualiser !");
            return;
        }

        await saveCourseToFirebase('preview');
    });
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
                alert(`❌ ${error.message}`);
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
                alert(`❌ ${error.message}`);
            }
        });
    }
}

function setupFormationSearch() {
    const searchProfs = document.getElementById('search-profs');

    if (searchProfs) {
        searchProfs.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();

            document.querySelectorAll('#formation-profs-list .compact-user-row').forEach(row => {
                const nameSpan = row.querySelector('span');

                if (nameSpan) {
                    row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
                }
            });
        });
    }

    const searchStudents = document.getElementById('search-students');

    if (searchStudents) {
        searchStudents.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();

            document.querySelectorAll('#formation-students-list .compact-user-row').forEach(row => {
                const nameSpan = row.querySelector('span');

                if (nameSpan) {
                    row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
                }
            });
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
                loadFormationsCategories();

            } catch (err) {
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
                loadFormationsCategories();
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
    const snap = await getDocs(collection(db, "users"));
    allUsersForAccess = [];

    snap.forEach(d => allUsersForAccess.push({ id: d.id, ...d.data() }));

    currentUserProfile = allUsersForAccess.find(u => u.id === currentUid);
}

function getAccessibleFormations() {
    if (!currentUserProfile) return [];

    if (currentUserProfile.role === 'admin' || currentUserProfile.isGod) {
        return allFormationsData;
    }

    return allFormationsData.filter(form => form.profs && form.profs.includes(currentUid));
}

async function loadFormationsCategories() {
    const snap = await getDocs(collection(db, "formations"));
    allFormationsData = [];

    snap.forEach(d => allFormationsData.push({ id: d.id, ...d.data() }));

    renderFormationsList();
    renderFormationsPillsAndFilters();
}

function renderFormationsList() {
    const container = document.getElementById('formations-list-container');
    if (!container) return;

    container.innerHTML = '';

    const visibleFormations = getAccessibleFormations();

    if (visibleFormations.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1;">Aucune catégorie disponible pour votre compte.</p>';
        return;
    }

    visibleFormations.forEach(form => {
        const pCount = form.profs ? form.profs.length : 0;
        const sCount = form.students ? form.students.length : 0;

        let authorName = "Système";

        if (form.auteurId && allUsersForAccess.length > 0) {
            const authorObj = allUsersForAccess.find(u => u.id === form.auteurId);

            if (authorObj) {
                authorName = (authorObj.prenom || authorObj.nom)
                    ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim()
                    : authorObj.email;
            }
        }

        const html = `
            <div style="background: var(--bg-card); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;">
                <div style="margin-bottom: 1rem;">
                    <h3 style="margin-top: 0; margin-bottom: 0.2rem; color: var(--accent-blue);">${form.titre}</h3>
                    <p style="font-size: 0.75rem; color: #666; margin: 0 0 1rem 0; font-style: italic;">Créé par ${authorName}</p>

                    <p style="font-size: 0.85rem; color: var(--text-muted); margin:0; line-height: 1.4;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 4px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span style="vertical-align: middle;">${pCount} prof(s) assigné(s)</span>
                    </p>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin:0; margin-top: 6px;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span style="vertical-align: middle;">${sCount} élève(s) inscrit(s)</span>
                    </p>
                </div>
                <button class="action-btn btn-edit-formation" data-id="${form.id}" style="margin-bottom:0; justify-content:center;">Modifier les accès</button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.btn-edit-formation').forEach(btn => {
        btn.addEventListener('click', e => openFormationModal(e.target.dataset.id));
    });
}

window.openFormationModal = function(formationId) {
    const modal = document.getElementById('formation-modal');
    if (!modal) return;

    const profsContainer = document.getElementById('formation-profs-list');
    const studentsContainer = document.getElementById('formation-students-list');

    profsContainer.innerHTML = '';
    studentsContainer.innerHTML = '';

    document.getElementById('search-profs').value = '';
    document.getElementById('search-students').value = '';

    const targetForm = formationId ? allFormationsData.find(f => f.id === formationId) : null;

    document.getElementById('edit-formation-id').value = formationId || '';
    document.getElementById('formation-titre').value = targetForm ? targetForm.titre : '';
    document.getElementById('formation-modal-title').textContent = targetForm ? "Modifier la Catégorie" : "Créer une Catégorie";
    document.getElementById('delete-formation-zone').style.display = targetForm ? 'block' : 'none';

    allUsersForAccess.forEach(u => {
        if (u.role === 'admin' || u.isGod) return;

        const isChecked = targetForm && (
            (u.role === 'teacher' && targetForm.profs && targetForm.profs.includes(u.id)) ||
            (u.role === 'student' && targetForm.students && targetForm.students.includes(u.id))
        ) ? 'checked' : '';

        const name = (u.prenom || u.nom) ? `${u.prenom || ''} ${u.nom || ''}`.trim() : u.email;

        const checkboxHtml = `
            <div class="compact-user-row" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding-right: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1; margin: 0; cursor: pointer; overflow: hidden;">
                    <input type="checkbox" class="cb-formation-user compact-cb" data-uid="${u.id}" data-role="${u.role}" ${isChecked}>
                    <span style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;">
                        ${name}
                    </span>
                </label>
            </div>
        `;

        if (u.role === 'teacher') profsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
        else if (u.role === 'student') studentsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
    });

    modal.style.display = 'flex';
};

function renderFormationsPillsAndFilters() {
    const visibleFormations = getAccessibleFormations();

    const selector = document.getElementById('formations-selector');

    if (selector) {
        selector.innerHTML = '';

        visibleFormations.forEach(form => {
            selector.insertAdjacentHTML('beforeend', `<span class="formation-pill" data-val="${form.id}">${form.titre}</span>`);
        });

        document.querySelectorAll('.formation-pill').forEach(pill => {
            pill.addEventListener('click', (e) => e.target.classList.toggle('selected'));
        });
    }

    const filter = document.getElementById('library-formation-filter');

    if (filter) {
        filter.innerHTML = '<option value="all">Toutes les Catégories</option>';

        visibleFormations.forEach(form => {
            filter.insertAdjacentHTML('beforeend', `<option value="${form.id}">${form.titre}</option>`);
        });
    }
}

function refreshBlocsList() {
    const select = document.getElementById('course-bloc-select');
    if (!select) return;

    const currentVal = select.value;
    const blocsSet = new Set();

    allCoursesData.forEach(c => {
        if (c.bloc) blocsSet.add(c.bloc);
    });

    select.innerHTML = '<option value="">-- Aucun Bloc --</option>';

    Array.from(blocsSet).sort().forEach(bloc => {
        const opt = document.createElement('option');
        opt.value = bloc;
        opt.textContent = bloc;
        select.appendChild(opt);
    });

    if (currentVal && blocsSet.has(currentVal)) {
        select.value = currentVal;
    }
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

function addQuizQuestion() {
    const container = document.getElementById('quiz-questions-container');
    if (!container) return;

    const qIndex = container.children.length;

    const qHTML = `
        <div class="quiz-question-block" data-qindex="${qIndex}" style="background: var(--bg-card, #111); padding: 1.5rem; border: 1px solid var(--border-color, #333); border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" class="editor-action-btn" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red, #ff4a4a); cursor: pointer; font-size: 1.2rem;">&times;</button>
            <input type="text" class="q-title editor-input" placeholder="Votre question..." style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: var(--text-main, white); border: none; border-bottom: 1px solid var(--border-color, #555); outline: none; margin-bottom: 1rem;">
            <div class="q-options-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                    <input type="checkbox" class="q-correct-cb editor-input" value="0" checked>
                    <input type="text" class="q-opt editor-input" placeholder="Réponse 1" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                    <input type="checkbox" class="q-correct-cb editor-input" value="1">
                    <input type="text" class="q-opt editor-input" placeholder="Réponse 2" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                </label>
            </div>
            <button type="button" onclick="window.addOptionToQuestion(this)" class="editor-action-btn" style="margin-top:0.8rem; background:none; border:none; color:var(--accent-blue); cursor:pointer; font-size:0.85rem;">+ Ajouter un choix</button>
            <div style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; border-top: 1px solid var(--border-color, #333); padding-top: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez <strong>les</strong> bonnes réponses.</span>
                <input type="number" class="q-points editor-input" value="1" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', qHTML);
}

window.addOptionToQuestion = function(btn) {
    const container = btn.previousElementSibling;
    const optIndex = container.children.length;

    const html = `
        <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
            <input type="checkbox" class="q-correct-cb editor-input" value="${optIndex}">
            <input type="text" class="q-opt editor-input" placeholder="Nouvelle réponse" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
            <button type="button" onclick="this.parentElement.remove()" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer; padding: 0 5px;">&times;</button>
        </label>
    `;

    container.insertAdjacentHTML('beforeend', html);
};

function gatherQuizQuestions() {
    const questions = [];

    document.querySelectorAll('.quiz-question-block').forEach((block) => {
        const title = block.querySelector('.q-title').value.trim();
        const points = parseInt(block.querySelector('.q-points').value) || 1;
        const options = Array.from(block.querySelectorAll('.q-opt')).map(inp => inp.value.trim());
        const correctIndices = Array.from(block.querySelectorAll('.q-correct-cb:checked')).map(cb => parseInt(cb.value));

        if (title && options.length >= 2) {
            questions.push({
                question: title,
                options: options,
                correctIndices: correctIndices,
                points: points
            });
        }
    });

    return questions;
}

function renderQuizBuilder(questions) {
    const container = document.getElementById('quiz-questions-container');
    if (!container) return;

    container.innerHTML = '';

    questions.forEach((q, index) => {
        const indices = q.correctIndices || (q.correctIndex !== undefined ? [q.correctIndex] : []);

        const optionsHTML = q.options.map((opt, i) => `
            <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                <input type="checkbox" class="q-correct-cb editor-input" value="${i}" ${indices.includes(i) ? 'checked' : ''}>
                <input type="text" class="q-opt editor-input" value="${opt}" placeholder="Réponse ${i + 1}" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                ${i > 1 ? `<button type="button" onclick="this.parentElement.remove()" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer;">&times;</button>` : ''}
            </label>
        `).join('');

        const qHTML = `
        <div class="quiz-question-block" data-qindex="${index}" style="background: var(--bg-card, #111); padding: 1.5rem; border: 1px solid var(--border-color, #333); border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" class="editor-action-btn" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red, #ff4a4a); cursor: pointer; font-size: 1.2rem;">&times;</button>
            <input type="text" class="q-title editor-input" value="${q.question}" style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: var(--text-main, white); border: none; border-bottom: 1px solid var(--border-color, #555); outline: none; margin-bottom: 1rem;">
            <div class="q-options-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${optionsHTML}
            </div>
            <button type="button" onclick="window.addOptionToQuestion(this)" class="editor-action-btn" style="margin-top:0.8rem; background:none; border:none; color:var(--accent-blue); cursor:pointer; font-size:0.85rem;">+ Ajouter un choix</button>
            <div style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; border-top: 1px solid var(--border-color, #333); padding-top: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez <strong>les</strong> bonnes réponses.</span>
                <input type="number" class="q-points editor-input" value="${q.points}" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', qHTML);
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

async function resolveCourseValidationNotifications(courseId) {
    if (!courseId) return;

    try {
        const validationQuery = query(
            collection(db, "notifications"),
            where("type", "==", "course_validation")
        );

        const snapshot = await getDocs(validationQuery);
        const updates = [];

        snapshot.forEach((notifDoc) => {
            const data = notifDoc.data();

            if (data.courseId === courseId && data.status !== 'resolved') {
                updates.push(updateDoc(doc(db, "notifications", notifDoc.id), {
                    status: 'resolved',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: currentUid
                }));
            }
        });

        if (updates.length > 0) {
            await Promise.all(updates);
        }

    } catch (error) {
        console.warn("[SBI Courses] Impossible de résoudre les notifications de validation :", error);
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

    if (!title) {
        alert('⚠️ Veuillez entrer un titre global.');
        return;
    }

    if (currentChapters.length === 0) {
        alert('⚠️ Ajoutez au moins une étape.');
        return;
    }

    let finalStatut = editingCourseOriginalStatus || 'draft';
    let isActive = editingCourseOriginalActive === true;

    if (actionType === 'draft') {
        finalStatut = 'draft';
        isActive = false;

    } else if (actionType === 'submit') {
        if (!confirm("⚠️ ATTENTION : Une fois soumis à validation, ce cours sera verrouillé et vous ne pourrez plus le modifier pendant la durée de l'examen.\n\nConfirmer l'envoi ?")) {
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

        const courseData = {
            titre: title,
            bloc: bloc,
            actif: isActive,
            statutValidation: finalStatut,
            formations: selectedPills,
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

        await handleCourseNotifications({
            actionType,
            courseRefId,
            title,
            selectedPills,
            isPublishing,
            isRejecting
        });

        editingCourseOriginalStatus = finalStatut;
        editingCourseOriginalActive = isActive === true;
        window.editingCourseOriginalActive = editingCourseOriginalActive;

        await loadCourses();

        if (actionType === 'preview') {
            window.open(`/student/cours-viewer.html?id=${courseRefId}&preview=true`, '_blank');

        } else {
            showSaveConfirmation({ actionType, isPublishing, isRejecting, hadPendingMedia });

            if (typeof window.prepareNewCourse === 'function') window.prepareNewCourse();
            if (typeof window.switchCourseTab === 'function') window.switchCourseTab('tab-list');
        }

    } catch (error) {
        console.error("Erreur de sauvegarde :", error);
        alert(`❌ ${error.message || "Erreur de sauvegarde."}`);
    }
}

async function handleCourseNotifications({ actionType, courseRefId, title, selectedPills, isPublishing, isRejecting }) {
    if (actionType === 'submit') {
        await addDoc(collection(db, "notifications"), {
            type: 'course_validation',
            courseId: courseRefId,
            courseTitle: title,
            auteurId: currentUid,
            auteurName: (currentUserProfile.prenom || '') + ' ' + (currentUserProfile.nom || ''),
            dateCreation: serverTimestamp(),
            status: 'open',
            dismissedBy: []
        });
    }

    if (isPublishing) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await addDoc(collection(db, "notifications"), {
                type: 'course_approved',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }

        const targetStudentsSet = new Set();

        selectedPills.forEach(formId => {
            const formObj = allFormationsData.find(f => f.id === formId || f.titre === formId);

            if (formObj && formObj.students) {
                formObj.students.forEach(s => targetStudentsSet.add(s));
            }
        });

        const targetStudentsArray = Array.from(targetStudentsSet);

        if (targetStudentsArray.length > 0) {
            await addDoc(collection(db, "notifications"), {
                type: 'new_course_published',
                courseId: courseRefId,
                courseTitle: title,
                targetStudents: targetStudentsArray,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }

    } else if (isRejecting) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await addDoc(collection(db, "notifications"), {
                type: 'course_rejected',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }
    }

    if (isPublishing || isRejecting) {
        await resolveCourseValidationNotifications(courseRefId);
    }
}

function showSaveConfirmation({ actionType, isPublishing, isRejecting, hadPendingMedia }) {
    if (isPublishing) {
        alert("✅ Le cours a été publié ! Les notifications ont été envoyées au professeur et aux élèves.");
        return;
    }

    if (isRejecting) {
        alert("❌ Le cours a été refusé. Le professeur a été notifié.");
        return;
    }

    if (hadPendingMedia) {
        alert(actionType === 'submit'
            ? '✅ Cours envoyé pour validation ! Médias envoyés dans Storage.'
            : '✅ Cours sauvegardé ! Médias envoyés dans Storage.'
        );
        return;
    }

    alert(actionType === 'submit' ? '✅ Cours envoyé pour validation !' : '✅ Cours sauvegardé !');
}

async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if (!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        listContainer.innerHTML = '';
        allCoursesData = [];

        if (querySnapshot.empty) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId = docSnap.id;

            allCoursesData.push({ id: courseId, ...data });

            let statusHtml = '';

            if (data.statutValidation === 'pending') {
                statusHtml = `<span style="color: var(--accent-yellow, #fbbc04); font-weight: bold; font-size: 0.8rem;">⏳ EN ATTENTE</span>`;
            } else {
                statusHtml = data.actif
                    ? `<span style="color: var(--accent-green, #10b981); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>`
                    : `<span style="color: var(--accent-red, #ff4a4a); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            }

            const tagsHtml = data.formations
                ? data.formations.map(fId => {
                    const formObj = allFormationsData.find(f => f.id === fId || f.titre === fId);
                    const displayName = formObj ? formObj.titre : fId;

                    return `<span class="tag" style="background: var(--bg-body, #222); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; border: 1px solid var(--border-color, #444);">📁 ${displayName}</span>`;
                }).join(' ')
                : '';

            const blocHtml = data.bloc
                ? `<span style="color: var(--accent-blue); font-size: 0.8rem; border: 1px solid var(--accent-blue); padding: 2px 8px; border-radius: 12px; margin-left: 10px;">${data.bloc}</span>`
                : '';

            const nbChapitres = data.chapitres ? data.chapitres.length : 0;
            const authorName = getAuthorName(data.auteurId);

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
                    <button class="action-btn" style="width: auto; margin: 0; color: var(--accent-yellow, #fbbc04); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.duplicateCourse('${courseId}')" title="Créer une copie">Copier</button>
                    <button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.editCourse('${courseId}')">Éditer</button>
                    <button class="action-btn danger" style="width: auto; margin: 0;" onclick="window.deleteCourse('${courseId}')">❌</button>
                </div>
            </div>`;

            listContainer.insertAdjacentHTML('beforeend', html);
        });

        refreshBlocsList();

    } catch (error) {
        listContainer.innerHTML = '<p style="color:red; text-align:center;">Erreur système.</p>';
    }
}

function getAuthorName(authorId) {
    if (!authorId || allUsersForAccess.length === 0) return "Système";

    const authorObj = allUsersForAccess.find(u => u.id === authorId);

    if (!authorObj) return "Système";

    return (authorObj.prenom || authorObj.nom)
        ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim()
        : authorObj.email;
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

                alert("✅ Cours dupliqué avec succès !");
            }

        } catch (e) {
            alert(`❌ ${e.message || "Erreur lors de la duplication."}`);
        }
    }
};

window.deleteCourse = async (id) => {
    const verification = prompt("⚠️ ATTENTION : La suppression d'un cours est définitive.\nTapez 'SUPPRIMER' en majuscules pour confirmer :");

    if (verification === 'SUPPRIMER') {
        await deleteDoc(doc(db, "courses", id));
        loadCourses();
    } else if (verification !== null) {
        alert("Suppression annulée. Vous n'avez pas tapé 'SUPPRIMER'.");
    }
};
