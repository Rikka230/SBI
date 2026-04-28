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
 * - formations : formationIds + formationsAcces legacy + formations où il est prof
 * - courses : ses cours + cours actifs liés à ses formations
 *
 * Important 6.7B : les requêtes membership peuvent être refusées selon les
 * rules actives ou les index Firestore. Elles ne doivent plus faire tomber
 * toute la page : on privilégie les IDs déjà synchronisés sur users/{uid}.
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

function normalizeList(values) {
    if (!Array.isArray(values)) return [];

    return Array.from(new Set(
        values
            .filter(Boolean)
            .map((value) => String(value).trim())
            .filter(Boolean)
    ));
}

function isDebugAccessEnabled() {
    try {
        return localStorage.getItem('sbiDebugAccess') === 'true';
    } catch {
        return false;
    }
}

function isExpectedAccessError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('permission-denied')
        || code.includes('failed-precondition')
        || message.includes('missing or insufficient permissions')
        || message.includes('permission')
        || message.includes('index');
}

async function safeGetDocs(queryRef, label = 'requête Firestore') {
    try {
        return await getDocs(queryRef);
    } catch (error) {
        if (isExpectedAccessError(error)) {
            if (isDebugAccessEnabled()) console.debug(`[SBI Access] ${label} ignorée :`, error);
            return null;
        }

        console.warn(`[SBI Access] ${label} ignorée :`, error);
        return null;
    }
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
    return normalizeList(profile?.formationIds);
}

function getFormationTitlesFromProfile(profile) {
    return normalizeList(profile?.formationsAcces);
}

async function loadFormationsByIds(formationIds) {
    const safeIds = normalizeList(formationIds);
    if (!safeIds.length) return [];

    const formations = [];
    const chunks = chunkArray(safeIds, 10);

    for (const chunk of chunks) {
        const byIdsQuery = query(
            collection(db, "formations"),
            where(documentId(), "in", chunk)
        );

        const snap = await safeGetDocs(byIdsQuery, 'formations par IDs');
        if (snap) formations.push(...snapToArray(snap));
    }

    return formations;
}

async function loadFormationsByTitles(formationTitles) {
    const safeTitles = normalizeList(formationTitles);
    if (!safeTitles.length) return [];

    const formations = [];
    const chunks = chunkArray(safeTitles, 10);

    for (const chunk of chunks) {
        const byTitlesQuery = query(
            collection(db, "formations"),
            where("titre", "in", chunk)
        );

        const snap = await safeGetDocs(byTitlesQuery, 'formations par titres legacy');
        if (snap) formations.push(...snapToArray(snap));
    }

    return formations;
}

async function loadFormationsByMembership(fieldName, currentUid) {
    if (!currentUid) return [];

    const formationsByMemberQuery = query(
        collection(db, "formations"),
        where(fieldName, "array-contains", currentUid)
    );

    const snap = await safeGetDocs(formationsByMemberQuery, `formations par ${fieldName}`);
    return snap ? snapToArray(snap) : [];
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
    const formationIds = getFormationIdsFromProfile(currentUserProfile);
    const formationTitles = getFormationTitlesFromProfile(currentUserProfile);

    // Priorité aux index users/{uid} : c'est le chemin le plus compatible avec
    // les rules strictes, car il évite de dépendre d'une requête membership.
    formations.push(...await loadFormationsByIds(formationIds));
    formations.push(...await loadFormationsByTitles(formationTitles));
    formations.push(...await loadFormationsByMembership('profs', currentUid));

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

    const snap = await safeGetDocs(coursesQuery, 'cours auteur prof');
    return snap ? snapToArray(snap) : [];
}

async function loadActiveCoursesByFormationValues(formationValues) {
    const safeValues = normalizeList(formationValues);
    if (!safeValues.length) return [];

    const courses = [];
    const chunks = chunkArray(safeValues, 10);

    for (const chunk of chunks) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await safeGetDocs(coursesQuery, 'cours actifs par formation');
        if (snap) courses.push(...snapToArray(snap));
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
