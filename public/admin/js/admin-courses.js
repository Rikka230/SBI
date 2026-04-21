/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Examens QCM et Medias (A-Z)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;
let currentChapters = [];
let activeChapterId = null;

document.addEventListener('DOMContentLoaded', () => {
    
    onAuthStateChanged(auth, (user) => {
        if (user) { currentUid = user.uid; loadCourses(); }
    });

    // Écouteurs principaux attachés proprement
    document.getElementById('btn-save-course').addEventListener('click', saveCourseToFirebase);
    document.getElementById('btn-add-chapter').addEventListener('click', () => createNewChapter('text'));
    document.getElementById('btn-add-quiz').addEventListener('click', () => createNewChapter('quiz'));
    
    const newCourseBtn = document.getElementById('btn-trigger-new-course');
    if(newCourseBtn) newCourseBtn.addEventListener('click', window.prepareNewCourse);

    // Ajout dynamique de question QCM
    document.getElementById('btn-add-question').addEventListener('click', addQuizQuestion);

    document.querySelectorAll('.formation-pill').forEach(pill => {
        pill.addEventListener('click', (e) => e.target.classList.toggle('selected'));
    });

    // Update titre
    document.getElementById('chapter-title').addEventListener('input', updateActiveTitle);
    document.getElementById('quiz-title').addEventListener('input', updateActiveTitle);

    function updateActiveTitle(e) {
        if(activeChapterId) {
            const chap = currentChapters.find(c => c.id === activeChapterId);
            if(chap) { chap.titre = e.target.value; renderChaptersList(); }
        }
    }

    // COMPRESSION IMAGE & UPLOAD UI
    document.getElementById('chapter-image-upload').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200; 
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const dataUrl = canvas.toDataURL('image/webp', 0.85);
            
            document.getElementById('chapter-image-base64').value = dataUrl;
            const preview = document.getElementById('chapter-image-preview');
            preview.src = dataUrl;
            preview.style.display = 'block';
        };
    });
});

/* =========================================================
   LOGIQUE DE L'INTERFACE D'ÉDITION
========================================================= */

window.prepareNewCourse = function() {
    document.getElementById('edit-course-id').value = '';
    document.getElementById('course-title').value = '';
    currentChapters = [];
    activeChapterId = null;
    document.querySelectorAll('.formation-pill').forEach(p => p.classList.remove('selected'));
    
    document.getElementById('no-chapter-zone').style.display = 'flex';
    document.getElementById('chapter-editor-zone').style.display = 'none';
    document.getElementById('quiz-editor-zone').style.display = 'none';
    
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
        mediaType: 'image',
        mediaImage: '',
        mediaVideo: '',
        questions: [] // Array pour le QCM
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
        chap.mediaVideo = document.getElementById('chapter-video-url').value;
        chap.contenu = window.quill ? window.quill.root.innerHTML : '';
    } else if (chap.type === 'quiz') {
        chap.titre = document.getElementById('quiz-title').value;
        chap.questions = gatherQuizQuestions(); // Capture les questions créées
    }
}

