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
 *
 * devient :
 *
 * users/{uid}
 *   formationIds: [...]
 *
 * Objectif :
 * - préparer les requêtes Firestore "query-safe"
 * - éviter de charger tous les users côté front plus tard
 * - garder une source de vérité claire : les documents formations
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
    collection,
    getDocs,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const normalizeIds = (value) => {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .filter(Boolean)
                .map((item) => String(item))
        )
    ).sort();
};

const arraysEqual = (a, b) => {
    const arrA = normalizeIds(a);
    const arrB = normalizeIds(b);

    if (arrA.length !== arrB.length) return false;

    return arrA.every((value, index) => value === arrB[index]);
};

const buildFormationIndexByUser = (formations = [], users = []) => {
    const index = new Map();

    users.forEach((user) => {
        if (!user?.id) return;
        index.set(user.id, new Set());
    });

    formations.forEach((formation) => {
        if (!formation?.id) return;

        const profs = Array.isArray(formation.profs) ? formation.profs : [];
        const students = Array.isArray(formation.students) ? formation.students : [];

        [...profs, ...students].forEach((uid) => {
            if (!uid) return;

            if (!index.has(uid)) {
                index.set(uid, new Set());
            }

            index.get(uid).add(formation.id);
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

        const nextFormationIds = normalizeIds(Array.from(index.get(user.id) || []));
        const currentFormationIds = normalizeIds(user.formationIds || []);

        if (arraysEqual(currentFormationIds, nextFormationIds)) {
            return;
        }

        updates.push(
            updateDoc(doc(db, "users", user.id), {
                formationIds: nextFormationIds
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
