/**
 * =======================================================================
 * VIEWER - Mode focus et système anti-speedrun (Timer)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress, validateChapterProgress } from '/js/course-engine.js';

let currentUid = null;
let isAdminOrTeacher = false;
let courseData = null;
let currentChapterIndex = 0;
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

    userProgress = await getUserLearningProgress(currentUid);
    if (!userProgress.courses) userProgress.courses = {};
    if (!userProgress.courses[courseData.id]) {
        userProgress.courses[courseData.id] = { status: 'todo', completedChapters: [] };
    }
    if (!userProgress.courses[courseData.id].completedChapters) {
        userProgress.courses[courseData.id].completedChapters = [];
    }

    renderSidebar();
    loadChapter(0);
}

function renderSidebar() {
    const navList = document.getElementById('chapters-nav-list');
    navList.innerHTML = '';

    courseData.chapitres.forEach((chap, index) => {
        const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);
        const icon = isDone ? '✅' : (chap.type === 'quiz' ? '📝' : '📖');
        
        const tab = document.createElement('div');
        tab.className = `chapter-tab ${isDone ? 'done' : ''}`;
        tab.id = `tab-chap-${index}`;
        tab.innerHTML = `
            <span class="tab-title">${index + 1}. ${chap.titre}</span>
            <span style="font-size:1.2rem;">${icon}</span>
        `;
        
        tab.onclick = () => loadChapter(index);
        navList.appendChild(tab);
    });
}

function loadChapter(index) {
    if (index < 0 || index >= courseData.chapitres.length) return;
    
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
        contentHtml += `<div class="text-container"><p style="color:var(--accent-yellow); font-weight: bold; font-size: 1.2rem;">📝 Examen : ${chap.questions ? chap.questions.length : 0} question(s).</p></div>`;
    }

    contentHtml += `
        <div class="action-bar">
            <button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>
        </div>
    `;

    main.innerHTML = contentHtml;
    startSecurityTimer(isDone);
}

function startSecurityTimer(isAlreadyDone) {
    const btn = document.getElementById('btn-next-chapter');
    if(!btn) return;
    
    const isLast = currentChapterIndex === courseData.chapitres.length - 1;
    const nextText = isLast ? "Terminer le cours" : "Valider l'étape et continuer";

    // FIX : Si le chapitre est déjà validé, on active directement le bouton sans timer
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
    const chapId = courseData.chapitres[currentChapterIndex].id;
    const btn = document.getElementById('btn-next-chapter');
    btn.disabled = true;
    btn.textContent = "Validation...";

    // On passe la taille du cours pour que l'Engine calcule si on a atteint les 100%
    const updatedProgress = await validateChapterProgress(currentUid, courseData.id, chapId, courseData.chapitres.length);
    
    if (updatedProgress) {
        // Mise à jour de la variable locale vitale
        userProgress = updatedProgress; 
        renderSidebar();

        if (isLast) {
            alert("🎉 Félicitations, vous avez terminé ce cours !");
            window.location.href = '/student/mes-cours.html';
        } else {
            loadChapter(currentChapterIndex + 1);
        }
    } else {
        alert("Erreur réseau. Veuillez réessayer.");
        btn.disabled = false;
        btn.textContent = "Valider l'étape et continuer";
    }
}
