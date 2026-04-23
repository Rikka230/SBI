/**
 * =======================================================================
 * COURSE ENGINE - Moteur Global de Progression Pédagogique
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Récupère toute la progression d'un élève
export async function getUserLearningProgress(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            let prog = data.learningProgress;
            
            if (!prog) prog = {};
            if (!prog.courses) prog.courses = {};
            if (!prog.formations) prog.formations = {};
            
            return prog;
        }
        return { courses: {}, formations: {} };
    } catch (e) {
        console.error("Erreur récupération progression", e);
        return { courses: {}, formations: {} };
    }
}

// Déclare le cours comme "En cours" dès l'ouverture de la page
export async function startCourseProgress(uid, courseId) {
    try {
        const userRef = doc(db, "users", uid);
        let progress = await getUserLearningProgress(uid);

        if (!progress.courses[courseId]) {
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [] };
            // Utilisation de setDoc + merge pour éviter les erreurs silencieuses de Firebase
            await setDoc(userRef, { learningProgress: progress }, { merge: true });
        } else if (progress.courses[courseId].status === 'todo') {
            progress.courses[courseId].status = 'in_progress';
            await setDoc(userRef, { learningProgress: progress }, { merge: true });
        }
        return progress;
    } catch (e) {
        console.error("Erreur au démarrage du cours", e);
        return null;
    }
}

// Valide un chapitre et vérifie la complétion à 100%
export async function validateChapterProgress(uid, courseId, chapterId, totalChaptersAmount) {
    try {
        const userRef = doc(db, "users", uid);
        let progress = await getUserLearningProgress(uid);

        if (!progress.courses[courseId]) {
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [] };
        }
        if (!progress.courses[courseId].completedChapters) {
            progress.courses[courseId].completedChapters = [];
        }

        // Ajout du chapitre s'il n'y est pas déjà
        if (!progress.courses[courseId].completedChapters.includes(chapterId)) {
            progress.courses[courseId].completedChapters.push(chapterId);
        }

        // Vérification de la complétion totale
        if (progress.courses[courseId].completedChapters.length >= totalChaptersAmount) {
            progress.courses[courseId].status = 'done';
            progress.courses[courseId].completedAt = Date.now();
        } else {
            progress.courses[courseId].status = 'in_progress';
        }

        // Utilisation de setDoc + merge pour forcer l'écriture
        await setDoc(userRef, { learningProgress: progress }, { merge: true });
        return progress;
    } catch (e) {
        console.error("Erreur sauvegarde progression", e);
        return null;
    }
}
