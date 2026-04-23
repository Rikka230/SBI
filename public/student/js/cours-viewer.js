/**
 * =======================================================================
 * VIEWER - Mode focus, verrouillage linéaire et QCM
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress, validateChapterProgress, startCourseProgress } from '/js/course-engine.js';

let currentUid = null;
let isAdminOrTeacher = false;
let courseData = null;
let currentChapterIndex = -1; // Initialisé à -1 pour forcer le premier chargement
let userProgress = { courses: {} };
let timerInterval = null;

const WAIT_TIME_SECONDS = 30;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            try {
                const snap = await getDoc(doc(db, "users", currentUid));
                if (snap.exists()) {
                    const uData = snap.data();
                    isAdminOrTeacher = (uData.role === 'admin' || uData.role === 'teacher' || uData.isGod);
                }
                await initViewer();
            } catch (e) {
                console.error("Erreur critique :", e);
                document.getElementById('viewer-main-content').innerHTML = '<p style="color:var(--accent-red); padding:2rem;">Erreur de connexion. Veuillez recharger.</p>';
            }
        } else {
            window.location.replace('/login.html');
        }
    });
});

async function initViewer() {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    
    if(!courseId) return window.location.replace('/student/mes-cours.html');

    const cSnap = await getDoc(doc(db, "courses", courseId));
    if(!cSnap.exists()) {
        document.getElementById('viewer-main-content').innerHTML = '<p style="color:var(--accent-red); padding:2rem;">Cours introuvable ou supprimé.</p>';
        return;
    }
    
    courseData = { id: cSnap.id, ...cSnap.data() };
    document.getElementById('viewer-course-title').textContent = courseData.titre;

    userProgress = await startCourseProgress(currentUid, courseData.id);
    
    if (!userProgress) userProgress = await getUserLearningProgress(currentUid);
    if (!userProgress.courses) userProgress.courses = {};
    if (!userProgress.courses[courseData.id]) {
        userProgress.courses[courseData.id] = { status: 'todo', completedChapters: [] };
    }
    if (!userProgress.courses[courseData.id].completedChapters) {
        userProgress.courses[courseData.id].completedChapters = [];
    }

    renderSidebar();
    
    // On charge le premier chapitre non terminé, ou le dernier si tout est fini
    let nextUnfinishedIndex = courseData.chapitres.findIndex(c => !userProgress.courses[courseData.id].completedChapters.includes(c.id));
    if (nextUnfinishedIndex === -1) nextUnfinishedIndex = 0; // Si tout est fait, on ouvre le 1er
    
    loadChapter(nextUnfinishedIndex);
}

function renderSidebar() {
    const navList = document.getElementById('chapters-nav-list');
    navList.innerHTML = '';

    courseData.chapitres.forEach((chap, index) => {
        const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);
        
        // FIX : Un chapitre est débloqué si c'est le 1er, si le précédent est validé, si l'actuel est déjà validé, ou si on est admin.
        const prevDone = index === 0 || userProgress.courses[courseData.id].completedChapters.includes(courseData.chapitres[index-1].id);
        const isUnlocked = isAdminOrTeacher || isDone || prevDone;

        const icon = isDone ? '✅' : (isUnlocked ? (chap.type === 'quiz' ? '📝' : '📖') : '🔒');
        
        const tab = document.createElement('div');
        tab.className = `chapter-tab ${isDone ? 'done' : ''} ${!isUnlocked ? 'locked' : ''}`;
        tab.id = `tab-chap-${index}`;
        tab.innerHTML = `
            <span class="tab-title">${index + 1}. ${chap.titre}</span>
            <span style="font-size:1.2rem;">${icon}</span>
        `;
        
        // On ne permet le clic que si le chapitre est débloqué
        if (isUnlocked) {
            tab.onclick = () => loadChapter(index);
        }
        
        navList.appendChild(tab);
    });
}

function loadChapter(index) {
    if (index < 0 || index >= courseData.chapitres.length) return;
    
    // FIX : Si l'élève clique sur le chapitre sur lequel il est DÉJÀ, on bloque pour ne pas reset le timer
    if (index === currentChapterIndex) return; 
    
    clearInterval(timerInterval);
    currentChapterIndex = index;
    const chap = courseData.chapitres[index];
    const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);
    
    document.querySelectorAll('.chapter-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`tab-chap-${index}`);
    if(activeTab) activeTab.classList.add('active');

    const main = document.getElementById('viewer-main-content');
    
    let contentHtml = `<h1 style="margin-top:0; font-size: 2.8rem; margin-bottom: 2rem; color: var(--text-main); font-weight: 800;">${chap.titre}</h1>`;

    if (chap.type === 'text') {
        if (chap.mediaType === 'video' && chap.mediaVideo) {
            contentHtml += `
                <div class="media-container">
                    <video src="${chap.mediaVideo}" controls controlsList="nodownload" oncontextmenu="return false;"></video>
                </div>`;
        } else if (chap.mediaType === 'image' && chap.mediaImage) {
            contentHtml += `
                <div class="media-container">
                    <img src="${chap.mediaImage}" oncontextmenu="return false;">
                </div>`;
        }
        contentHtml += `<div class="text-container ql-editor">${chap.contenu}</div>`;
    } else {
        // FIX : GÉNÉRATION DU QUIZ FRONT-END
        contentHtml += `<div class="text-container">
            <p style="color:var(--accent-yellow); font-weight: bold; font-size: 1.2rem;">📝 Examen de passage : ${chap.questions ? chap.questions.length : 0} question(s).</p>
            <div id="quiz-form" style="margin-top: 2rem;">`;
        
        if (chap.questions) {
            chap.questions.forEach((q, qIndex) => {
                contentHtml += `
                <div class="quiz-question" style="margin-bottom: 2rem; padding: 1.5rem; background: var(--bg-main); border-radius: 12px; border: 1px solid var(--border-color);">
                    <h3 style="font-size:1.1rem; color:var(--text-main); margin-top:0;">${qIndex+1}. ${q.question}</h3>
                    <div style="display:flex; flex-direction:column; gap:0.8rem; margin-top:1rem;">`;
                
                q.options.forEach((opt, oIndex) => {
                    contentHtml += `
                        <label style="display:flex; align-items:center; gap:0.8rem; cursor:pointer; padding: 0.8rem; background: white; border: 1px solid var(--border-color); border-radius: 8px; transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent-green)'" onmouseout="this.style.borderColor='var(--border-color)'">
                            <input type="checkbox" name="q_${qIndex}" value="${oIndex}" style="width:20px; height:20px; accent-color: var(--accent-green); flex-shrink:0;">
                            <span style="font-size:1rem; color:var(--text-main);">${opt}</span>
                        </label>`;
                });
                
                contentHtml += `</div></div>`;
            });
        }
        contentHtml += `</div></div>`;
    }

    contentHtml += `
        <div class="action-bar">
            <button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>
        </div>
    `;

    main.innerHTML = contentHtml;
    
    // Remonte la fenêtre tout en haut pour le nouveau chapitre
    main.scrollTop = 0;
    
    startSecurityTimer(isDone);
}

function startSecurityTimer(isAlreadyDone) {
    const btn = document.getElementById('btn-next-chapter');
    if(!btn) return;
    
    const isLast = currentChapterIndex === courseData.chapitres.length - 1;
    const nextText = isLast ? "Terminer le cours" : "Valider l'étape et continuer";

    if (isAdminOrTeacher || isAlreadyDone) {
        btn.disabled = false;
        btn.textContent = nextText;
        btn.onclick = () => validateAndNext(isLast);
        return;
    }

    let timeLeft = WAIT_TIME_SECONDS;
    btn.textContent = `Veuillez patienter (${timeLeft}s)...`;

    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            btn.disabled = false;
            btn.textContent = nextText;
            btn.onclick = () => validateAndNext(isLast);
        } else {
            btn.textContent = `Veuillez patienter (${timeLeft}s)...`;
        }
    }, 1000);
}

async function validateAndNext(isLast) {
    const chap = courseData.chapitres[currentChapterIndex];
    const btn = document.getElementById('btn-next-chapter');
    
    // FIX : LOGIQUE DE VALIDATION DU QUIZ
    if (chap.type === 'quiz') {
        let allCorrect = true;
        if (chap.questions) {
            chap.questions.forEach((q, qIndex) => {
                // Récupère les choix cochés
                const selected = Array.from(document.querySelectorAll(`input[name="q_${qIndex}"]:checked`)).map(cb => parseInt(cb.value));
                const correct = q.correctIndices || [];
                
                // Si la taille est différente ou qu'une valeur manque, c'est faux
                if (selected.length !== correct.length || !selected.every(val => correct.includes(val))) {
                    allCorrect = false;
                }
            });
        }
        
        // Blocage si l'élève a faux
        if (!allCorrect && !isAdminOrTeacher) {
            alert("❌ Certaines réponses sont incorrectes. Vérifiez vos choix et réessayez !");
            return; 
        }
    }

    btn.disabled = true;
    btn.textContent = "Validation...";

    const updatedProgress = await validateChapterProgress(currentUid, courseData.id, chap.id, courseData.chapitres.length);
    
    if (updatedProgress) {
        userProgress = updatedProgress; 
        renderSidebar();

        if (isLast) {
            alert("🎉 Félicitations, vous avez terminé ce cours !");
            window.history.back(); // Retourne automatiquement à la formation
        } else {
            loadChapter(currentChapterIndex + 1);
        }
    } else {
        alert("Erreur réseau. Veuillez réessayer.");
        btn.disabled = false;
        btn.textContent = "Valider l'étape et continuer";
    }
}