window.selectChapter = function(id) {
    saveCurrentChapterContent(); 
    activeChapterId = id;
    const chap = currentChapters.find(c => c.id === id);
    if(!chap) return;

    document.getElementById('no-chapter-zone').style.display = 'none';

    if (chap.type === 'text') {
        document.getElementById('quiz-editor-zone').style.display = 'none';
        document.getElementById('chapter-editor-zone').style.display = 'flex';
        
        document.getElementById('chapter-title').value = chap.titre;

        // UI Media
        if(chap.mediaType === 'video') {
            document.querySelector('input[name="media_type"][value="video"]').checked = true;
            document.getElementById('media-image-zone').style.display = 'none';
            document.getElementById('media-video-zone').style.display = 'flex';
        } else {
            document.querySelector('input[name="media_type"][value="image"]').checked = true;
            document.getElementById('media-image-zone').style.display = 'flex';
            document.getElementById('media-video-zone').style.display = 'none';
        }
        
        document.getElementById('chapter-video-url').value = chap.mediaVideo || '';
        document.getElementById('chapter-image-base64').value = chap.mediaImage || '';
        const preview = document.getElementById('chapter-image-preview');
        if(chap.mediaImage) { preview.src = chap.mediaImage; preview.style.display = 'block'; } 
        else { preview.style.display = 'none'; }

        if(window.quill) window.quill.clipboard.dangerouslyPasteHTML(chap.contenu || '');

    } else {
        // C'est un Examen
        document.getElementById('chapter-editor-zone').style.display = 'none';
        document.getElementById('quiz-editor-zone').style.display = 'flex';
        document.getElementById('quiz-title').value = chap.titre;
        renderQuizBuilder(chap.questions || []);
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
        const bg = isActive ? 'rgba(42, 87, 255, 0.1)' : '#111';
        const border = isActive ? '1px solid var(--accent-blue)' : '1px solid #333';
        
        let icon = chap.type === 'quiz' ? '📝 ' : `${index + 1}. `;
        let color = chap.type === 'quiz' ? 'var(--accent-yellow)' : (isActive ? 'var(--accent-blue)' : 'white');

        const li = `
            <li onclick="selectChapter('${chap.id}')" style="padding: 0.8rem; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: ${color}; font-weight: ${isActive ? 'bold' : 'normal'};">
                <span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${icon}${chap.titre}</span>
                <button onclick="deleteChapter('${chap.id}', event)" style="background:none; border:none; color:var(--accent-red); cursor:pointer;">&times;</button>
            </li>
        `;
        list.insertAdjacentHTML('beforeend', li);
    });
}

/* =========================================================
   LOGIQUE DU CONSTRUCTEUR D'EXAMEN (QCM)
========================================================= */

function addQuizQuestion() {
    const container = document.getElementById('quiz-questions-container');
    const qIndex = container.children.length;
    
    const qHTML = `
        <div class="quiz-question-block" style="background: #111; padding: 1.5rem; border: 1px solid #333; border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 1.2rem;">&times;</button>
            
            <input type="text" class="q-title" placeholder="Votre question..." style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: white; border: none; border-bottom: 1px solid #555; outline: none; margin-bottom: 1rem;">
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;" class="q-options-container">
                <label style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <input type="radio" name="correct_q${qIndex}" value="0" checked>
                    <input type="text" class="q-opt" placeholder="Réponse 1" style="flex-grow:1; background: #222; border: 1px solid #444; padding: 0.5rem; color: white; border-radius:4px; outline:none;">
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <input type="radio" name="correct_q${qIndex}" value="1">
                    <input type="text" class="q-opt" placeholder="Réponse 2" style="flex-grow:1; background: #222; border: 1px solid #444; padding: 0.5rem; color: white; border-radius:4px; outline:none;">
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <input type="radio" name="correct_q${qIndex}" value="2">
                    <input type="text" class="q-opt" placeholder="Réponse 3 (Optionnelle)" style="flex-grow:1; background: #222; border: 1px solid #444; padding: 0.5rem; color: white; border-radius:4px; outline:none;">
                </label>
            </div>
            
            <div style="margin-top: 1rem; display: flex; align-items: center; gap: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez la bonne réponse.</span>
                <input type="number" class="q-points" value="1" min="1" style="width: 60px; background: #222; border: 1px solid #444; padding: 0.4rem; color: white; border-radius: 4px;"> <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', qHTML);
}

function gatherQuizQuestions() {
    const questions = [];
    document.querySelectorAll('.quiz-question-block').forEach((block, index) => {
        const title = block.querySelector('.q-title').value.trim();
        const points = parseInt(block.querySelector('.q-points').value) || 1;
        const options = Array.from(block.querySelectorAll('.q-opt')).map(inp => inp.value.trim()).filter(v => v !== '');
        
        const correctRadio = block.querySelector(`input[name="correct_q${index}"]:checked`);
        const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;

        if(title && options.length >= 2) {
            questions.push({ question: title, options: options, correctIndex: correctIndex, points: points });
        }
    });
    return questions;
}

function renderQuizBuilder(questions) {
    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '';
    
    questions.forEach((q, index) => {
        const qHTML = `
        <div class="quiz-question-block" style="background: #111; padding: 1.5rem; border: 1px solid #333; border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 1.2rem;">&times;</button>
            
            <input type="text" class="q-title" value="${q.question}" style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: white; border: none; border-bottom: 1px solid #555; outline: none; margin-bottom: 1rem;">
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;" class="q-options-container">
                ${[0,1,2].map(i => `
                <label style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <input type="radio" name="correct_q${index}" value="${i}" ${q.correctIndex === i ? 'checked' : ''}>
                    <input type="text" class="q-opt" value="${q.options[i] || ''}" placeholder="Réponse ${i+1}" style="flex-grow:1; background: #222; border: 1px solid #444; padding: 0.5rem; color: white; border-radius:4px; outline:none;">
                </label>
                `).join('')}
            </div>
            
            <div style="margin-top: 1rem; display: flex; align-items: center; gap: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez la bonne réponse.</span>
                <input type="number" class="q-points" value="${q.points}" min="1" style="width: 60px; background: #222; border: 1px solid #444; padding: 0.4rem; color: white; border-radius: 4px;"> <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', qHTML);
    });
}


