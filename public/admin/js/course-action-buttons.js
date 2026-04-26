/**
 * =======================================================================
 * COURSE ACTION BUTTONS
 * =======================================================================
 * Centralise les boutons affichés sur les cartes cours.
 * Un prof peut éditer/supprimer uniquement ses propres brouillons.
 * Les cours actifs créés par admin sont visualisables et copiables.
 * =======================================================================
 */

function canEditCourse({ courseData, currentUid, isAdminLike }) {
    return isAdminLike || courseData?.auteurId === currentUid;
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
        buttons.push(`<button class="action-btn" style="width: auto; margin: 0; color: var(--accent-blue); background: transparent; border: 1px solid var(--border-color, #333);" onclick="window.openCoursePreview('${courseId}')">Visualiser</button>`);
    }

    if (canDeleteCourse({ courseData, currentUid, isAdminLike })) {
        buttons.push(`<button class="action-btn danger" style="width: auto; margin: 0;" onclick="window.deleteCourse('${courseId}')">❌</button>`);
    }

    return buttons.join('');
}
