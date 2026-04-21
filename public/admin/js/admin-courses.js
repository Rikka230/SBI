/**
 * =======================================================================
 * ADMIN COURSES - Gestion des Cours et Chapitres (A-Z)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, addDoc, getDocs, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;

// --- VARIABLES POUR LA STRUCTURE DU COURS ---
let currentChapters = [];
let activeChapterId = null;

document.addEventListener('DOMContentLoaded', () => {
    
    // Vérification de sécurité
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            loadCourses();
        } else {
            window.location.replace('/login.html');
        }
    });

    // Écouteurs globaux
    const saveBtn = document.getElementById('btn-save-course');
    if(saveBtn) saveBtn.addEventListener('click', saveCourseToFirebase);

    const addChapterBtn = document.getElementById('btn-add-chapter');
    if(addChapterBtn) addChapterBtn.addEventListener('click', createNewChapter);

    // Mise à jour en temps réel du nom du chapitre dans la barre latérale
    const chapTitleInput = document.getElementById('chapter-title');
    if(chapTitleInput) {
        chapTitleInput.addEventListener('input', (e) => {
            if(activeChapterId) {
                const chap = currentChapters.find(c => c.id === activeChapterId);
                if(chap) {
                    chap.titre = e.target.value;
                    renderChaptersList();
                }
            }
        });
    }
});


/* =========================================================
   LOGIQUE DE GESTION DES CHAPITRES (ETAPES)
========================================================= */

// 1. Ajouter une nouvelle étape vierge
function createNewChapter() {
    // On sauvegarde ce qu'on était en train d'écrire avant de créer le nouveau
    saveCurrentChapterContent();

    const newId = 'chap_' + Date.now().toString();
    const newChap = {
        id: newId,
        titre: `Étape ${currentChapters.length + 1}`,
        contenu: ''
    };
    
    currentChapters.push(newChap);
    selectChapter(newId);
}

// 2. Sauvegarder l'éditeur Quill vers le tableau mémoire Javascript
function saveCurrentChapterContent() {
    if(activeChapterId) {
        const chap = currentChapters.find(c => c.id === activeChapterId);
        if(chap) {
            chap.titre = document.getElementById('chapter-title').value;
            chap.contenu = window.quill ? window.quill.root.innerHTML : '';
        }
    }
}

// 3. Basculer l'éditeur sur une étape précise (disponible globalement pour onclick HTML)
window.selectChapter = function(id) {
    saveCurrentChapterContent(); 
    
    activeChapterId = id;
    const chap = currentChapters.find(c => c.id === id);
    if(!chap) return;

    // Affiche l'éditeur et cache le message "État Zéro"
    document.getElementById('no-chapter-zone').style.display = 'none';
    document.getElementById('chapter-editor-zone').style.display = 'flex';

    // Remplissage avec les données de l'étape cliquée
    document.getElementById('chapter-title').value = chap.titre;
    if(window.quill) {
        window.quill.root.innerHTML = chap.contenu;
    }

    renderChaptersList();
}

// 4. Supprimer une étape
window.deleteChapter = function(id, event) {
    event.stopPropagation(); // Empêche de déclencher "selectChapter" en même temps
    if(confirm('Supprimer définitivement cette étape du cours ?')) {
        currentChapters = currentChapters.filter(c => c.id !== id);
        
        if(activeChapterId === id) {
            activeChapterId = null;
            document.getElementById('no-chapter-zone').style.display = 'flex';
            document.getElementById('chapter-editor-zone').style.display = 'none';
        }
        renderChaptersList();
    }
}

// 5. Mettre à jour visuellement la liste latérale
function renderChaptersList() {
    const list = document.getElementById('chapters-list');
    if(!list) return;
    
    list.innerHTML = '';
    
    currentChapters.forEach((chap, index) => {
        const isActive = chap.id === activeChapterId;
        const bg = isActive ? 'rgba(42, 87, 255, 0.1)' : '#111';
        const border = isActive ? '1px solid var(--accent-blue)' : '1px solid #333';
        const color = isActive ? 'var(--accent-blue)' : 'white';
        const fw = isActive ? 'bold' : 'normal';

        const li = `
            <li onclick="selectChapter('${chap.id}')" style="padding: 0.8rem; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; color: ${color}; font-weight: ${fw};">
                <span style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${index + 1}. ${chap.titre}</span>
                <button onclick="deleteChapter('${chap.id}', event)" style="background:none; border:none; color:var(--accent-red); cursor:pointer; padding: 0 5px; font-size: 1.2rem; display: flex; align-items: center;" title="Supprimer l'étape">&times;</button>
            </li>
        `;
        list.insertAdjacentHTML('beforeend', li);
    });
}


