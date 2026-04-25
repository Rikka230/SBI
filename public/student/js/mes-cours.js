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
                if (topUserLevel) topUserLevel.textContent = `Niveau ${level}`;

                await loadAssignedFormations();
                await loadAllCourses();
                
            } catch (error) {
                console.error("Erreur d'initialisation :", error);
            }
        } else {
            window.location.replace('/login.html');
        }
    });

    document.getElementById('btn-back-formations')?.addEventListener('click', () => {
        document.getElementById('view-courses').style.display = 'none';
        document.getElementById('view-formations').style.display = 'flex';
    });

    document.getElementById('search-course-input')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.course-item').forEach(item => {
            const title = item.querySelector('.course-title').textContent.toLowerCase();
            item.style.display = title.includes(term) ? 'flex' : 'none';
        });
    });
});

async function loadAssignedFormations() {
    const list = document.getElementById('formations-list');
    if(!list) return;
    
    try {
        const snap = await getDocs(collection(db, "formations"));
        assignedFormations = [];
        
        snap.forEach(docSnap => {
            const f = docSnap.data();
            if ((f.students && f.students.includes(currentUid)) || userData.role === 'admin' || userData.isGod) {
                assignedFormations.push({ id: docSnap.id, ...f });
            }
        });

        if (assignedFormations.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);">Aucune formation ne vous est assignée.</p>';
            return;
        }

        list.innerHTML = assignedFormations.map(f => {
            let totalCourses = 0;
            let completedCourses = 0;

            allCourses.forEach(c => {
                if (c.formations && c.formations.includes(f.id)) {
                    totalCourses++;
                    if (userProgress.courses[c.id] && userProgress.courses[c.id].status === 'done') {
                        completedCourses++;
                    }
                }
            });

            const progressPercent = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);

            // FIX : Le SVG du dossier utilise bien le bleu SBI et l'événement onclick est réparé
            return `
            <div class="formation-folder" onclick="window.openFormation('${f.id}', '${f.titre.replace(/'/g, "\\'")}')">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                    <div style="width:48px; height:48px; background:rgba(42, 87, 255, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--accent-blue);">
                        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    </div>
                    <h3 style="margin:0; font-size:1.1rem; color:var(--text-main);">${f.titre}</h3>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); font-weight:bold;">
                    <span>Progression</span>
                    <span>${progressPercent}%</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
                </div>
            </div>
            `;
        }).join('');

    } catch(e) {
        list.innerHTML = '<p style="color:red;">Erreur lors du chargement des formations.</p>';
    }
}

async function loadAllCourses() {
    const snap = await getDocs(collection(db, "courses"));
    allCourses = [];
    snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.actif) {
            allCourses.push({ id: docSnap.id, ...data });
        }
    });
    loadAssignedFormations();
}

window.openFormation = function(formationId, formationTitre) {
    document.getElementById('view-formations').style.display = 'none';
    document.getElementById('view-courses').style.display = 'flex';
    document.getElementById('current-formation-title').textContent = formationTitre;
    document.getElementById('search-course-input').value = '';
    
    const container = document.getElementById('courses-list');
    container.innerHTML = '';

    const coursesInFormation = allCourses.filter(c => c.formations && c.formations.includes(formationId));
    
    if (coursesInFormation.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Aucun cours actif dans cette formation.</p>';
        return;
    }

    const coursesByBloc = {};
    coursesInFormation.forEach(c => {
        const blocName = c.bloc || "Autres Cours";
        if (!coursesByBloc[blocName]) coursesByBloc[blocName] = [];
        coursesByBloc[blocName].push(c);
    });

    for (const [blocName, courses] of Object.entries(coursesByBloc)) {
        container.insertAdjacentHTML('beforeend', `<div class="bloc-title">${blocName}</div>`);
        
        courses.forEach(c => {
            const pData = userProgress.courses[c.id] || { status: 'todo', completedChapters: [] };
            const isDone = pData.status === 'done';
            const isInProgress = pData.status === 'in_progress';
            const totalChaps = c.chapitres ? c.chapitres.length : 0;
            const doneChaps = pData.completedChapters ? pData.completedChapters.length : 0;

            let statusBadge = '';
            if (isDone) {
                statusBadge = `<span style="background:rgba(42, 87, 255, 0.1); color:var(--accent-blue); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Terminé</span>`;
            } else if (isInProgress) {
                statusBadge = `<span style="background:rgba(251,188,4,0.1); color:var(--accent-yellow); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">En cours (${doneChaps}/${totalChaps})</span>`;
            }

            let quizHtml = '';
            const hasQuiz = c.chapitres && c.chapitres.some(ch => ch.type === 'quiz');
            if (hasQuiz && pData.quizScores) {
                let totalPossible = 0;
                let earnedScore = 0;
                c.chapitres.forEach(ch => {
                    if (ch.type === 'quiz') {
                        ch.questions?.forEach(q => totalPossible += (q.points || 1));
                        earnedScore += (pData.quizScores[ch.id] || 0);
                    }
                });
                const starSvg = earnedScore === totalPossible && totalPossible > 0 ? `<svg width="14" height="14" fill="var(--accent-blue)" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-left:4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>` : '';
                quizHtml = `<span style="font-size: 0.85rem; color: var(--text-muted); background: #f3f4f6; padding: 4px 8px; border-radius: 6px; margin-right: 10px; font-weight: bold;">Score: ${earnedScore}/${totalPossible} ${starSvg}</span>`;
            }

            // FIX : Tout est repassé en var(--accent-blue)
            const html = `
                <div class="course-item" onclick="window.location.href='/student/cours-viewer.html?id=${c.id}'">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="width:40px; height:40px; background:rgba(42, 87, 255, 0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--accent-blue);">
                            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <div>
                            <div class="course-title" style="font-weight:bold; color:var(--text-main); margin-bottom:4px;">${c.titre}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${totalChaps} étapes interactives</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        ${quizHtml}
                        ${statusBadge}
                        <svg width="24" height="24" fill="var(--text-muted)" viewBox="0 0 24 24" style="margin-left:10px;"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    }
}
