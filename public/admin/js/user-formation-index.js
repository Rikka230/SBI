/**
 * =======================================================================
 * USER FORMATION INDEX - SERVER SYNC WRAPPER
 * =======================================================================
 *
 * SBI 8.0P.141 / P2E.3
 *
 * Les index d'accès sensibles users/{uid}.formationIds et
 * users/{uid}.formationsAcces ne sont plus écrits directement depuis
 * le front admin.
 *
 * Source de vérité : documents formations.
 * Écriture : Function serveur adminSyncUserFormationIndexes(europe-west1).
 * =======================================================================
 */

import { app } from '/js/firebase-init.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functions = getFunctions(app, "europe-west1");
const adminSyncUserFormationIndexes = httpsCallable(functions, "adminSyncUserFormationIndexes");

async function runServerFormationIndexSync(source = 'admin') {
    const response = await adminSyncUserFormationIndexes({ source });
    const data = response?.data || {};

    return {
        success: data.success === true,
        updated: Number(data.updated) || 0,
        skipped: Number(data.skipped) || 0,
        totalUsers: Number(data.totalUsers) || 0,
        totalFormations: Number(data.totalFormations) || 0,
        message: data.message || ''
    };
}

export const syncUserFormationIndexesFromData = async () => {
    return runServerFormationIndexSync('admin-courses');
};

export const syncAllUserFormationIndexes = async () => {
    return runServerFormationIndexSync('course-access-diagnostics');
};
