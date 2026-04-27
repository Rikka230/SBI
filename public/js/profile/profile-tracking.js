import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getUserLearningProgress, resetCourseProgress, updateQuizScore } from '/js/course-engine.js';
import { loadCoursesForUser, roleOf } from '/js/learning-access.js';
import { getVisibleFormationsForProfile } from './profile-formations.js';
import {
  computeQuizMaxScore,
  escapeHTML,
  formatScore,
  getCourseChapterIds,
  normalizeList,
  parseGradeInput,
  SVG_EDIT,
  SVG_RESET,
  uniqueById
} from './profile-utils.js';

async function fetchCourseById(db, courseId) {
  try {
    const snap = await getDoc(doc(db, 'courses', courseId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.warn(`[SBI Profile] Cours inaccessible : ${courseId}`, error);
    return null;
  }
}

async function fetchCoursesByIds(db, courseIds) {
  const ids = normalizeList(courseIds);
  if (!ids.length) return [];
  const courses = await Promise.all(ids.map((courseId) => fetchCourseById(db, courseId)));
  return courses.filter(Boolean);
}

export async function renderLearningTracking({ db, uid, context, reloadProfile }) {
  const list = document.getElementById('prof-tracking-list');
  if (!list) return;

  list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">Chargement du dossier...</p>';

  try {
    const progress = await getUserLearningProgress(uid);
    const targetUserData = context.currentProfileData || {};
    const assignedFormations = await getVisibleFormationsForProfile({
      uid,
      targetUserData,
      loggedInUserId: context.loggedInUserId,
      loggedInUserData: context.loggedInUserData || {},
      isOwner: context.isOwner,
      isAdmin: context.isAdmin
    });

    const activeCourses = await loadCoursesForUser({
      uid,
      userData: targetUserData,
      role: roleOf(targetUserData, targetUserData.role || 'student'),
      formations: assignedFormations,
      progress,
      includeProgress: true,
      activeOnly: true
    });

    const allCourses = {};
    const coursesToShow = new Set();

    activeCourses.forEach((courseData) => {
      allCourses[courseData.id] = courseData;
      coursesToShow.add(courseData.id);
    });

    const progressCourseIds = Object.keys(progress.courses || {});

    if (context.isOwner || context.isAdmin) {
      const missingProgressCourseIds = progressCourseIds.filter((courseId) => !allCourses[courseId]);
      const progressCourses = await fetchCoursesByIds(db, missingProgressCourseIds);
      progressCourses.forEach((courseData) => {
        allCourses[courseData.id] = courseData;
        coursesToShow.add(courseData.id);
      });
    } else {
      progressCourseIds.forEach((courseId) => {
        if (allCourses[courseId]) coursesToShow.add(courseId);
      });
    }

    const sortedCourseIds = Array.from(coursesToShow).sort((a, b) => String(allCourses[a]?.titre || '').localeCompare(String(allCourses[b]?.titre || ''), 'fr', { sensitivity: 'base' }));

    if (sortedCourseIds.length === 0) {
      list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Aucun cours assigné ou commencé.</p>';
      return;
    }

    list.innerHTML = '';
    sortedCourseIds.forEach((courseId) => {
      const courseData = allCourses[courseId];
      if (!courseData) return;
      list.insertAdjacentHTML('beforeend', buildTrackingItem({ courseId, courseData, progress, isAdmin: context.isAdmin }));
    });

    bindTrackingSearch();
    if (context.isAdmin) bindAdminTrackingActions({ db, uid, allCourses, reloadProfile });
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p style="color: var(--accent-red); font-size: 0.9rem;">Erreur de chargement du suivi.</p>';
  }
}

function buildTrackingItem({ courseId, courseData, progress, isAdmin }) {
  const progressData = progress.courses?.[courseId] || { status: 'todo', completedChapters: [] };
  const completedCount = Array.isArray(progressData.completedChapters) ? progressData.completedChapters.length : 0;
  const totalCount = Array.isArray(courseData.chapitres) ? courseData.chapitres.length : 0;
  const isStudentUI = !window.location.pathname.includes('admin');

  const statusBadge = buildStatusBadge(progressData.status, isStudentUI);
  const quizHtml = buildQuizHtml({ courseId, courseData, progressData, isAdmin, isStudentUI });
  const resetBtnHtml = isAdmin
    ? `<button class="action-btn btn-reset-course danger" data-course="${escapeHTML(courseId)}" style="width: auto; margin: 0; padding: 6px 10px; font-size: 0.8rem;">${SVG_RESET} Réinitialiser</button>`
    : '';

  return `
    <div class="tracking-item" style="background: ${isStudentUI ? 'white' : '#111'}; border: 1px solid ${isStudentUI ? 'var(--border-color)' : '#333'}; border-radius: 8px; padding: 1rem; box-shadow: ${isStudentUI ? '0 2px 10px rgba(0,0,0,0.02)' : 'none'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <div>
          <h5 class="tracking-title" style="margin: 0 0 0.5rem 0; color: var(--accent-blue); font-size: 1rem;">${escapeHTML(courseData.titre || 'Cours')}</h5>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${statusBadge}
            <span style="font-size: 0.8rem; color: var(--text-muted);">Étapes: ${completedCount} / ${totalCount}</span>
          </div>
        </div>
        ${resetBtnHtml}
      </div>
      ${quizHtml}
    </div>
  `;
}

function buildStatusBadge(status, isStudentUI) {
  if (status === 'done') {
    return '<span style="background: rgba(42, 87, 255, 0.1); color: var(--accent-blue); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Terminé</span>';
  }

  if (status === 'in_progress') {
    return '<span style="background: rgba(251, 188, 4, 0.1); color: var(--accent-yellow); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">En cours</span>';
  }

  return `<span style="background: ${isStudentUI ? '#f3f4f6' : 'rgba(255, 255, 255, 0.1)'}; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">À faire</span>`;
}

function buildQuizHtml({ courseId, courseData, progressData, isAdmin, isStudentUI }) {
  if (!Array.isArray(courseData.chapitres)) return '';

  return courseData.chapitres.map((chapter) => {
    if (chapter.type !== 'quiz') return '';
    const totalPossible = computeQuizMaxScore(chapter);
    const scoreObtained = progressData.quizScores?.[chapter.id] !== undefined ? Number(progressData.quizScores[chapter.id]) || 0 : 0;
    const scoreDisplay = formatScore(scoreObtained);
    const maxScoreDisplay = formatScore(totalPossible);
    const editBtnHtml = isAdmin
      ? `<button class="action-btn btn-edit-grade" data-course="${escapeHTML(courseId)}" data-chapter="${escapeHTML(chapter.id)}" data-current="${escapeHTML(scoreDisplay)}" data-max="${totalPossible}" style="width: auto; margin: 0; padding: 4px 8px; font-size: 0.75rem; background: #333; color: white; border: none;">${SVG_EDIT} Éditer</button>`
      : '';

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; background: ${isStudentUI ? '#f9fafb' : 'rgba(0,0,0,0.2)'}; padding: 0.5rem 1rem; border-radius: 6px; margin-top: 0.8rem; border: 1px solid ${isStudentUI ? 'var(--border-color)' : 'transparent'};">
        <span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHTML(chapter.titre || 'Quiz')}</span>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 0.85rem; font-weight: bold; color: ${scoreObtained === totalPossible && totalPossible > 0 ? 'var(--accent-blue)' : 'var(--text-main)'};">Score: ${scoreDisplay} / ${maxScoreDisplay}</span>
          ${editBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

function bindTrackingSearch() {
  const searchInput = document.getElementById('search-tracking-admin');
  if (!searchInput) return;

  searchInput.oninput = (event) => {
    const term = event.target.value.toLowerCase();
    document.querySelectorAll('.tracking-item').forEach((item) => {
      const title = item.querySelector('.tracking-title')?.textContent?.toLowerCase() || '';
      item.style.display = title.includes(term) ? 'block' : 'none';
    });
  };
}

function bindAdminTrackingActions({ uid, allCourses, reloadProfile }) {
  document.querySelectorAll('.btn-reset-course').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const courseId = event.currentTarget.getAttribute('data-course');
      if (!confirm("Réinitialiser ce cours ? L'élève perdra sa progression et l'XP liée aux QCM de ce cours. Cette action est irréversible.")) return;

      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Reset...';

      const success = await resetCourseProgress(uid, courseId);
      if (success) {
        await reloadProfile(uid);
      } else {
        alert('Erreur lors de la réinitialisation.');
        event.currentTarget.disabled = false;
      }
    });
  });

  document.querySelectorAll('.btn-edit-grade').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const courseId = event.currentTarget.getAttribute('data-course');
      const chapterId = event.currentTarget.getAttribute('data-chapter');
      const currentScore = event.currentTarget.getAttribute('data-current');
      const maxScore = event.currentTarget.getAttribute('data-max');
      const maxScoreLabel = Number(maxScore) > 0 ? ` / ${formatScore(maxScore)}` : '';
      const newScoreStr = prompt(`Modifier la note.\nActuelle : ${currentScore}${maxScoreLabel}\n\nÉcris uniquement la note obtenue, par exemple : 1 ou 1.5.\nLe /2 reste accepté si tu le tapes, mais il n'est pas nécessaire.\n\nCette action ajuste l'XP globale de l'élève et marque le cours comme terminé.`, currentScore);

      if (newScoreStr === null) return;
      const newScore = parseGradeInput(newScoreStr, maxScore);
      if (newScore === null) {
        alert('Note invalide. Écris uniquement la note obtenue, par exemple : 1 ou 1.5.');
        return;
      }

      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Sauvegarde...';

      const courseData = allCourses[courseId] || {};
      const chapterIdsToComplete = getCourseChapterIds(courseData);
      const success = await updateQuizScore(uid, courseId, chapterId, newScore, chapterIdsToComplete);

      if (success) {
        await reloadProfile(uid);
      } else {
        alert('Erreur lors de la mise à jour.');
        event.currentTarget.disabled = false;
      }
    });
  });
}
