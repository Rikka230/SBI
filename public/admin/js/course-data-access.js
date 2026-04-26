/**
 * =======================================================================
 * COURSE DATA ACCESS
 * =======================================================================
 *
 * Lectures Firestore adaptées au rôle :
 *
 * Admin / isGod :
 * - users : tous
 * - formations : toutes
 * - courses : tous
 *
 * Teacher :
 * - users : uniquement son propre profil pour admin-courses.js
 * - formations : formations où il est dans profs[]
 * - courses : cours dont il est auteur
 *
 * Objectif :
 * - éviter les scans globaux côté professeur
 * - préparer le durcissement Firestore Rules
 * - garder admin-courses.js sous contrôle
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
    collection,
    doc,
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

    const formationsQuery = query(
        collection(db, "formations"),
        where("profs", "array-contains", currentUid)
    );

    const snap = await getDocs(formationsQuery);
    return snapToArray(snap);
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

    const coursesQuery = query(
        collection(db, "courses"),
        where("auteurId", "==", currentUid)
    );

    const snap = await getDocs(coursesQuery);
    return snapToArray(snap);
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
     * Teacher : vérifie ses cours. Suffisant pour ses brouillons/copies.
     */
    return loadCoursesForCourseAccess({
        currentUid,
        currentUserProfile
    });
}
