/**
 * =======================================================================
 * MES COURS - Logique de navigation Formations -> Blocs -> Cours
 * =======================================================================
 *
 * 8.0F : devient montable via mountStudentCourses() pour le shell PJAX.
 * Le viewer de cours reste en navigation classique.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { getUserLearningProgress } from '/js/course-engine.js';
import {
    courseBelongsToFormation as sharedCourseBelongsToFormation,
    fetchCoursesByIds,
    isCourseVisible,
    loadAssignedFormationsForUser,
    loadCoursesForUser,
    uniqById
} from '/js/learning-access.js';

let currentUid = null;
let userData = {};
let allCourses = [];
let assignedFormations = [];
let userProgress = { courses: {}, formations: {} };
let activeCleanup = null;

function resetState() {
    currentUid = null;
    userData = {};
    allCourses = [];
    assignedFormations = [];
    userProgress = { courses: {}, formations: {} };
}

export function mountStudentCourses() {
    activeCleanup?.({ reason: 'remount' });
    resetState();

    let disposed = false;
    let unsubscribeAuth = null;
    const cleanups = [];

    const addCleanup = (cleanup) => {
        if (typeof cleanup === 'function') cleanups.push(cleanup);
    };

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (disposed) return;

        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        currentUid = user.uid;

        try {
            await waitForSbiTopbar();
            await loadStudentProfile();
            await loadStudentProgress();
            updateTopBar();
            updateLevel();

            await loadAssignedFormations();
            await loadAssignedCourses();
            renderAssignedFormations();
            bindStudentCoursesEvents(addCleanup);
        } catch (error) {
            console.error("Erreur d'initialisation :", error);
            showFormationsError();
        } finally {
            document.body.classList.remove('preload');
        }
    });

    const cleanup = () => {
        disposed = true;
        unsubscribeAuth?.();
        cleanups.splice(0, cleanups.length).forEach((fn) => {
            try { fn(); } catch {}
        });
        if (activeCleanup === cleanup) activeCleanup = null;
    };

    activeCleanup = cleanup;
    return cleanup;
}

function bindStudentCoursesEvents(addCleanup) {
    const backButton = document.getElementById('btn-back-formations');
    const searchInput = document.getElementById('search-course-input');

    if (backButton && backButton.dataset.sbiBound !== 'true') {
        backButton.dataset.sbiBound = 'true';

        const handler = () => {
            const viewCourses = document.getElementById('view-courses');
            const viewFormations = document.getElementById('view-formations');

            if (viewCourses) viewCourses.style.display = 'none';
            if (viewFormations) viewFormations.style.display = 'flex';
        };

        backButton.addEventListener('click', handler);
        addCleanup(() => backButton.removeEventListener('click', handler));
    }

    if (searchInput && searchInput.dataset.sbiBound !== 'true') {
        searchInput.dataset.sbiBound = 'true';

        const handler = (event) => {
            const term = event.target.value.toLowerCase();

            document.querySelectorAll('.course-item').forEach(item => {
                const title = item.querySelector('.course-title')?.textContent?.toLowerCase() || '';
                item.style.display = title.includes(term) ? 'flex' : 'none';
            });
        };

        searchInput.addEventListener('input', handler);
        addCleanup(() => searchInput.removeEventListener('input', handler));
    }
}

async function loadStudentProfile() {
    const snap = await getDoc(doc(db, "users", currentUid));
    userData = snap.exists() ? snap.data() : {};
}

async function loadStudentProgress() {
    userProgress = await getUserLearningProgress(currentUid);

    if (!userProgress.courses) userProgress.courses = {};
    if (!userProgress.formations) userProgress.formations = {};
}

function updateTopBar() {
    const name = userData.prenom || userData.nom || "Étudiant";

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) topUserName.textContent = name;

    const topUserAvatar = document.getElementById('top-user-avatar');

    if (topUserAvatar) {
        if (userData.photoURL) {
            topUserAvatar.innerHTML = `<img src="${escapeAttr(userData.photoURL)}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            topUserAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

function updateLevel() {
    const xp = userData.xp || 0;
    const level = Math.floor(xp / 100) + 1;

    const topUserLevel = document.getElementById('top-user-level');
    if (topUserLevel) topUserLevel.textContent = `Niveau ${level}`;
}

function isAdminPreview() {
    return userData.role === 'admin' || userData.isGod === true;
}

async function loadAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (list) list.innerHTML = '<p style="color:var(--text-muted);">Chargement des formations...</p>';

    assignedFormations = await loadAssignedFormationsForUser({
        uid: currentUid,
        userData,
        role: isAdminPreview() ? 'admin' : 'student'
    });
}

async function loadAssignedCourses() {
    const coursesFromAccess = await loadCoursesForUser({
        uid: currentUid,
        userData,
        role: isAdminPreview() ? 'admin' : 'student',
        formations: assignedFormations,
        progress: userProgress,
        includeProgress: true,
        activeOnly: !isAdminPreview()
    });

    const coursesFromNotifications = await loadNotificationLinkedCourses();

    allCourses = uniqById([...coursesFromAccess, ...coursesFromNotifications])
        .filter((course) => isAdminPreview() || isCourseVisible(course, { allowProgress: true }));
}

async function loadNotificationLinkedCourses() {
    if (!currentUid || isAdminPreview()) return [];

    const courseIds = new Set();

    async function collectFromQuery(queryRef, label) {
        try {
            const snap = await getDocs(queryRef);

            snap.forEach((docSnap) => {
                const notif = docSnap.data() || {};
                if (notif.status === 'resolved' || notif.resolvedAt) return;
                if (Array.isArray(notif.dismissedBy) && notif.dismissedBy.includes(currentUid)) return;

                const courseId = String(notif.courseId || '').trim();
                if (courseId) courseIds.add(courseId);
            });
        } catch (error) {
            console.warn(`[SBI Student Courses] Notifications ${label} non utilisables pour récupérer les cours :`, error);
        }
    }

    await Promise.all([
        collectFromQuery(
            query(collection(db, 'notifications'), where('destinataireId', '==', currentUid)),
            'directes'
        ),
        collectFromQuery(
            query(collection(db, 'notifications'), where('targetStudents', 'array-contains', currentUid)),
            'targetStudents'
        )
    ]);

    const courses = await fetchCoursesByIds(Array.from(courseIds));
    return courses.map((course) => ({ ...course, __notificationLinked: true }));
}

function renderAssignedFormations() {
    const list = document.getElementById('formations-list');
    if (!list) return;

    const formationCards = getFormationCardsToRender();

    if (formationCards.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);">Aucune formation ne vous est assignée.</p>';
        return;
    }

    list.innerHTML = formationCards.map((formation) => {
        const totalCourses = getCoursesForFormation(formation).length;
        const completedCourses = getCompletedCoursesForFormation(formation);
        const progressPercent = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);

        return `
            <div class="formation-folder" data-formation-id="${escapeAttr(formation.id)}" data-formation-title="${escapeAttr(formation.titre || 'Formation')}">
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
            const formation = getFormationCardsToRender().find((item) => item.id === folder.dataset.formationId);
            window.openFormation(formation || {
                id: folder.dataset.formationId,
                titre: folder.dataset.formationTitle
            });
        });
    });
}

function getFormationCardsToRender() {
    const directCourses = getDirectAssignedCoursesWithoutVisibleFormation();
    const cards = [...assignedFormations];

    if (directCourses.length > 0) {
        cards.push({
            id: '__direct_assigned_courses',
            titre: 'Cours assignés',
            __directCourses: true
        });
    }

    return cards;
}

function getDirectAssignedCoursesWithoutVisibleFormation() {
    return allCourses.filter((course) => {
        const isDirectlyLinked = course.__targetedToUser === true
            || course.__notificationLinked === true
            || course.__progressLinked === true
            || (Array.isArray(course.targetStudents) && course.targetStudents.includes(currentUid));

        if (!isDirectlyLinked) return false;

        const belongsToVisibleFormation = assignedFormations.some((formation) => {
            return sharedCourseBelongsToFormation(course, formation, assignedFormations);
        });

        return !belongsToVisibleFormation;
    });
}

function getCoursesForFormation(formation) {
    if (formation?.__directCourses === true) {
        return getDirectAssignedCoursesWithoutVisibleFormation();
    }

    return allCourses.filter((course) => sharedCourseBelongsToFormation(course, formation, assignedFormations));
}

function getCompletedCoursesForFormation(formation) {
    return getCoursesForFormation(formation).filter((course) => {
        return userProgress.courses[course.id]?.status === 'done';
    }).length;
}

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
        if (!coursesByBloc[blocName]) coursesByBloc[blocName] = [];
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
        <div class="course-item" onclick="window.location.href='/student/cours-viewer.html?id=${course.id}'" data-sbi-no-pjax="true">
            <div style="display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; background:rgba(42, 87, 255, 0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--accent-blue);">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
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
        return `<span style="background:rgba(42, 87, 255, 0.1); color:var(--accent-blue); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Terminé</span>`;
    }

    if (progressData.status === 'in_progress') {
        return `<span style="background:rgba(251,188,4,0.1); color:var(--accent-yellow); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">En cours (${doneChapters}/${totalChapters})</span>`;
    }

    return '';
}

function buildQuizScoreHTML(course, progressData) {
    const chapters = Array.isArray(course.chapitres) ? course.chapitres : [];
    const hasQuiz = chapters.some((chapter) => chapter.type === 'quiz');

    if (!hasQuiz || !progressData.quizScores) return '';

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

    return `<span style="font-size: 0.85rem; color: var(--text-muted); background: #f3f4f6; padding: 4px 8px; border-radius: 6px; margin-right: 10px; font-weight: bold;">Score: ${earnedScore}/${totalPossible} ${starSvg}</span>`;
}

function sortCourses(a, b) {
    const blocCompare = String(a.bloc || '').localeCompare(String(b.bloc || ''), 'fr', { sensitivity: 'base' });
    if (blocCompare !== 0) return blocCompare;
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' });
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#096;');
}

function showFormationsError() {
    const list = document.getElementById('formations-list');
    if (list) list.innerHTML = '<p style="color:red;">Erreur lors du chargement des formations.</p>';
}


window.SBI_STUDENT_COURSES_DEBUG = function() {
    const payload = {
        uid: currentUid,
        assignedFormations: assignedFormations.map((formation) => ({
            id: formation.id,
            titre: formation.titre
        })),
        allCourses: allCourses.map((course) => ({
            id: course.id,
            titre: course.titre,
            actif: course.actif,
            statutValidation: course.statutValidation,
            formations: course.formations || [],
            targetFormationIds: course.targetFormationIds || [],
            targetFormationTitles: course.targetFormationTitles || [],
            targetStudents: course.targetStudents || [],
            notificationLinked: course.__notificationLinked === true,
            targetedToUser: course.__targetedToUser === true,
            progressLinked: course.__progressLinked === true
        })),
        directCourses: getDirectAssignedCoursesWithoutVisibleFormation().map((course) => ({
            id: course.id,
            titre: course.titre
        }))
    };

    console.table(payload.assignedFormations);
    console.table(payload.allCourses);
    console.table(payload.directCourses);
    return payload;
};

function autoMountStudentCourses() {
    if (window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES) return;
    if (!document.getElementById('formations-list')) return;
    mountStudentCourses();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountStudentCourses, { once: true });
} else {
    autoMountStudentCourses();
}
