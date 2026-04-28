/**
 * =======================================================================
 * COURSE ACTION BUTTONS
 * =======================================================================
 * Centralise les boutons affichés sur les cartes cours.
 * Un prof peut éditer/supprimer uniquement ses propres brouillons.
 * Les cours actifs créés par admin sont visualisables et copiables.
 * =======================================================================
 */

const DELETE_COURSE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.42 1.42Z"/></svg>`;

function canEditCourse({ courseData, currentUid, isAdminLike }) {
    return isAdminLike || courseData?.auteurId === currentUid;
}

function getPreviewUrl(courseId, isAdminLike) {
    const isTeacherArea = window.location.pathname.startsWith('/teacher/');
    const basePath = isTeacherArea && !isAdminLike ? '/teacher/cours-viewer.html' : '/student/cours-viewer.html';

    return `${basePath}?id=${encodeURIComponent(courseId)}&preview=true`;
}

function canDeleteCourse({ courseData, currentUid, isAdminLike }) {
    if (isAdminLike) return true;

    const status = courseData?.statutValidation || (courseData?.actif === true ? 'approved' : 'draft');

    return courseData?.auteurId === currentUid
        && courseData?.actif === false
        && status === 'draft';
}

export function renderCourseActionButtons({ courseId, courseData, currentUid, isAdminLike }) {
    const buttons = [
        `<button class="action-btn" style="width: auto; margin: 0; color: var(--accent-yellow, #fbbc04); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.duplicateCourse('${courseId}')" title="Créer une copie">Copier</button>`
    ];

    if (canEditCourse({ courseData, currentUid, isAdminLike })) {
        buttons.push(`<button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.editCourse('${courseId}')">Éditer</button>`);
    } else {
        const previewUrl = getPreviewUrl(courseId, isAdminLike);
        buttons.push(`<button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.open('${previewUrl}', '_blank')">Visualiser</button>`);
    }

    if (canDeleteCourse({ courseData, currentUid, isAdminLike })) {
        buttons.push(`<button class="action-btn danger course-delete-icon-btn" style="width: 40px; min-width: 40px; height: 40px; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="window.deleteCourse('${courseId}')" title="Supprimer le cours" aria-label="Supprimer le cours">${DELETE_COURSE_SVG}</button>`);
    }

    return buttons.join('');
}
