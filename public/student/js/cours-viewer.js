/**
 * =======================================================================
 * VIEWER - Mode focus, verrouillage linéaire et QCM intelligent + XP
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress, validateChapterProgress, startCourseProgress } from '/js/course-engine.js';

let currentUid = null;
let isAdminOrTeacher = false;
let courseData = null;
let currentChapterIndex = -1;
let userProgress = { courses: {} };
let timerInterval = null;

const WAIT_TIME_SECONDS = 30;

// Banque de SVGs
const SVG_DONE = `<svg width="16" height="16" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
const SVG_QUIZ = `<svg width="16" height="16" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`;
const SVG_READ = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`;
const SVG_LOCK = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`;
const SVG_TIME = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 8px;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;
const SVG_NEXT = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`;

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

    const formId = (courseData.formations && courseData.formations.length > 0) ? courseData.formations[0] : '';
    document.getElementById('btn-back-dynamic').onclick = (e) => {
        e.preventDefault();
        window.location.href = `/student/mes-cours.html?formId=${formId}`;
    };

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
    
    let nextUnfinishedIndex = courseData.chapitres.findIndex(c => !userProgress.courses[courseData.id].completedChapters.includes(c.id));
    if (nextUnfinishedIndex === -1) nextUnfinishedIndex = 0; 
    
    loadChapter(nextUnfinishedIndex);
}

function renderSidebar() {
    const navList = document.getElementById('chapters-nav-list');
    navList.innerHTML = '';

    courseData.chapitres.forEach((chap, index) => {
        const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);
        const prevDone = index === 0 || userProgress.courses[courseData.id].completedChapters.includes(courseData.chapitres[index-1].id);
        const isUnlocked = isAdminOrTeacher || isDone || prevDone;

        const icon = isDone ? SVG_DONE : (isUnlocked ? (chap.type === 'quiz' ? SVG_QUIZ : SVG_READ) : SVG_LOCK);
        
        const tab = document.createElement('div');
        tab.className = `chapter-tab ${isDone ? 'done' : ''} ${!isUnlocked ? 'locked' : ''}`;
        tab.id = `tab-chap-${index}`;
        tab.innerHTML = `
            <span class="tab-title">${index + 1}. ${chap.titre}</span>
            <span style="font-size:1.2rem; display:flex;">${icon}</span>
        `;
        
        if (isUnlocked) {
            tab.onclick = () => loadChapter(index);
        }
        
        navList.appendChild(tab);
    });
}

function loadChapter(index, forceReload = false) {
    if (index < 0 || index >= courseData.chapitres.length) return;
    if (index === currentChapterIndex && !forceReload) return; 
    
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
        contentHtml += `<div class="text-container">
            <div style="color:var(--accent-yellow); font-weight: bold; font-size: 1.2rem; border-bottom: 2px solid var(--border-color); padding-bottom: 1rem; display:flex; align-items:center; gap:10px;">
                ${SVG_QUIZ} Examen de passage
            </div>
            <div id="quiz-form" style="margin-top: 2rem;">`;
        
        if (chap.questions) {
            chap.questions.forEach((q, qIndex) => {
                contentHtml += `
                <div class="quiz-question" style="margin-bottom: 2.5rem;">
                    <h3 style="font-size:1.1rem; color:var(--text-main); margin-top:0;">${qIndex+1}. ${q.question}</h3>
                    <div style="display:flex; flex-direction:column; gap:0.8rem; margin-top:1rem;">`;
                
                q.options.forEach((opt, oIndex) => {
                    contentHtml += `
                        <label id="label_q_${qIndex}_o_${oIndex}" class="quiz-option">
                            <input type="checkbox" name="q_${qIndex}" value="${oIndex}" style="width:20px; height:20px; accent-color: var(--accent-green); flex-shrink:0;">
                            <span style="font-size:1rem; color:var(--text-main);">${opt}</span>
                        </label>`;
                });
                
                contentHtml += `</div></div>`;
            });
        }
        contentHtml += `</div>
            <div id="quiz-result-box" class="quiz-result-box"></div>
        </div>`;
    }

    contentHtml += `
        <div class="action-bar" id="viewer-action-bar">
            <button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>
        </div>
    `;

    main.innerHTML = contentHtml;
    main.scrollTop = 0;
    
    startSecurityTimer(isDone);
}

function startSecurityTimer(isAlreadyDone) {
    const actionBar = document.getElementById('viewer-action-bar');
    actionBar.innerHTML = `<button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>`;
    const btn = document.getElementById('btn-next-chapter');
    
    const isLast = currentChapterIndex === courseData.chapitres.length - 1;
    const nextText = isLast ? "Terminer le cours" : "Valider l'étape et continuer";

    if (courseData.chapitres[currentChapterIndex].type === 'quiz') {
        btn.disabled = false;
        btn.innerHTML = `${SVG_DONE} Soumettre mes réponses`;
        btn.onclick = () => submitQuizAnswers(isLast);
        return;
    }

    if (isAdminOrTeacher || isAlreadyDone) {
        btn.disabled = false;
        btn.innerHTML = `${nextText} ${SVG_NEXT}`;
        btn.onclick = () => validateAndNext(isLast, 0);
        return;
    }

    let timeLeft = WAIT_TIME_SECONDS;
    btn.innerHTML = `${SVG_TIME} Veuillez patienter (${timeLeft}s)...`;

    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            btn.disabled = false;
            btn.innerHTML = `${nextText} ${SVG_NEXT}`;
            btn.onclick = () => validateAndNext(isLast, 0);
        } else {
            btn.innerHTML = `${SVG_TIME} Veuillez patienter (${timeLeft}s)...`;
        }
    }, 1000);
}

function submitQuizAnswers(isLast) {
    const chap = courseData.chapitres[currentChapterIndex];
    let score = 0;
    let totalPoints = 0;
    let allCorrect = true;
    
    chap.questions.forEach((q, qIndex) => {
        const selected = Array.from(document.querySelectorAll(`input[name="q_${qIndex}"]:checked`)).map(cb => parseInt(cb.value));
        const correct = q.correctIndices || [];
        const pts = q.points || 1;
        totalPoints += pts;
        
        const isQCorrect = (selected.length === correct.length && selected.every(val => correct.includes(val)));
        if (isQCorrect) {
            score += pts;
        } else {
            allCorrect = false;
        }
        
        q.options.forEach((opt, oIndex) => {
            const label = document.getElementById(`label_q_${qIndex}_o_${oIndex}`);
            const checkbox = label.querySelector('input');
            checkbox.disabled = true; 
            label.classList.add('locked');
            
            if (correct.includes(oIndex)) {
                label.classList.add('correct'); 
            } else if (selected.includes(oIndex) && !correct.includes(oIndex)) {
                label.classList.add('wrong'); 
            }
        });
    });
    
    const resultBox = document.getElementById('quiz-result-box');
    const actionBar = document.getElementById('viewer-action-bar');
    resultBox.style.display = 'block';
    
    const nextText = isLast ? "Terminer le cours" : "Valider et passer à la suite";

    if (allCorrect || isAdminOrTeacher) {
        resultBox.style.borderColor = "var(--accent-green)";
        resultBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:1rem;">
                <svg width="32" height="32" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                <h3 style="margin:0; color: var(--text-main); font-size: 1.5rem;">Score : ${score} / ${totalPoints} points !</h3>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 0;">Excellent travail. Si vous avez battu votre record, l'expérience (XP) a été ajoutée à votre profil.</p>
        `;
    } else {
        resultBox.style.borderColor = "var(--accent-yellow)";
        resultBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:1rem;">
                <svg width="32" height="32" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                <h3 style="margin:0; color: var(--text-main); font-size: 1.5rem;">Score : ${score} / ${totalPoints} points.</h3>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 0;">Certaines réponses sont incorrectes. Observez la correction, vous pouvez réessayer ou passer à la suite.</p>
        `;
    }

    // FIX : On affiche TOUJOURS les deux options, qu'on ait bon ou faux !
    actionBar.innerHTML = `
        <button id="btn-retry-quiz" class="btn-validate" style="background: transparent; color: var(--text-main); border: 2px solid var(--border-color); margin-right: 1rem; box-shadow: none;">Refaire le test</button>
        <button id="btn-next-chapter" class="btn-validate">${nextText} ${SVG_NEXT}</button>
    `;
    document.getElementById('btn-retry-quiz').onclick = () => loadChapter(currentChapterIndex, true);
    document.getElementById('btn-next-chapter').onclick = () => validateAndNext(isLast, score);
}

async function validateAndNext(isLast, scoreEarned = 0) {
    const chapId = courseData.chapitres[currentChapterIndex].id;
    const btn = document.getElementById('btn-next-chapter');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Validation...";
    }

    const updatedProgress = await validateChapterProgress(currentUid, courseData.id, chapId, courseData.chapitres.length, scoreEarned);
    
    if (updatedProgress) {
        userProgress = updatedProgress; 
        renderSidebar();

        if (isLast) {
            document.getElementById('btn-back-dynamic').click(); 
        } else {
            loadChapter(currentChapterIndex + 1);
        }
    } else {
        alert("Erreur réseau. Veuillez réessayer.");
        if(btn) {
            btn.disabled = false;
            btn.textContent = isLast ? "Terminer le cours" : "Valider l'étape et continuer";
        }
    }
}
