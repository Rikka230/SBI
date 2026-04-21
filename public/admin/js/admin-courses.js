/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours, Examens et Formations (A-Z)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;
let currentChapters = [];
let activeChapterId = null;

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Authentification
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            loadCourses();
        } else {
            window.location.replace('/login.html');
        }
    });

    // 2. Écouteurs de base
    document.getElementById('btn-save-course').addEventListener('click', saveCourseToFirebase);
    document.getElementById('btn-add-chapter').addEventListener('click', () => createNewChapter('text'));
    document.getElementById('btn-add-quiz').addEventListener('click', () => createNewChapter('quiz'));

    // 3. Gestionnaire des "Pilules" de Catégorie (Formations)
    document.querySelectorAll('.formation-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.target.classList.toggle('selected');
        });
    });

    // 4. Mise à jour du titre en temps réel dans la liste
    document.getElementById('chapter-title').addEventListener('input', updateActiveTitle);
    document.getElementById('quiz-title').addEventListener('input', updateActiveTitle);

    function updateActiveTitle(e) {
        if(activeChapterId) {
            const chap = currentChapters.find(c => c.id === activeChapterId);
            if(chap) { chap.titre = e.target.value; renderChaptersList(); }
        }
    }
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
        type: type, // 'text' ou 'quiz'
        titre: type === 'quiz' ? `Examen` : `Leçon ${currentChapters.filter(c=>c.type==='text').length + 1}`,
        contenu: '',
        image: ''
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
        chap.image = document.getElementById('chapter-image').value;
        chap.contenu = window.quill ? window.quill.root.innerHTML : '';
    } else if (chap.type === 'quiz') {
        chap.titre = document.getElementById('quiz-title').value;
        // Données du quiz à sauvegarder plus tard
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
        document.getElementById('chapter-image').value = chap.image || '';
        if(window.quill) window.quill.root.innerHTML = chap.contenu || '';
    } else {
        document.getElementById('chapter-editor-zone').style.display = 'none';
        document.getElementById('quiz-editor-zone').style.display = 'flex';
        document.getElementById('quiz-title').value = chap.titre;
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
            <li onclick="selectChapter('${chap.id}')" style="padding: 0.8rem; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: ${color};">
                <span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${icon}${chap.titre}</span>
                <button onclick="deleteChapter('${chap.id}', event)" style="background:none; border:none; color:var(--accent-red); cursor:pointer;">&times;</button>
            </li>
        `;
        list.insertAdjacentHTML('beforeend', li);
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
    
    // Récupérer les "pilules" sélectionnées
    const selectedPills = Array.from(document.querySelectorAll('.formation-pill.selected')).map(p => p.getAttribute('data-val'));

    if (!title) { alert('⚠️ Veuillez entrer un Titre Global pour le cours.'); return; }

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
            // Mise à jour existant
            await updateDoc(doc(db, "courses", courseId), courseData);
            alert('✅ Cours mis à jour !');
        } else {
            // Nouveau cours
            courseData.dateCreation = serverTimestamp();
            await addDoc(collection(db, "courses"), courseData);
            alert('✅ Nouveau cours créé !');
        }
        
        window.prepareNewCourse(); // Reset l'interface
        loadCourses();
        window.switchCourseTab('tab-list');

    } catch (error) {
        console.error("Erreur:", error);
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
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours. Cliquez sur + Nouveau Cours.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId = docSnap.id;
            
            const statusHtml = data.actif 
                ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>`
                : `<span style="color: var(--accent-red); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            
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

// CHARGER UN COURS EXISTANT DANS L'ÉDITEUR
window.editCourse = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "courses", id));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Remplir les données globales
            document.getElementById('edit-course-id').value = id;
            document.getElementById('course-title').value = data.titre || '';
            document.getElementById('course-active').checked = data.actif;
            
            // Mettre à jour les pilules de sélection
            document.querySelectorAll('.formation-pill').forEach(pill => {
                const val = pill.getAttribute('data-val');
                if(data.formations && data.formations.includes(val)) {
                    pill.classList.add('selected');
                } else {
                    pill.classList.remove('selected');
                }
            });

            // Recharger les chapitres
            currentChapters = data.chapitres || [];
            activeChapterId = null; // On force l'état zéro au démarrage
            
            document.getElementById('no-chapter-zone').style.display = 'flex';
            document.getElementById('chapter-editor-zone').style.display = 'none';
            document.getElementById('quiz-editor-zone').style.display = 'none';
            
            renderChaptersList();
            window.switchCourseTab('tab-editor');
            
        } else {
            alert("Ce cours n'existe plus.");
        }
    } catch (error) {
        console.error("Erreur de chargement", error);
        alert("Impossible de charger le cours.");
    }
};

window.deleteCourse = async (id) => {
    if(confirm("Supprimer intégralement ce cours et toutes ses étapes ?")) {
        await deleteDoc(doc(db, "courses", id));
        loadCourses();
    }
};
