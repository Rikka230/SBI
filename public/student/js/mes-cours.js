/**
 * =======================================================================
 * MES COURS - Logique de navigation Formations -> Blocs -> Cours
 * =======================================================================
 *
 * Patch accès cours 6.7B :
 * - priorité à users/{uid}.formationIds, plus stable avec des rules strictes
 * - fallback formationsAcces legacy par titre
 * - fallback membership where("students", "array-contains", uid)
 * - les erreurs permission/index ne font plus tomber toute la page
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    documentId,
    getDocs,
    doc,
    getDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress } from '/js/course-engine.js';

let currentUid = null;
let userData = {};
let allCourses = [];
let assignedFormations = [];
let userProgress = { courses: {}, formations: {} };

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        currentUid = user.uid;

        try {
            await waitForSbiComponents();
            await loadStudentProfile();
            await loadStudentProgress();
            updateTopBar();
            updateLevel();

            await loadAssignedFormations();
            await loadAssignedCourses();
            renderAssignedFormations();

        } catch (error) {
            console.error("Erreur d'initialisation :", error);
            showFormationsError();
        } finally {
            document.body.classList.remove('preload');
        }
    });

    document.getElementById('btn-back-formations')?.addEventListener('click', () => {
        const viewCourses = document.getElementById('view-courses');
        const viewFormations = document.getElementById('view-formations');

        if (viewCourses) viewCourses.style.display = 'none';
        if (viewFormations) viewFormations.style.display = 'flex';
    });

    document.getElementById('search-course-input')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();

        document.querySelectorAll('.course-item').forEach(item => {
            const title = item.querySelector('.course-title')?.textContent?.toLowerCase() || '';
            item.style.display = title.includes(term) ? 'flex' : 'none';
        });
    });
});

async function waitForSbiComponents() {
    if (window.__SBI_COMPONENTS_READY === true) {
        await waitForElements(['top-user-name', 'top-user-avatar'], 1200);
        return;
    }

    if (window.SBI_COMPONENTS_READY && typeof window.SBI_COMPONENTS_READY.then === 'function') {
        await Promise.race([
            window.SBI_COMPONENTS_READY.catch(() => {}),
            sleep(1500)
        ]);
    } else {
        await new Promise((resolve) => {
            const timeout = window.setTimeout(resolve, 1500);
            window.addEventListener('sbi:components-ready', () => {
                window.clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    }

    await waitForElements(['top-user-name', 'top-user-avatar'], 1200);
}

async function waitForElements(ids, timeoutMs = 1200) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const ready = ids.every((id) => document.getElementById(id));
        if (ready) return true;
        await sleep(50);
    }

    return false;
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* =======================================================================
 * PROFIL / PROGRESSION
 * ======================================================================= */

async function loadStudentProfile() {
    const snap = await getDoc(doc(db, "users", currentUid));

    if (snap.exists()) {
        userData = snap.data();
    } else {
        userData = {};
    }
}

async function loadStudentProgress() {
    userProgress = await getUserLearningProgress(currentUid);

    if (!userProgress.courses) {
        userProgress.courses = {};
    }

    if (!userProgress.formations) {
        userProgress.formations = {};
    }
}

