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
let userProgress = null;
let timerInterval = null;

const WAIT_TIME_SECONDS = 30; // 30 Secondes minimum pour lire un texte. Pour une vidéo, tu pourras brancher ça sur la durée de la vidéo plus tard.

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            const snap = await getDoc(doc(db, "users", currentUid));
            const uData = snap.data();
            isAdminOrTeacher = (uData.role === 'admin' || uData.role === 'teacher' || uData.isGod);
            
            await initViewer();
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
    if(!cSnap.exists()) return alert("Cours introuvable.");
    
    courseData = { id: cSnap.id, ...cSnap.data() };
    document.getElementById('viewer-course-title').textContent = courseData.titre;

    userProgress = await getUserLearningProgress(currentUid);
    if (!userProgress.courses[courseData.id]) {
        userProgress.courses[courseData.id] = { status: 'todo', completedChapters: [] };
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
            <span style="font-size:0.8rem;">${icon}</span>
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
    document.getElementById(`tab-chap-${index}`).classList.add('active');

    const main = document.getElementById('viewer-main-content');
    
    let contentHtml = `<h1 style="margin-top:0; font-size: 2.5rem; margin-bottom: 2rem;">${chap.titre}</h1>`;

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
        // Mode Quiz simplfié pour le moment (à développer plus tard)
        contentHtml += `<div class="text-container"><p style="color:var(--accent-yellow);">Examen : ${chap.questions.length} questions.</p></div>`;
    }

    // Le bouton d'action (Suivant / Valider)
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
    const isLast = currentChapterIndex === courseData.chapitres.length - 1;
    const nextText = isLast ? "Terminer le cours" : "Valider et passer à la suite";

    // Bypass pour les profs/admins OU si le chapitre a déjà été validé dans le passé
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

    const success = await validateChapterProgress(currentUid, courseData.id, chapId, isLast);
    
    if (success) {
        if (!userProgress.courses[courseData.id].completedChapters.includes(chapId)) {
            userProgress.courses[courseData.id].completedChapters.push(chapId);
        }
        renderSidebar(); // Met à jour l'icône "Validé"

        if (isLast) {
            alert("🎉 Félicitations, vous avez terminé ce cours !");
            window.location.href = '/student/mes-cours.html';
        } else {
            loadChapter(currentChapterIndex + 1);
        }
    } else {
        alert("Erreur réseau. Veuillez réessayer.");
        btn.disabled = false;
        btn.textContent = "Valider et passer à la suite";
    }
}
