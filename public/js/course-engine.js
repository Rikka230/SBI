/**
 * =======================================================================
 * COURSE ENGINE - Moteur Global de Progression Pédagogique et XP
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import { doc, getDoc, setDoc, updateDoc, increment, deleteField, FieldPath } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [], quizScores: {} };
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

// Valide un chapitre, vérifie la complétion à 100%, et ajoute l'XP sécurisée
export async function validateChapterProgress(uid, courseId, chapterId, totalChaptersAmount, scoreEarned = 0) {
    try {
        const userRef = doc(db, "users", uid);
        let progress = await getUserLearningProgress(uid);

        if (!progress.courses[courseId]) {
            progress.courses[courseId] = { status: 'in_progress', completedChapters: [], quizScores: {} };
        }
        if (!progress.courses[courseId].completedChapters) progress.courses[courseId].completedChapters = [];
        if (!progress.courses[courseId].quizScores) progress.courses[courseId].quizScores = {};

        let xpToAdd = 0;
        const previousScore = progress.courses[courseId].quizScores[chapterId] || 0;

        if (scoreEarned > previousScore) {
            xpToAdd = scoreEarned - previousScore;
            progress.courses[courseId].quizScores[chapterId] = scoreEarned;
        }

        if (!progress.courses[courseId].completedChapters.includes(chapterId)) {
            progress.courses[courseId].completedChapters.push(chapterId);
        }

        if (progress.courses[courseId].completedChapters.length >= totalChaptersAmount) {
            progress.courses[courseId].status = 'done';
            progress.courses[courseId].completedAt = Date.now();
        } else {
            progress.courses[courseId].status = 'in_progress';
        }

        const updates = { learningProgress: progress };
        
        if (xpToAdd > 0) {
            updates.xp = increment(xpToAdd);
        }

        await setDoc(userRef, updates, { merge: true });
        return progress;
    } catch (e) {
        console.error("Erreur sauvegarde progression", e);
        return null;
    }
}

// =========================================================
// NOUVEAU : FONCTIONS CORE D'ADMINISTRATION ET PROFESSEUR
// =========================================================

// Réinitialise un cours et déduit l'XP correspondante
export async function resetCourseProgress(uid, courseId) {
    try {
        const userRef = doc(db, "users", uid);
        const progress = await getUserLearningProgress(uid);
        const courseProgress = progress.courses?.[courseId];

        if (!courseProgress) return true;

        let xpToRemove = 0;
        if (courseProgress.quizScores) {
            Object.values(courseProgress.quizScores).forEach(score => {
                xpToRemove += Number(score) || 0;
            });
        }

        const updateArgs = [
            new FieldPath('learningProgress', 'courses', String(courseId)),
            deleteField()
        ];

        if (xpToRemove > 0) {
            updateArgs.push('xp', increment(-xpToRemove));
        }

        await updateDoc(userRef, ...updateArgs);
        return true;
    } catch (e) {
        console.error("Erreur reset progression", e);
        return false;
    }
}

// Modifie manuellement une note de QCM, ajuste l'XP et peut terminer le cours.
export async function updateQuizScore(uid, courseId, chapterId, newScore, chapterIdsToComplete = []) {
    try {
        const userRef = doc(db, "users", uid);
        const progress = await getUserLearningProgress(uid);
        const courseProgress = progress.courses?.[courseId] || {
            status: 'todo',
            completedChapters: [],
            quizScores: {}
        };

        if (!courseProgress.quizScores) courseProgress.quizScores = {};
        if (!Array.isArray(courseProgress.completedChapters)) courseProgress.completedChapters = [];

        const oldScore = Number(courseProgress.quizScores[chapterId]) || 0;
        const normalizedScore = Number(newScore) || 0;
        const xpDifference = normalizedScore - oldScore;

        const targetChapterIds = Array.isArray(chapterIdsToComplete)
            ? Array.from(new Set(chapterIdsToComplete.filter(Boolean)))
            : [];

        const completedChapters = targetChapterIds.length > 0
            ? targetChapterIds
            : Array.from(new Set([...courseProgress.completedChapters, chapterId].filter(Boolean)));

        const shouldMarkDone = targetChapterIds.length > 0;
        const now = Date.now();

        const safeCourseId = String(courseId);
        const safeChapterId = String(chapterId);

        const updateArgs = [
            new FieldPath('learningProgress', 'courses', safeCourseId, 'quizScores', safeChapterId),
            normalizedScore,
            new FieldPath('learningProgress', 'courses', safeCourseId, 'completedChapters'),
            completedChapters,
            new FieldPath('learningProgress', 'courses', safeCourseId, 'status'),
            shouldMarkDone ? 'done' : 'in_progress',
            new FieldPath('learningProgress', 'courses', safeCourseId, 'updatedAt'),
            now
        ];

        if (shouldMarkDone) {
            updateArgs.push(
                new FieldPath('learningProgress', 'courses', safeCourseId, 'completedAt'),
                courseProgress.completedAt || now
            );
        }

        if (xpDifference !== 0) {
            updateArgs.push('xp', increment(xpDifference));
        }

        await updateDoc(userRef, ...updateArgs);
        return true;
    } catch (e) {
        console.error("Erreur update note", e);
        return false;
    }
}
