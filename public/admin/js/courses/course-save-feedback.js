export function showSaveConfirmation({ actionType, isPublishing, isRejecting, hadPendingMedia }) {
    if (isPublishing) {
        alert("Le cours a été publié. Les notifications ont été envoyées au professeur et aux élèves.");
        return;
    }

    if (isRejecting) {
        alert("Le cours a été refusé. Le professeur a été notifié.");
        return;
    }

    if (hadPendingMedia) {
        alert(actionType === 'submit'
            ? 'Cours envoyé pour validation. Médias envoyés dans Storage.'
            : 'Cours sauvegardé. Médias envoyés dans Storage.'
        );
        return;
    }

    alert(actionType === 'submit' ? 'Cours envoyé pour validation.' : 'Cours sauvegardé.');
}

export function isAdminAuthor(authorId, users = []) {
    const user = users.find(candidate => candidate.id === authorId);
    return user?.isGod === true || user?.role === 'admin';
}

export function shouldHideDraftForAdmin(courseData, { currentUserProfile, currentUid, users = [] } = {}) {
    const status = courseData.statutValidation || (courseData.actif === true ? 'approved' : 'draft');
    const isAdminLike = currentUserProfile?.isGod === true || currentUserProfile?.role === 'admin';
    return isAdminLike && status === 'draft' && courseData.auteurId !== currentUid && !isAdminAuthor(courseData.auteurId, users);
}

export function getAuthorName(authorId, courseData = null, { currentUserProfile, currentUid, users = [] } = {}) {
    if (!authorId) return "Auteur inconnu";

    const authorObj = users.find(user => user.id === authorId);
    const isAdminLike = currentUserProfile?.isGod === true || currentUserProfile?.role === 'admin';

    if (!authorObj) {
        return (!isAdminLike && courseData?.auteurId !== currentUid) ? "Équipe SBI" : "Auteur introuvable";
    }

    return (authorObj.prenom || authorObj.nom)
        ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim()
        : (authorObj.email || "Auteur introuvable");
}