/* =========================================================
   COMMUNICATION AVEC FIREBASE
========================================================= */

// ENVOI DU COURS COMPLET
async function saveCourseToFirebase() {
    saveCurrentChapterContent(); // S'assure que la dernière ligne tapée est sauvée
    
    const titleInput = document.getElementById('course-title');
    const activeCheckbox = document.getElementById('course-active');
    const formationsSelect = document.getElementById('course-formations');
    
    const title = titleInput.value.trim();
    const isActive = activeCheckbox.checked;
    const selectedFormations = Array.from(formationsSelect.selectedOptions).map(opt => opt.value);

    // Protections
    if (!title) { alert('⚠️ Veuillez entrer un Titre Global pour le cours.'); return; }
    if (currentChapters.length === 0) { alert('⚠️ Le cours doit contenir au moins une étape pour être sauvegardé.'); return; }

    const saveBtn = document.getElementById('btn-save-course');
    saveBtn.textContent = 'Sauvegarde en cours...';
    saveBtn.disabled = true;

    try {
        await addDoc(collection(db, "courses"), {
            titre: title,
            actif: isActive,
            formations: selectedFormations,
            auteurId: currentUid,
            dateCreation: serverTimestamp(),
            chapitres: currentChapters // L'ensemble des chapitres et leurs textes partent d'un coup !
        });

        alert('✅ Cours complet sauvegardé avec succès !');
        
        // RESET DE L'INTERFACE
        titleInput.value = '';
        currentChapters = [];
        activeChapterId = null;
        renderChaptersList();
        document.getElementById('no-chapter-zone').style.display = 'flex';
        document.getElementById('chapter-editor-zone').style.display = 'none';
        if(window.quill) window.quill.root.innerHTML = '';
        
        // Rafraîchir la bibliothèque et changer d'onglet
        loadCourses();
        window.switchCourseTab('tab-list');

    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        alert("❌ Erreur : " + error.message);
    } finally {
        saveBtn.textContent = 'Sauvegarder le Cours Complet';
        saveBtn.disabled = false;
    }
}

// LECTURE DE LA BIBLIOTHÈQUE
async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if(!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        listContainer.innerHTML = '';
        
        if(querySnapshot.empty) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours trouvé. Créez la première leçon !</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId = docSnap.id;
            
            const statusHtml = data.actif 
                ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>`
                : `<span style="color: var(--accent-red); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            
            const tagsHtml = data.formations ? data.formations.map(f => `<span class="tag">📁 ${f}</span>`).join('') : '';
            // On compte le nombre exact d'étapes dans Firebase
            const nbChapitres = data.chapitres ? data.chapitres.length : 0;
            
            const html = `
            <div style="background: var(--bg-card); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; opacity: ${data.actif ? '1' : '0.6'};">
                <div>
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        ${statusHtml}
                        <h3 style="margin: 0;">${data.titre}</h3>
                    </div>
                    <div>
                        ${tagsHtml}
                        <span style="color: var(--accent-yellow); font-size: 0.85rem; margin-left: 1rem; font-weight:bold;">${nbChapitres} Étape(s)</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 10px;">(ID: ${courseId.substring(0,6)})</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); border-color: rgba(42, 87, 255, 0.4);">Modifier</button>
                    <button class="action-btn danger" style="width: auto; margin: 0;" onclick="deleteCourse('${courseId}')" title="Supprimer le cours complet">❌</button>
                </div>
            </div>`;
            
            listContainer.insertAdjacentHTML('beforeend', html);
        });
        
    } catch (error) {
        console.error("Erreur chargement:", error);
        listContainer.innerHTML = '<p style="color:red; text-align:center;">Erreur de chargement des cours.</p>';
    }
}

// SUPPRESSION DE COURS
window.deleteCourse = async (id) => {
    if(confirm("DANGER : Supprimer intégralement ce cours et toutes ses étapes ?")) {
        try {
            await deleteDoc(doc(db, "courses", id));
            loadCourses();
        } catch(e) {
            alert("Erreur de suppression.");
        }
    }
}