function updateTopBar() {
    const name = userData.prenom || userData.nom || "Étudiant";

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) {
        topUserName.textContent = name;
    }

    const topUserAvatar = document.getElementById('top-user-avatar');

    if (topUserAvatar) {
        if (userData.photoURL) {
            topUserAvatar.innerHTML = `<img src="${userData.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            topUserAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

function updateLevel() {
    const xp = userData.xp || 0;
    const level = Math.floor(xp / 100) + 1;

    const topUserLevel = document.getElementById('top-user-level');

    if (topUserLevel) {
        topUserLevel.textContent = `Niveau ${level}`;
    }
}

/* =======================================================================
 * CHARGEMENT QUERY-SAFE
 * ======================================================================= */

function isAdminPreview() {
    return userData.role === 'admin' || userData.isGod === true;
}

function chunkArray(items, size = 10) {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

function uniqById(items) {
    const map = new Map();

    items.forEach((item) => {
        if (item?.id) {
            map.set(item.id, item);
        }
    });

    return Array.from(map.values());
}

function normalizeFormationValues(values) {
    if (!Array.isArray(values)) return [];

    return Array.from(
        new Set(
            values
                .filter(Boolean)
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    );
}

async function safeGetDocs(queryRef, label = 'requête Firestore') {
    try {
        return await getDocs(queryRef);
    } catch (error) {
        console.warn(`[SBI Student Access] ${label} ignorée :`, error);
        return null;
    }
}

async function loadFormationsByIds(formationIds) {
    const safeIds = normalizeFormationValues(formationIds);
    if (!safeIds.length) return [];

    const formations = [];

    for (const chunk of chunkArray(safeIds, 10)) {
        const byIdsQuery = query(
            collection(db, "formations"),
            where(documentId(), "in", chunk)
        );

        const snap = await safeGetDocs(byIdsQuery, 'formations par IDs');
        if (!snap) continue;

        snap.forEach((docSnap) => {
            formations.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
    }

    return formations;
}

async function loadFormationsByTitles(formationTitles) {
    const safeTitles = normalizeFormationValues(formationTitles);
    if (!safeTitles.length) return [];

    const formations = [];

    for (const chunk of chunkArray(safeTitles, 10)) {
        const byTitleQuery = query(
            collection(db, "formations"),
            where("titre", "in", chunk)
        );

        const snap = await safeGetDocs(byTitleQuery, 'formations par titres legacy');
        if (!snap) continue;

        snap.forEach((docSnap) => {
            formations.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
    }

    return formations;
}

async function loadFormationsByMembership() {
    const assignedQuery = query(
        collection(db, "formations"),
        where("students", "array-contains", currentUid)
    );

    const snap = await safeGetDocs(assignedQuery, 'formations par students');
    if (!snap) return [];

    const formations = [];

    snap.forEach((docSnap) => {
        formations.push({
            id: docSnap.id,
            ...docSnap.data()
        });
    });

    return formations;
}

async function loadAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (list) {
        list.innerHTML = '<p style="color:var(--text-muted);">Chargement des formations...</p>';
    }

    assignedFormations = [];

    if (isAdminPreview()) {
        const snap = await safeGetDocs(collection(db, "formations"), 'toutes les formations admin');

        if (snap) {
            snap.forEach((docSnap) => {
                assignedFormations.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
        }

        assignedFormations.sort(sortByTitle);
        return;
    }

    assignedFormations = uniqById([
        ...await loadFormationsByIds(userData.formationIds || []),
        ...await loadFormationsByTitles(userData.formationsAcces || []),
        ...await loadFormationsByMembership()
    ]).sort(sortByTitle);
}

async function loadActiveCoursesByFormationValues(formationValues) {
    const safeValues = normalizeFormationValues(formationValues);

    if (safeValues.length === 0) {
        return [];
    }

    const courses = [];
    const chunks = chunkArray(safeValues, 10);

    for (const chunk of chunks) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await safeGetDocs(coursesQuery, 'cours actifs par formation');
        if (!snap) continue;

        snap.forEach((docSnap) => {
            courses.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
    }

    return courses;
}

async function loadAssignedCourses() {
    allCourses = [];

    if (isAdminPreview()) {
        const snap = await safeGetDocs(
            query(
                collection(db, "courses"),
                where("actif", "==", true)
            ),
            'cours actifs admin preview'
        );

        if (snap) {
            snap.forEach((docSnap) => {
                allCourses.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
        }

        allCourses.sort(sortCourses);
        return;
    }

    const formationIds = assignedFormations
        .map((formation) => formation.id)
        .filter(Boolean);

    const formationTitles = assignedFormations
        .map((formation) => formation.titre)
        .filter(Boolean);

    const courses = [];

    courses.push(...await loadActiveCoursesByFormationValues(formationIds));
    courses.push(...await loadActiveCoursesByFormationValues(formationTitles));

    allCourses = uniqById(courses).sort(sortCourses);
}

/* =======================================================================
 * RENDU FORMATIONS
 * ======================================================================= */

function renderAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (!list) return;

    if (assignedFormations.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);">Aucune formation ne vous est assignée.</p>';
        return;
    }

    list.innerHTML = assignedFormations.map((formation) => {
        const totalCourses = getCoursesForFormation(formation).length;
        const completedCourses = getCompletedCoursesForFormation(formation);
        const progressPercent = totalCourses === 0
            ? 0
            : Math.round((completedCourses / totalCourses) * 100);

        return `
            <div class="formation-folder" data-formation-id="${escapeHTML(formation.id)}" data-formation-title="${escapeHTML(formation.titre || 'Formation')}">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                    <div style="width:48px; height:48px; background:rgba(42, 87, 255, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--accent-blue);">
                        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                        </svg>
                    </div>
                    <h3 style="margin:0; font-size:1.1rem; color:var(--text-main);">${escapeHTML(formation.titre || 'Formation')}</h3>
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

    document.querySelectorAll('.formation-folder').forEach((folder) => {
        folder.addEventListener('click', () => {
            const formation = assignedFormations.find((item) => item.id === folder.dataset.formationId);
            window.openFormation(formation || {
                id: folder.dataset.formationId,
                titre: folder.dataset.formationTitle
            });
        });
    });
}

function courseBelongsToFormation(course, formation) {
    if (!course || !formation || !Array.isArray(course.formations)) {
        return false;
    }

    const formationValues = normalizeFormationValues(course.formations);
    const formationId = formation.id ? String(formation.id).trim() : '';
    const formationTitle = formation.titre ? String(formation.titre).trim() : '';

    return (
        (formationId && formationValues.includes(formationId)) ||
        (formationTitle && formationValues.includes(formationTitle))
    );
}

function getCoursesForFormation(formation) {
    return allCourses.filter((course) => courseBelongsToFormation(course, formation));
}

function getCompletedCoursesForFormation(formation) {
    return getCoursesForFormation(formation).filter((course) => {
        return userProgress.courses[course.id]?.status === 'done';
    }).length;
}

/* =======================================================================
 * RENDU COURS
 * ======================================================================= */

window.openFormation = function(formationOrId, formationTitre = '') {
    const formation = typeof formationOrId === 'object'
        ? formationOrId
        : assignedFormations.find((item) => item.id === formationOrId) || {
            id: formationOrId,
            titre: formationTitre
        };

    const viewFormations = document.getElementById('view-formations');
    const viewCourses = document.getElementById('view-courses');
    const title = document.getElementById('current-formation-title');
    const searchInput = document.getElementById('search-course-input');
    const container = document.getElementById('courses-list');

    if (viewFormations) viewFormations.style.display = 'none';
    if (viewCourses) viewCourses.style.display = 'flex';
    if (title) title.textContent = formation.titre || 'Formation';
    if (searchInput) searchInput.value = '';
    if (!container) return;

    container.innerHTML = '';

    const coursesInFormation = getCoursesForFormation(formation);

    if (coursesInFormation.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Aucun cours actif dans cette formation.</p>';
        return;
    }

    const coursesByBloc = groupCoursesByBloc(coursesInFormation);

    Object.entries(coursesByBloc).forEach(([blocName, courses]) => {
        container.insertAdjacentHTML('beforeend', `<div class="bloc-title">${escapeHTML(blocName)}</div>`);

        courses.forEach((course) => {
            container.insertAdjacentHTML('beforeend', buildCourseItemHTML(course));
        });
    });
};

function groupCoursesByBloc(courses) {
    const coursesByBloc = {};

    courses.forEach((course) => {
        const blocName = course.bloc || "Autres Cours";

        if (!coursesByBloc[blocName]) {
            coursesByBloc[blocName] = [];
        }

        coursesByBloc[blocName].push(course);
    });

    Object.keys(coursesByBloc).forEach((blocName) => {
        coursesByBloc[blocName].sort(sortCourses);
    });

    return coursesByBloc;
}

function buildCourseItemHTML(course) {
    const progressData = userProgress.courses[course.id] || {
        status: 'todo',
        completedChapters: []
    };

    const totalChapters = Array.isArray(course.chapitres) ? course.chapitres.length : 0;
    const doneChapters = Array.isArray(progressData.completedChapters) ? progressData.completedChapters.length : 0;
    const statusBadge = buildStatusBadge(progressData, doneChapters, totalChapters);
    const quizHtml = buildQuizScoreHTML(course, progressData);

    return `
        <div class="course-item" onclick="window.location.href='/student/cours-viewer.html?id=${course.id}'">
            <div style="display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; background:rgba(42, 87, 255, 0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--accent-blue);">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </div>

                <div>
                    <div class="course-title" style="font-weight:bold; color:var(--text-main); margin-bottom:4px;">
                        ${escapeHTML(course.titre || 'Cours')}
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">
                        ${totalChapters} étapes interactives
                    </div>
                </div>
            </div>

            <div style="display:flex; align-items:center;">
                ${quizHtml}
                ${statusBadge}
                <svg width="24" height="24" fill="var(--text-muted)" viewBox="0 0 24 24" style="margin-left:10px;">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </div>
        </div>
    `;
}

function buildStatusBadge(progressData, doneChapters, totalChapters) {
    if (progressData.status === 'done') {
        return `
            <span style="background:rgba(42, 87, 255, 0.1); color:var(--accent-blue); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">
                Terminé
            </span>
        `;
    }

    if (progressData.status === 'in_progress') {
        return `
            <span style="background:rgba(251,188,4,0.1); color:var(--accent-yellow); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">
                En cours (${doneChapters}/${totalChapters})
            </span>
        `;
    }

    return '';
}

function buildQuizScoreHTML(course, progressData) {
    const chapters = Array.isArray(course.chapitres) ? course.chapitres : [];
    const hasQuiz = chapters.some((chapter) => chapter.type === 'quiz');

    if (!hasQuiz || !progressData.quizScores) {
        return '';
    }

    let totalPossible = 0;
    let earnedScore = 0;

    chapters.forEach((chapter) => {
        if (chapter.type !== 'quiz') return;

        const questions = Array.isArray(chapter.questions) ? chapter.questions : [];

        questions.forEach((question) => {
            totalPossible += question.points || 1;
        });

        earnedScore += progressData.quizScores[chapter.id] || 0;
    });

    const starSvg = earnedScore === totalPossible && totalPossible > 0
        ? `<svg width="14" height="14" fill="var(--accent-blue)" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-left:4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
        : '';

    return `
        <span style="font-size: 0.85rem; color: var(--text-muted); background: #f3f4f6; padding: 4px 8px; border-radius: 6px; margin-right: 10px; font-weight: bold;">
            Score: ${earnedScore}/${totalPossible} ${starSvg}
        </span>
    `;
}

/* =======================================================================
 * HELPERS
 * ======================================================================= */

function sortByTitle(a, b) {
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', {
        sensitivity: 'base'
    });
}

function sortCourses(a, b) {
    const blocCompare = String(a.bloc || '').localeCompare(String(b.bloc || ''), 'fr', {
        sensitivity: 'base'
    });

    if (blocCompare !== 0) {
        return blocCompare;
    }

    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', {
        sensitivity: 'base'
    });
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showFormationsError() {
    const list = document.getElementById('formations-list');

    if (list) {
        list.innerHTML = '<p style="color:red;">Erreur lors du chargement des formations.</p>';
    }
}
