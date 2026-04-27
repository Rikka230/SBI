/**
 * =======================================================================
 * USER FORMATION INDEX
 * =======================================================================
 *
 * Synchronise les formations sur les documents users :
 *
 * formations/{formationId}
 *   profs: [...]
 *   students: [...]
 *   titre: "Nom de formation"
 *
 * devient :
 *
 * users/{uid}
 *   formationIds: [formationId]
 *   formationsAcces: [titre]
 *
 * Objectif :
 * - garder une source de vérité claire : les documents formations
 * - réparer les accès prof/élève même si les rules ou anciens cours utilisent
 *   encore l'ancien champ formationsAcces ou les titres de formation
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
    collection,
    getDocs,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const normalizeValues = (value) => {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .filter(Boolean)
                .map((item) => String(item).trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
};

const arraysEqual = (a, b) => {
    const arrA = normalizeValues(a);
    const arrB = normalizeValues(b);

    if (arrA.length !== arrB.length) return false;

    return arrA.every((value, index) => value === arrB[index]);
};

const ensureIndexEntry = (index, uid) => {
    if (!uid) return null;

    const safeUid = String(uid);

    if (!index.has(safeUid)) {
        index.set(safeUid, {
            ids: new Set(),
            titles: new Set()
        });
    }

    return index.get(safeUid);
};

const buildFormationIndexByUser = (formations = [], users = []) => {
    const index = new Map();

    users.forEach((user) => {
        if (!user?.id) return;
        ensureIndexEntry(index, user.id);
    });

    formations.forEach((formation) => {
        if (!formation?.id) return;

        const profs = Array.isArray(formation.profs) ? formation.profs : [];
        const students = Array.isArray(formation.students) ? formation.students : [];
        const formationId = String(formation.id);
        const formationTitle = formation.titre ? String(formation.titre).trim() : '';

        [...profs, ...students].forEach((uid) => {
            const entry = ensureIndexEntry(index, uid);
            if (!entry) return;

            entry.ids.add(formationId);
            if (formationTitle) entry.titles.add(formationTitle);
        });
    });

    return index;
};

export const syncUserFormationIndexesFromData = async ({
    formations = [],
    users = []
} = {}) => {
    const index = buildFormationIndexByUser(formations, users);
    const updates = [];

    users.forEach((user) => {
        if (!user?.id) return;

        const entry = index.get(String(user.id)) || { ids: new Set(), titles: new Set() };
        const nextFormationIds = normalizeValues(Array.from(entry.ids));
        const nextFormationsAcces = normalizeValues(Array.from(entry.titles));

        const currentFormationIds = normalizeValues(user.formationIds || []);
        const currentFormationsAcces = normalizeValues(user.formationsAcces || []);

        const needsFormationIdsUpdate = !arraysEqual(currentFormationIds, nextFormationIds);
        const needsFormationsAccesUpdate = !arraysEqual(currentFormationsAcces, nextFormationsAcces);

        if (!needsFormationIdsUpdate && !needsFormationsAccesUpdate) {
            return;
        }

        updates.push(
            updateDoc(doc(db, "users", user.id), {
                formationIds: nextFormationIds,
                formationsAcces: nextFormationsAcces
            })
        );
    });

    if (updates.length === 0) {
        return {
            updated: 0,
            skipped: users.length
        };
    }

    await Promise.all(updates);

    return {
        updated: updates.length,
        skipped: users.length - updates.length
    };
};

export const syncAllUserFormationIndexes = async () => {
    const [formationsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "formations")),
        getDocs(collection(db, "users"))
    ]);

    const formations = [];
    const users = [];

    formationsSnap.forEach((formationDoc) => {
        formations.push({
            id: formationDoc.id,
            ...formationDoc.data()
        });
    });

    usersSnap.forEach((userDoc) => {
        users.push({
            id: userDoc.id,
            ...userDoc.data()
        });
    });

    return syncUserFormationIndexesFromData({
        formations,
        users
    });
};