/* =========================================================
   FIREBASE : SAUVEGARDE ET CHARGEMENT
========================================================= */

async function saveCourseToFirebase() {
    saveCurrentChapterContent(); 
    
    const courseId = document.getElementById('edit-course-id').value;
    const title = document.getElementById('course-title').value.trim();
    const isActive = document.getElementById('course-active').checked;
    
    const selectedPills = Array.from(document.querySelectorAll('.formation-pill.selected')).map(p => p.getAttribute('data-val'));

    if (!title) { alert('⚠️ Veuillez entrer un Titre Global.'); return; }
    if (currentChapters.length === 0) { alert('⚠️ Ajoutez au moins une étape.'); return; }

    const saveBtn = document.getElementById('btn-save-course');
    saveBtn.textContent = 'Sauvegarde...';
    saveBtn.disabled = true;

    try {
        const courseData = {
            titre: title,
            actif: isActive,
            formations: selectedPills,
            auteurId: currentUid,
            chapitres: currentChapters
        };

        if (courseId) {
            await updateDoc(doc(db, "courses", courseId), courseData);
            alert('✅ Cours mis à jour !');
        } else {
            courseData.dateCreation = serverTimestamp();
            await addDoc(collection(db, "courses"), courseData);
            alert('✅ Nouveau cours créé !');
        }
        
        window.prepareNewCourse(); 
        loadCourses();
        window.switchCourseTab('tab-list');

    } catch (error) {
        alert("❌ Erreur de sauvegarde.");
    } finally {
        saveBtn.textContent = 'Sauvegarder le Cours Complet';
        saveBtn.disabled = false;
    }
}

async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if(!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        listContainer.innerHTML = '';
        
        if(querySnapshot.empty) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId = docSnap.id;
            
            const statusHtml = data.actif ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>` : `<span style="color: var(--accent-red); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            const tagsHtml = data.formations ? data.formations.map(f => `<span class="tag">📁 ${f}</span>`).join('') : '';
            const nbChapitres = data.chapitres ? data.chapitres.length : 0;
            
            const html = `
            <div style="background: var(--bg-card); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; opacity: ${data.actif ? '1' : '0.6'};">
                <div>
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        ${statusHtml} <h3 style="margin: 0;">${data.titre}</h3>
                    </div>
                    <div>${tagsHtml} <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 1rem;">${nbChapitres} Étape(s)</span></div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue);" onclick="window.editCourse('${courseId}')">Éditer</button>
                    <button class="action-btn danger" style="width: auto; margin: 0;" onclick="window.deleteCourse('${courseId}')">❌</button>
                </div>
            </div>`;
            listContainer.insertAdjacentHTML('beforeend', html);
        });
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
            document.getElementById('course-active').checked = data.actif;
            
            document.querySelectorAll('.formation-pill').forEach(pill => {
                const val = pill.getAttribute('data-val');
                if(data.formations && data.formations.includes(val)) pill.classList.add('selected');
                else pill.classList.remove('selected');
            });

            currentChapters = data.chapitres || [];
            window.switchCourseTab('tab-editor');
            
            if(currentChapters.length > 0) selectChapter(currentChapters[0].id);
            else renderChaptersList();
        }
    } catch (error) {
        alert("Impossible de charger le cours.");
    }
};

window.deleteCourse = async (id) => {
    if(confirm("Supprimer intégralement ce cours ?")) {
        await deleteDoc(doc(db, "courses", id));
        loadCourses();
    }
};
