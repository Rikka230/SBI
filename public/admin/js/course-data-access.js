/**
 * =======================================================================
 * COURSE DATA ACCESS
 * =======================================================================
 *
 * Lectures Firestore adaptées au rôle.
 *
 * Admin / isGod :
 * - users : tous
 * - formations : toutes
 * - courses : tous
 *
 * Teacher :
 * - users : uniquement son propre profil pour éviter de polluer les accès
 * - formations : formations où il est prof + fallback par users/{uid}.formationIds
 * - courses : ses cours + cours actifs liés à ses formations
 *
 * Objectifs :
 * - garder les pages prof utilisables avec les règles 5.3 stabilisées
 * - permettre aux profs de voir les blocs/cours actifs déjà créés par admin
 * - conserver la séparation édition : un prof ne modifie que ses propres cours
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function isAdminLikeProfile(profile) {
    return profile?.isGod === true || profile?.role === 'admin';
}

function snapToArray(snapshot) {
    const items = [];

    snapshot.forEach((docSnap) => {
        items.push({
            id: docSnap.id,
            ...docSnap.data()
        });
    });

    return items;
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

function chunkArray(items, size = 10) {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

async function loadCurrentUserOnly(currentUid, currentUserProfile = null) {
    if (!currentUid) return [];

    if (currentUserProfile) {
        return [{
            id: currentUid,
            ...currentUserProfile
        }];
    }

    const snap = await getDoc(doc(db, "users", currentUid));

    if (!snap.exists()) return [];

    return [{
        id: snap.id,
        ...snap.data()
    }];
}

function getFormationIdsFromProfile(profile) {
    return Array.isArray(profile?.formationIds)
        ? profile.formationIds.filter(Boolean).map(String)
        : [];
}

async function loadFormationsByIds(formationIds) {
    if (!formationIds.length) return [];

    const formations = [];
    const chunks = chunkArray(formationIds, 10);

    for (const chunk of chunks) {
        const byIdsQuery = query(
            collection(db, "formations"),
            where(documentId(), "in", chunk)
        );

        const snap = await getDocs(byIdsQuery);
        formations.push(...snapToArray(snap));
    }

    return formations;
}

export async function loadUsersForCourseAccess({
    currentUid,
    currentUserProfile
} = {}) {
    if (isAdminLikeProfile(currentUserProfile)) {
        const snap = await getDocs(collection(db, "users"));
        return snapToArray(snap);
    }

    return loadCurrentUserOnly(currentUid, currentUserProfile);
}

export async function loadFormationsForCourseAccess({
    currentUid,
    currentUserProfile
} = {}) {
    if (isAdminLikeProfile(currentUserProfile)) {
        const snap = await getDocs(collection(db, "formations"));
        return snapToArray(snap);
    }

    if (!currentUid) return [];

    const formations = [];

    const formationsByProfQuery = query(
        collection(db, "formations"),
        where("profs", "array-contains", currentUid)
    );

    const byProfSnap = await getDocs(formationsByProfQuery);
    formations.push(...snapToArray(byProfSnap));

    const formationIds = getFormationIdsFromProfile(currentUserProfile);

    if (formationIds.length > 0) {
        formations.push(...await loadFormationsByIds(formationIds));
    }

    return uniqById(formations).sort((a, b) => {
        return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', {
            sensitivity: 'base'
        });
    });
}

async function loadOwnTeacherCourses(currentUid) {
    const coursesQuery = query(
        collection(db, "courses"),
        where("auteurId", "==", currentUid)
    );

    const snap = await getDocs(coursesQuery);
    return snapToArray(snap);
}

async function loadActiveCoursesByFormationValues(formationValues) {
    if (!formationValues.length) return [];

    const courses = [];
    const chunks = chunkArray(formationValues, 10);

    for (const chunk of chunks) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await getDocs(coursesQuery);
        courses.push(...snapToArray(snap));
    }

    return courses;
}

export async function loadCoursesForCourseAccess({
    currentUid,
    currentUserProfile
} = {}) {
    if (isAdminLikeProfile(currentUserProfile)) {
        const snap = await getDocs(collection(db, "courses"));
        return snapToArray(snap);
    }

    if (!currentUid) return [];

    const courses = [];
    const assignedFormations = await loadFormationsForCourseAccess({
        currentUid,
        currentUserProfile
    });

    const formationIds = assignedFormations.map(f => f.id).filter(Boolean).map(String);
    const formationTitles = assignedFormations.map(f => f.titre).filter(Boolean).map(String);

    courses.push(...await loadOwnTeacherCourses(currentUid));
    courses.push(...await loadActiveCoursesByFormationValues(formationIds));

    /**
     * Compatibilité anciens cours : certains documents ont encore stocké le
     * titre de formation au lieu de son ID dans courses/{id}.formations.
     */
    courses.push(...await loadActiveCoursesByFormationValues(formationTitles));

    return uniqById(courses).sort((a, b) => {
        const aDate = a.dateCreation?.toMillis ? a.dateCreation.toMillis() : 0;
        const bDate = b.dateCreation?.toMillis ? b.dateCreation.toMillis() : 0;
        return bDate - aDate;
    });
}

export async function loadCoursesForMediaSafety({
    currentUid,
    currentUserProfile
} = {}) {
    /**
     * Utilisé lors de la suppression d’un cours pour éviter de supprimer
     * un média Storage encore utilisé par un autre cours.
     *
     * Admin : vérifie tous les cours.
     * Teacher : vérifie ses cours + les cours actifs de ses formations.
     */
    return loadCoursesForCourseAccess({
        currentUid,
        currentUserProfile
    });
}
