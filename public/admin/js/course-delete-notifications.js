/**
 * Notification envoyée au professeur quand un admin supprime une demande pending.
 */

import { db } from '/js/firebase-init.js';
import {
    addDoc,
    collection,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function notifyCourseDeletedIfNeeded({ courseId, courseData, currentUid }) {
    const status = courseData?.statutValidation || (courseData?.actif === true ? 'approved' : 'draft');
    const authorId = courseData?.auteurId;

    if (status !== 'pending' || !authorId || authorId === currentUid) return;

    await addDoc(collection(db, "notifications"), {
        type: 'course_deleted',
        courseId,
        courseTitle: courseData?.titre || 'Cours supprimé',
        destinataireId: authorId,
        dateCreation: serverTimestamp(),
        dismissedBy: []
    });
}
