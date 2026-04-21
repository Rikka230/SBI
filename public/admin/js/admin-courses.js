/**
 * =======================================================================
 * ADMIN COURSES - Gestion Firebase des Cours (A-Z)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, addDoc, getDocs, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;

document.addEventListener('DOMContentLoaded', () => {
    
    // Vérification de sécurité et chargement des cours
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            loadCourses();
        } else {
            window.location.replace('/login.html');
        }
    });

    // Écouteur sur le bouton "Sauvegarder"
    const saveBtn = document.getElementById('btn-save-course');
    if(saveBtn) {
        saveBtn.addEventListener('click', saveCourseToFirebase);
    }
});

/**
 * Enregistre un nouveau cours dans la collection "courses"
 */
async function saveCourseToFirebase() {
    const titleInput = document.getElementById('course-title');
    const activeCheckbox = document.getElementById('course-active');
    const formationsSelect = document.getElementById('course-formations');
    
    // On extrait le contenu HTML généré par l'éditeur Quill
    const content = window.quill ? window.quill.root.innerHTML : '';
    const title = titleInput.value.trim();
    const isActive = activeCheckbox.checked;
    
    // Récupération des formations sélectionnées
    const selectedFormations = Array.from(formationsSelect.selectedOptions).map(opt => opt.value);

    if (!title) {
        alert('⚠️ Veuillez entrer un titre pour le cours.');
        return;
    }

    const saveBtn = document.getElementById('btn-save-course');
    saveBtn.textContent = 'Sauvegarde en cours...';
    saveBtn.disabled = true;

    try {
        await addDoc(collection(db, "courses"), {
            titre: title,
            contenu: content,
            actif: isActive,
            formations: selectedFormations,
            auteurId: currentUid,
            dateCreation: serverTimestamp(),
            chapitres: [] // Structure préparée pour l'avenir
        });

        alert('✅ Cours sauvegardé avec succès dans Firebase !');
        
        // On vide le formulaire pour le prochain cours
        titleInput.value = '';
        if(window.quill) window.quill.setContents([]);
        
        // On recharge la bibliothèque et on bascule sur l'onglet
        loadCourses();
        window.switchCourseTab('tab-list');

    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        alert("❌ Erreur de connexion à Firebase : " + error.message);
    } finally {
        saveBtn.textContent = 'Sauvegarder le Cours';
        saveBtn.disabled = false;
    }
}

/**
 * Récupère tous les cours et les affiche dans la bibliothèque
 */
async function loadCourses() {
    const listContainer = document.getElementById('courses-list-container');
    if(!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        listContainer.innerHTML = '';
        
        if(querySnapshot.empty) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Aucun cours trouvé. Créez-en un nouveau !</p>';
            return;
        }

        // On construit le visuel de chaque cours
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId = docSnap.id;
            
            const statusHtml = data.actif 
                ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 0.8rem;">● ACTIF</span>`
                : `<span style="color: var(--accent-red); font-weight: bold; font-size: 0.8rem;">● BROUILLON</span>`;
            
            // Création des bulles de tag pour chaque formation
            const tagsHtml = data.formations.map(f => `<span class="tag">📁 ${f}</span>`).join('');
            
            const html = `
            <div style="background: var(--bg-card); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; opacity: ${data.actif ? '1' : '0.6'};">
                <div>
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        ${statusHtml}
                        <h3 style="margin: 0;">${data.titre}</h3>
                    </div>
                    <div>
                        ${tagsHtml}
                        <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 1rem;">ID: ${courseId.substring(0,6)}...</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); border-color: rgba(42, 87, 255, 0.4);">Éditer</button>
                    <button class="action-btn danger" style="width: auto; margin: 0;" onclick="deleteCourse('${courseId}')">❌</button>
                </div>
            </div>`;
            
            listContainer.insertAdjacentHTML('beforeend', html);
        });
        
    } catch (error) {
        console.error("Erreur chargement cours:", error);
        listContainer.innerHTML = '<p style="color:red; text-align:center;">Erreur de chargement des cours depuis Firebase.</p>';
    }
}

// Rend la fonction de suppression accessible depuis le bouton HTML
window.deleteCourse = async (id) => {
    if(confirm("DANGER : Supprimer définitivement ce cours de la base de données ?")) {
        try {
            await deleteDoc(doc(db, "courses", id));
            loadCourses();
        } catch(e) {
            alert("Erreur de suppression.");
        }
    }
}
