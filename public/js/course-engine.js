/**
 * =======================================================================
 * COURSE ENGINE - Moteur Global de Progression Pédagogique
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Récupère toute la progression d'un élève
export async function getUserLearningProgress(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            return data.learningProgress || { courses: {}, formations: {} };
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
        const snap = await getDoc(userRef);
        let progress = { courses: {}, formations: {} };
        
        if (snap.exists() && snap.data().learningProgress) {
            progress = snap.data().learningProgress;
        }

        if (!progress.courses[courseId]) {
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [] };
        }

        // Ajoute le chapitre s'il n'est pas déjà validé
        if (!progress.courses[courseId].completedChapters.includes(chapterId)) {
            progress.courses[courseId].completedChapters.push(chapterId);
        }

        // Si c'est la fin du cours
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
