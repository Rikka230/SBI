/**
 * =======================================================================
 * MES COURS - Logique de navigation Formations -> Blocs -> Cours
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress } from '/js/course-engine.js';

let currentUid = null;
let userData = {};
let allCourses = [];
let assignedFormations = [];
let userProgress = { courses: {}, formations: {} };

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            
            try {
                const snap = await getDoc(doc(db, "users", currentUid));
                if (snap.exists()) {
                    userData = snap.data();
                }
                
                userProgress = await getUserLearningProgress(currentUid);
                if (!userProgress.courses) userProgress.courses = {};
                
                const name = userData.prenom || userData.nom || "Étudiant";
                const topUserName = document.getElementById('top-user-name');
                if (topUserName) topUserName.textContent = name;
                
                const topUserAvatar = document.getElementById('top-user-avatar');
                if(topUserAvatar) {
                    if(userData.photoURL) {
                        topUserAvatar.innerHTML = `<img src="${userData.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
                    } else {
                        topUserAvatar.textContent = name.charAt(0).toUpperCase();
                    }
                }

                const xp = userData.xp || 0; 
                const level = Math.floor(xp / 100) + 1;
                const topUserLevel = document.getElementById('top-user-level');
                if(topUserLevel) topUserLevel.textContent = `Niveau ${level}`;
                
                await loadLibraryData();
                
            } catch (err) {
                console.error("Erreur critique lors du chargement de la page :", err);
                document.getElementById('view-formations').innerHTML = '<p style="color:var(--accent-red);">Erreur lors du chargement de vos données. Veuillez rafraîchir la page.</p>';
            }
        } else {
            window.location.replace('/login.html');
        }
    });

    const btnBack = document.getElementById('btn-back-formations');
    if(btnBack) {
        btnBack.addEventListener('click', () => {
            document.getElementById('view-courses').style.display = 'none';
            document.getElementById('btn-back-formations').style.display = 'none';
            document.getElementById('view-formations').style.display = 'grid';
            // Nettoyage de l'URL sans recharger
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
});

async function loadLibraryData() {
    try {
        const formSnap = await getDocs(collection(db, "formations"));
        assignedFormations = [];
        formSnap.forEach(d => {
            const f = d.data();
            if ((f.students && f.students.includes(currentUid)) || userData.role === 'admin' || userData.isGod) {
                assignedFormations.push({ id: d.id, ...f });
            }
        });

        const courseSnap = await getDocs(collection(db, "courses"));
        allCourses = [];
        courseSnap.forEach(d => {
            const c = d.data();
            if (c.actif) allCourses.push({ id: d.id, ...c });
        });

        renderFormationsGrid();

        // FIX DYNAMIQUE : Si l'URL contient un ID de formation (quand on quitte un cours), on l'ouvre directement
        const urlParams = new URLSearchParams(window.location.search);
        const targetFormId = urlParams.get('formId');
        if (targetFormId) {
            const targetForm = assignedFormations.find(f => f.id === targetFormId || f.titre === targetFormId);
            if (targetForm) {
                window.openFormationCourses(targetForm.id, targetForm.titre.replace(/'/g, "\\'"));
            }
        }

    } catch (e) {
        console.error("Erreur de chargement de la bibliothèque", e);
        document.getElementById('view-formations').innerHTML = '<p style="color:var(--accent-red);">Impossible de charger les cours.</p>';
    }
}

function renderFormationsGrid() {
    const container = document.getElementById('view-formations');
    if (!container) return;
    container.innerHTML = '';

    if (assignedFormations.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Aucune formation ne vous est assignée.</p>';
        return;
    }

    assignedFormations.forEach(form => {
        const formCourses = allCourses.filter(c => c.formations && (c.formations.includes(form.id) || c.formations.includes(form.titre)));
        
        let completedCount = 0;
        formCourses.forEach(c => {
            if (userProgress.courses[c.id] && userProgress.courses[c.id].status === 'done') completedCount++;
        });

        const percent = formCourses.length > 0 ? (completedCount / formCourses.length) * 100 : 0;

        const html = `
            <div class="formation-folder" onclick="window.openFormationCourses('${form.id}', '${form.titre.replace(/'/g, "\\'")}')">
                <h3 style="margin: 0 0 0.5rem 0; color: var(--text-main); font-size: 1.2rem;">${form.titre}</h3>
                <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">${completedCount} / ${formCourses.length} Cours terminés</p>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${percent}%;"></div></div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

window.openFormationCourses = function(formId, formTitle) {
    document.getElementById('view-formations').style.display = 'none';
    document.getElementById('btn-back-formations').style.display = 'block';
    
    const container = document.getElementById('view-courses');
    const listContainer = document.getElementById('courses-list-container');
    document.getElementById('current-formation-title').textContent = formTitle;
    
    container.style.display = 'flex';
    listContainer.innerHTML = '';

    const formCourses = allCourses.filter(c => c.formations && (c.formations.includes(formId) || c.formations.includes(formTitle)));
    
    if(formCourses.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-muted);">Aucun cours publié dans cette formation pour le moment.</p>';
        return;
    }

    const grouped = {};
    formCourses.forEach(c => {
        const blocName = c.bloc || 'Général';
        if(!grouped[blocName]) grouped[blocName] = [];
        grouped[blocName].push(c);
    });

    Object.keys(grouped).sort().forEach(bloc => {
        listContainer.insertAdjacentHTML('beforeend', `<div class="bloc-title">${bloc}</div>`);
        
        grouped[bloc].forEach(c => {
            let statusText = 'À faire';
            let statusClass = 'status-todo';
            
            if (userProgress.courses[c.id]) {
                if (userProgress.courses[c.id].status === 'done') { statusText = 'Terminé'; statusClass = 'status-done'; }
                else if (userProgress.courses[c.id].status === 'in_progress') { statusText = 'En cours'; statusClass = 'status-progress'; }
            }

            const html = `
                <div class="course-item" onclick="window.location.href='/student/cours-viewer.html?id=${c.id}'">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="width:40px; height:40px; background:rgba(16, 185, 129, 0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--accent-green);">
                            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <h4 style="margin:0; color:var(--text-main); font-size:1.05rem;">${c.titre}</h4>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', html);
        });
    });
}
