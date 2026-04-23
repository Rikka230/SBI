/**
 * =======================================================================
 * COURSE ENGINE - Moteur Global de Progression Pédagogique
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Récupère toute la progression d'un élève (Ultra sécurisé)
export async function getUserLearningProgress(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            let prog = data.learningProgress;
            
            // Si l'objet n'existe pas ou est vide, on le reconstruit proprement
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

// Met à jour la validation d'un chapitre et l'état du cours
export async function validateChapterProgress(uid, courseId, chapterId, isCourseFinished = false) {
    try {
        const userRef = doc(db, "users", uid);
        let progress = await getUserLearningProgress(uid); // Utilise la version sécurisée

        if (!progress.courses[courseId]) {
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [] };
        }

        if (!progress.courses[courseId].completedChapters) {
            progress.courses[courseId].completedChapters = [];
        }

        if (!progress.courses[courseId].completedChapters.includes(chapterId)) {
            progress.courses[courseId].completedChapters.push(chapterId);
        }

        if (isCourseFinished) {
            progress.courses[courseId].status = 'done';
            progress.courses[courseId].completedAt = Date.now();
        } else {
            progress.courses[courseId].status = 'in_progress';
        }

        await updateDoc(userRef, { learningProgress: progress });
        return true;
    } catch (e) {
        console.error("Erreur sauvegarde progression", e);
        return false;
    }
}
