/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Formations et Accès
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { logoutUser } from '/js/auth.js';

let currentUid = null;
let currentUserProfile = null; 
let currentChapters = [];
let activeChapterId = null;

let allFormationsData = [];
let allUsersForAccess = [];
let allCoursesData = []; 

let editingCourseAuthorId = null;
let editingCourseOriginalStatus = null;

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
                window.history.replaceState({}, document.title, window.location.pathname + "?tab=tab-editor");
            }
            
            if (!document.getElementById('btn-preview-course')) {
                // Ajoute le bouton de preview sous les nouveaux boutons ou le bouton principal
                const targetBtn = document.getElementById('btn-submit-validation') || document.getElementById('btn-save-course');
                if (targetBtn) {
                    targetBtn.insertAdjacentHTML('afterend', `<button id="btn-preview-course" class="action-btn" style="width: 100%; margin-top: 1rem; background: transparent; color: var(--text-main); border: 1px solid var(--border-color); padding: 1rem; font-size: 1rem; cursor: pointer; transition: 0.2s; font-weight:bold;">${SVG_PREVIEW} Visualiser le rendu actuel</button>`);
                    
                    document.getElementById('btn-preview-course').addEventListener('click', async () => {
                        const cId = document.getElementById('edit-course-id').value;
                        if (!cId) {
                            alert("⚠️ Veuillez enregistrer le cours comme Brouillon une première fois avant de le visualiser !");
                            return;
                        }
                        await saveCourseToFirebase('preview');
                    });
                }
            }

            setupDropZone('drop-zone-image', 'chapter-image-upload');
            setupDropZone('drop-zone-video', 'chapter-video-upload');

        } else {
            window.location.replace('/login.html');
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', logoutUser);
    
    const cacheBtn = document.getElementById('btn-clear-cache');
    if(cacheBtn) cacheBtn.addEventListener('click', () => {
        if(confirm('Vider le cache local ? Cela rechargera la page.')) {
            localStorage.clear(); sessionStorage.clear(); window.location.reload(true);
        }
    });

    // FIX : Écouteurs pour les NOUVEAUX boutons Brouillon / Soumettre
    const btnDraft = document.getElementById('btn-save-draft');
    const btnSubmit = document.getElementById('btn-submit-validation');
    const btnSaveAdmin = document.getElementById('btn-save-course'); // Pour l'interface Admin qui garde 1 seul bouton

    if(btnDraft) btnDraft.addEventListener('click', () => saveCourseToFirebase('draft'));
    if(btnSubmit) btnSubmit.addEventListener('click', () => saveCourseToFirebase('submit'));
    if(btnSaveAdmin) btnSaveAdmin.addEventListener('click', () => saveCourseToFirebase('admin_save'));

    document.getElementById('btn-add-chapter').addEventListener('click', () => createNewChapter('text'));
    document.getElementById('btn-add-quiz').addEventListener('click', () => createNewChapter('quiz'));
    
    document.getElementById('btn-add-new-bloc').addEventListener('click', () => {
        const newBlocName = prompt("Entrez le nom du nouveau bloc :");
        if (newBlocName && newBlocName.trim() !== "") {
            const select = document.getElementById('course-bloc-select');
            const option = document.createElement('option');
            option.value = newBlocName.trim();
            option.textContent = newBlocName.trim();
            select.appendChild(option);
            select.value = newBlocName.trim();
        }
    });

    const newCourseBtn = document.getElementById('btn-trigger-new-course');
    if(newCourseBtn) newCourseBtn.addEventListener('click', window.prepareNewCourse);

    const addQuestionBtn = document.getElementById('btn-add-question');
    if (addQuestionBtn) addQuestionBtn.addEventListener('click', addQuizQuestion);

    document.getElementById('chapter-title').addEventListener('input', updateActiveTitle);
    const quizTitleInput = document.getElementById('quiz-title');
    if (quizTitleInput) quizTitleInput.addEventListener('input', updateActiveTitle);

    function updateActiveTitle(e) {
        if(activeChapterId) {
            const chap = currentChapters.find(c => c.id === activeChapterId);
            if(chap) { chap.titre = e.target.value; renderChaptersList(); }
        }
    }

    const imgUpload = document.getElementById('chapter-image-upload');
    if (imgUpload) {
        imgUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if(!file) return;
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/webp', 0.85);
                document.getElementById('chapter-image-base64').value = dataUrl;
                const preview = document.getElementById('chapter-image-preview');
                preview.src = dataUrl; preview.style.display = 'block';
            };
        });
    }

    const vidUpload = document.getElementById('chapter-video-upload');
    if (vidUpload) {
        vidUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(!file) return;
            if(file.size > 1048576) { alert("⚠️ Limite Firestore de 1Mo atteinte."); }
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('chapter-video-base64').value = event.target.result;
                const preview = document.getElementById('chapter-video-preview');
                preview.src = event.target.result; preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
    }

    document.getElementById('search-profs').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#formation-profs-list .compact-user-row').forEach(row => {
            const nameSpan = row.querySelector('span');
            if(nameSpan) {
                row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
            }
        });
    });

    document.getElementById('search-students').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#formation-students-list .compact-user-row').forEach(row => {
            const nameSpan = row.querySelector('span');
            if(nameSpan) {
                row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
            }
        });
    });

    document.getElementById('btn-create-formation').addEventListener('click', () => openFormationModal(null));
    document.getElementById('close-formation-modal-btn').addEventListener('click', () => document.getElementById('formation-modal').style.display='none');
    
    document.getElementById('formation-form').addEventListener('submit', async (e) => {
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
        } catch(err) { alert('Erreur de sauvegarde'); }
    });

    document.getElementById('delete-formation-btn').addEventListener('click', async () => {
        const formId = document.getElementById('edit-formation-id').value;
        if(confirm('DANGER : Supprimer cette catégorie ? (Les cours associés perdront leur tag).')) {
            await deleteDoc(doc(db, "formations", formId));
            document.getElementById('formation-modal').style.display = 'none';
            loadFormationsCategories();
        }
    });
});

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
    snap.forEach(d => allUsersForAccess.push({id: d.id, ...d.data()}));
    currentUserProfile = allUsersForAccess.find(u => u.id === currentUid);
}

function getAccessibleFormations() {
    if (!currentUserProfile) return [];
    if (currentUserProfile.role === 'admin' || currentUserProfile.isGod) return allFormationsData;
    return allFormationsData.filter(form => form.profs && form.profs.includes(currentUid));
}

async function loadFormationsCategories() {
    const snap = await getDocs(collection(db, "formations"));
    allFormationsData = [];
    snap.forEach(d => allFormationsData.push({id: d.id, ...d.data()}));
    
    renderFormationsList(); 
    renderFormationsPillsAndFilters(); 
}

function renderFormationsList() {
    const container = document.getElementById('formations-list-container');
    if(!container) return;
    container.innerHTML = '';
    
    const visibleFormations = getAccessibleFormations();
    
    if(visibleFormations.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1;">Aucune catégorie disponible pour votre compte.</p>'; 
        return;
    }

    visibleFormations.forEach(form => {
        const pCount = form.profs ? form.profs.length : 0;
        const sCount = form.students ? form.students.length : 0;

        let authorName = "Système";
        if (form.auteurId && allUsersForAccess.length > 0) {
            const authorObj = allUsersForAccess.find(u => u.id === form.auteurId);
            if (authorObj) authorName = (authorObj.prenom || authorObj.nom) ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim() : authorObj.email;
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
    const profsContainer = document.getElementById('formation-profs-list');
    const studentsContainer = document.getElementById('formation-students-list');
    
    profsContainer.innerHTML = ''; studentsContainer.innerHTML = '';
    document.getElementById('search-profs').value = '';
    document.getElementById('search-students').value = '';

    let targetForm = formationId ? allFormationsData.find(f => f.id === formationId) : null;
    
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
                <a href="admin-profile.html?id=${u.id}" target="_blank" title="Ouvrir le profil" onclick="event.stopPropagation()" style="color: var(--text-muted); display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='var(--text-muted)'">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                </a>
            </div>
        `;

        if (u.role === 'teacher') profsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
        else if (u.role === 'student') studentsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
    });

    modal.style.display = 'flex';
}

function renderFormationsPillsAndFilters() {
    const visibleFormations = getAccessibleFormations();

    const selector = document.getElementById('formations-selector');
    if(selector) {
        selector.innerHTML = '';
        visibleFormations.forEach(form => {
            selector.insertAdjacentHTML('beforeend', `<span class="formation-pill" data-val="${form.id}">${form.titre}</span>`);
        });
        document.querySelectorAll('.formation-pill').forEach(pill => {
            pill.addEventListener('click', (e) => e.target.classList.toggle('selected'));
        });
    }

    const filter = document.getElementById('library-formation-filter');
    if(filter) {
        filter.innerHTML = '<option value="all">Toutes les Catégories</option>';
        visibleFormations.forEach(form => {
            filter.insertAdjacentHTML('beforeend', `<option value="${form.id}">${form.titre}</option>`);
        });
    }
}

function refreshBlocsList() {
    const select = document.getElementById('course-bloc-select');
    const currentVal = select.value;
    
    const blocsSet = new Set();
    allCoursesData.forEach(c => { if(c.bloc) blocsSet.add(c.bloc); });
    
    select.innerHTML = '<option value="">-- Aucun Bloc --</option>';
    Array.from(blocsSet).sort().forEach(bloc => {
        const opt = document.createElement('option');
        opt.value = bloc; opt.textContent = bloc;
        select.appendChild(opt);
    });
    
    if(currentVal && blocsSet.has(currentVal)) select.value = currentVal;
}

window.prepareNewCourse = function() {
    editingCourseAuthorId = null;
    editingCourseOriginalStatus = null;

    document.getElementById('edit-course-id').value = '';
    document.getElementById('course-title').value = '';
    document.getElementById('course-bloc-select').value = ''; 
    currentChapters = [];
    activeChapterId = null;
    document.querySelectorAll('.formation-pill').forEach(p => p.classList.remove('selected'));
    
    document.getElementById('no-chapter-zone').style.display = 'flex';
    document.getElementById('chapter-editor-zone').style.display = 'none';
    document.getElementById('quiz-editor-zone').style.display = 'none';
    
    // Reset les verrous visuels
    document.getElementById('lock-warning-banner').style.display = 'none';
    document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
        el.disabled = false;
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
    });
    if(window.quill) window.quill.enable(true);
    
    renderChaptersList();
    window.switchCourseTab('tab-editor');
};

function createNewChapter(type) {
    saveCurrentChapterContent();
    const newId = 'chap_' + Date.now().toString();
    const newChap = {
        id: newId,
        type: type,
        titre: type === 'quiz' ? `Examen` : `Leçon ${currentChapters.filter(c=>c.type==='text').length + 1}`,
        contenu: '',
        mediaType: 'image', mediaImage: '', mediaVideo: '', questions: [] 
    };
    currentChapters.push(newChap);
    selectChapter(newId);
}

function saveCurrentChapterContent() {
    if(!activeChapterId) return;
    const chap = currentChapters.find(c => c.id === activeChapterId);
    if(!chap) return;

    if (chap.type === 'text') {
        chap.titre = document.getElementById('chapter-title').value;
        chap.mediaType = document.querySelector('input[name="media_type"]:checked').value;
        chap.mediaImage = document.getElementById('chapter-image-base64').value;
        chap.mediaVideo = document.getElementById('chapter-video-base64').value;
        chap.contenu = window.quill ? window.quill.root.innerHTML : '';
    } else if (chap.type === 'quiz') {
        chap.titre = document.getElementById('quiz-title').value;
        chap.questions = gatherQuizQuestions(); 
    }
}

window.selectChapter = function(id) {
    saveCurrentChapterContent(); 
    activeChapterId = id;
    const chap = currentChapters.find(c => c.id === id);
    if(!chap) return;

    document.getElementById('no-chapter-zone').style.display = 'none';

    if (chap.type === 'quiz') {
        document.getElementById('chapter-editor-zone').style.display = 'none';
        document.getElementById('quiz-editor-zone').style.display = 'flex';
        document.getElementById('quiz-title').value = chap.titre || '';
        renderQuizBuilder(chap.questions || []);
    } else {
        document.getElementById('quiz-editor-zone').style.display = 'none';
        document.getElementById('chapter-editor-zone').style.display = 'flex';
        
        document.getElementById('chapter-title').value = chap.titre || '';

        if(chap.mediaType === 'video') {
            document.querySelector('input[name="media_type"][value="video"]').checked = true;
            document.getElementById('media-image-zone').style.display = 'none';
            document.getElementById('media-video-zone').style.display = 'flex';
        } else {
            document.querySelector('input[name="media_type"][value="image"]').checked = true;
            document.getElementById('media-image-zone').style.display = 'flex';
            document.getElementById('media-video-zone').style.display = 'none';
        }
        
        document.getElementById('chapter-video-base64').value = chap.mediaVideo || '';
        const vPreview = document.getElementById('chapter-video-preview');
        if(chap.mediaVideo) { vPreview.src = chap.mediaVideo; vPreview.style.display = 'block'; } 
        else { vPreview.style.display = 'none'; }

        document.getElementById('chapter-image-base64').value = chap.mediaImage || '';
        const iPreview = document.getElementById('chapter-image-preview');
        if(chap.mediaImage) { iPreview.src = chap.mediaImage; iPreview.style.display = 'block'; } 
        else { iPreview.style.display = 'none'; }

        if(window.quill) {
            window.quill.setContents([]);
            window.quill.clipboard.dangerouslyPasteHTML(chap.contenu || '');
        }
    }
    renderChaptersList();
}

window.deleteChapter = function(id, event) {
    event.stopPropagation();
    if(confirm('Supprimer cette étape ?')) {
        currentChapters = currentChapters.filter(c => c.id !== id);
        if(activeChapterId === id) {
            activeChapterId = null;
            document.getElementById('no-chapter-zone').style.display = 'flex';
            document.getElementById('chapter-editor-zone').style.display = 'none';
            document.getElementById('quiz-editor-zone').style.display = 'none';
        }
        renderChaptersList();
    }
}

function renderChaptersList() {
    const list = document.getElementById('chapters-list');
    if(!list) return;
    list.innerHTML = '';
    
    currentChapters.forEach((chap, index) => {
        const isActive = chap.id === activeChapterId;
        
        const bg = isActive ? 'var(--accent-blue-light, rgba(42, 87, 255, 0.1))' : 'var(--bg-card, #111)';
        const border = isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-color, #333)';
        let color = chap.type === 'quiz' ? 'var(--accent-yellow, #fbbc04)' : (isActive ? 'var(--accent-blue)' : 'var(--text-main, white)');

        let icon = chap.type === 'quiz' ? SVG_QUIZ_LIST : `${index + 1}. `;

        const li = `
            <li onclick="selectChapter('${chap.id}')" style="padding: 0.8rem; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: ${color}; font-weight: ${isActive ? 'bold' : 'normal'};">
                <span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${icon}${chap.titre}</span>
                <button onclick="deleteChapter('${chap.id}', event)" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer;">&times;</button>
            </li>
        `;
        list.insertAdjacentHTML('beforeend', li);
    });
}

function addQuizQuestion() {
    const container = document.getElementById('quiz-questions-container');
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
                <input type="number" class="q-points editor-input" value="1" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;"> <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
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
}

function gatherQuizQuestions() {
    const questions = [];
    document.querySelectorAll('.quiz-question-block').forEach((block) => {
        const title = block.querySelector('.q-title').value.trim();
        const points = parseInt(block.querySelector('.q-points').value) || 1;
        const options = Array.from(block.querySelectorAll('.q-opt')).map(inp => inp.value.trim());
        const correctIndices = Array.from(block.querySelectorAll('.q-correct-cb:checked')).map(cb => parseInt(cb.value));

        if(title && options.length >= 2) {
            questions.push({ question: title, options: options, correctIndices: correctIndices, points: points });
        }
    });
    return questions;
}

function renderQuizBuilder(questions) {
    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '';
    
    questions.forEach((q, index) => {
        const indices = q.correctIndices || (q.correctIndex !== undefined ? [q.correctIndex] : []);
        const optionsHTML = q.options.map((opt, i) => `
            <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                <input type="checkbox" class="q-correct-cb editor-input" value="${i}" ${indices.includes(i) ? 'checked' : ''}>
                <input type="text" class="q-opt editor-input" value="${opt}" placeholder="Réponse ${i+1}" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
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
                <input type="number" class="q-points editor-input" value="${q.points}" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;"> <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', qHTML);
    });
}

// FIX : Intégration des boutons Draft, Submit et Preview
async function saveCourseToFirebase(actionType = 'admin_save') {
    saveCurrentChapterContent(); 
    
    const courseId = document.getElementById('edit-course-id').value;
    const title = document.getElementById('course-title').value.trim();
    const bloc = document.getElementById('course-bloc-select').value.trim(); 
    
    const selectedPills = Array.from(document.querySelectorAll('.formation-pill.selected')).map(p => p.getAttribute('data-val'));

    if (!title) { alert('⚠️ Veuillez entrer un Titre Global.'); return; }
    if (currentChapters.length === 0) { alert('⚠️ Ajoutez au moins une étape.'); return; }

    const isTeacher = currentUserProfile && currentUserProfile.role === 'teacher';
    
    // Définition du statut selon l'action cliquée
    let finalStatut = editingCourseOriginalStatus || 'draft';
    let isActive = false;

    if (actionType === 'draft') {
        finalStatut = 'draft';
    } else if (actionType === 'submit') {
        if (!confirm("⚠️ ATTENTION : Une fois soumis à validation, ce cours sera verrouillé et vous ne pourrez plus le modifier pendant la durée de l'examen.\n\nConfirmer l'envoi ?")) {
            return;
        }
        finalStatut = 'pending';
    } else if (actionType === 'admin_save') {
        // Le bouton classique de l'admin (Garde la checkbox)
        const activeCheckbox = document.getElementById('course-active');
        if (activeCheckbox) isActive = activeCheckbox.checked;
        finalStatut = isActive ? 'approved' : 'draft';
    } else if (actionType === 'preview') {
        // En preview, on garde le statut actuel sans rien casser
    }

    const finalAuteurId = courseId ? editingCourseAuthorId : currentUid;

    try {
        const courseData = {
            titre: title,
            bloc: bloc,
            actif: isActive,
            statutValidation: finalStatut,
            formations: selectedPills,
            auteurId: finalAuteurId,
            chapitres: currentChapters
        };

        let courseRefId = courseId;

        if (courseId) {
            await updateDoc(doc(db, "courses", courseId), courseData);
            if (actionType !== 'preview') alert(actionType === 'submit' ? '✅ Cours envoyé pour validation !' : '✅ Cours sauvegardé !');
        } else {
            courseData.dateCreation = serverTimestamp();
            const docRef = await addDoc(collection(db, "courses"), courseData);
            courseRefId = docRef.id;
            document.getElementById('edit-course-id').value = courseRefId;
            if (actionType !== 'preview') alert(actionType === 'submit' ? '✅ Cours envoyé pour validation !' : '✅ Brouillon créé !');
        }
        
        // Notifications : Si on modifie ou soumet (et pas juste un brouillon invisible ou une preview)
        if (actionType === 'submit') {
            await addDoc(collection(db, "notifications"), {
                type: 'course_validation',
                courseId: courseRefId,
                courseTitle: title,
                auteurId: currentUid,
                auteurName: (currentUserProfile.prenom || '') + ' ' + (currentUserProfile.nom || ''),
                dateCreation: serverTimestamp(),
            });
        }
        
        await loadCourses();
        
        if (actionType === 'preview') {
            window.open(`/student/cours-viewer.html?id=${courseRefId}&preview=true`, '_blank');
        } else {
            window.prepareNewCourse(); 
            window.switchCourseTab('tab-list');
        }

    } catch (error) {
        alert("❌ Erreur de sauvegarde.");
    }
}

async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if(!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        listContainer.innerHTML = '';
        allCoursesData = [];
        
        if(querySnapshot.empty) {
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
                statusHtml = data.actif ? `<span style="color: var(--accent-green, #10b981); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>` : `<span style="color: var(--accent-red, #ff4a4a); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            }

            const tagsHtml = data.formations ? data.formations.map(fId => {
                const formObj = allFormationsData.find(f => f.id === fId || f.titre === fId); 
                const displayName = formObj ? formObj.titre : fId;
                return `<span class="tag" style="background: var(--bg-body, #222); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; border: 1px solid var(--border-color, #444);">📁 ${displayName}</span>`;
            }).join(' ') : '';

            const blocHtml = data.bloc ? `<span style="color: var(--accent-blue); font-size: 0.8rem; border: 1px solid var(--accent-blue); padding: 2px 8px; border-radius: 12px; margin-left: 10px;">${data.bloc}</span>` : '';

            const nbChapitres = data.chapitres ? data.chapitres.length : 0;
            
            let authorName = "Système";
            if (data.auteurId && allUsersForAccess.length > 0) {
                const authorObj = allUsersForAccess.find(u => u.id === data.auteurId);
                if (authorObj) {
                    authorName = (authorObj.prenom || authorObj.nom) ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim() : authorObj.email;
                }
            }
            
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

window.editCourse = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "courses", id));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            document.getElementById('edit-course-id').value = id;
            document.getElementById('course-title').value = data.titre || '';
            const activeCb = document.getElementById('course-active');
            if (activeCb) activeCb.checked = data.actif;
            
            document.getElementById('course-bloc-select').value = data.bloc || '';
            
            editingCourseAuthorId = data.auteurId || currentUid;
            editingCourseOriginalStatus = data.statutValidation || 'approved';

            document.querySelectorAll('.formation-pill').forEach(pill => {
                const val = pill.getAttribute('data-val');
                if(data.formations && (data.formations.includes(val) || data.formations.includes(pill.textContent))) {
                    pill.classList.add('selected');
                } else {
                    pill.classList.remove('selected');
                }
            });

            currentChapters = data.chapitres || [];
            window.switchCourseTab('tab-editor');
            
            // FIX : Verrouillage visuel si le cours est en cours d'examen
            const isTeacher = currentUserProfile && currentUserProfile.role === 'teacher';
            const warningBanner = document.getElementById('lock-warning-banner');
            
            if (isTeacher && editingCourseOriginalStatus === 'pending') {
                if (warningBanner) warningBanner.style.display = 'block';
                document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
                    el.disabled = true;
                    el.style.opacity = '0.5';
                    el.style.pointerEvents = 'none';
                });
                if(window.quill) window.quill.enable(false);
            } else {
                if (warningBanner) warningBanner.style.display = 'none';
                document.querySelectorAll('.editor-input, .editor-action-btn').forEach(el => {
                    el.disabled = false;
                    el.style.opacity = '1';
                    el.style.pointerEvents = 'auto';
                });
                if(window.quill) window.quill.enable(true);
            }

            if(currentChapters.length > 0) selectChapter(currentChapters[0].id);
            else renderChaptersList();
        }
    } catch (error) {
        alert("Impossible de charger le cours.");
    }
};

window.duplicateCourse = async (id) => {
    if(confirm("Créer une copie identique de ce cours ?")) {
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
                await addDoc(collection(db, "courses"), copyData);
                loadCourses();
                alert("✅ Cours dupliqué avec succès !");
            }
        } catch (e) {
            alert("Erreur lors de la duplication.");
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
