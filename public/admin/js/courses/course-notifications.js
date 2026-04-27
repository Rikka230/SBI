import { db } from '/js/firebase-init.js';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function resolveCourseValidationNotifications({ courseId, currentUid }) {
    if (!courseId) return;

    try {
        const validationQuery = query(
            collection(db, "notifications"),
            where("type", "==", "course_validation")
        );

        const snapshot = await getDocs(validationQuery);
        const updates = [];

        snapshot.forEach((notifDoc) => {
            const data = notifDoc.data();

            if (data.courseId === courseId && data.status !== 'resolved') {
                updates.push(updateDoc(doc(db, "notifications", notifDoc.id), {
                    status: 'resolved',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: currentUid
                }));
            }
        });

        if (updates.length > 0) await Promise.all(updates);
    } catch (error) {
        console.warn("[SBI Courses] Impossible de résoudre les notifications de validation :", error);
    }
}

export async function handleCourseNotifications({
    actionType,
    courseRefId,
    title,
    selectedPills,
    isPublishing,
    isRejecting,
    currentUid,
    currentUserProfile,
    editingCourseAuthorId,
    allFormationsData
}) {
    if (actionType === 'submit') {
        await addDoc(collection(db, "notifications"), {
            type: 'course_validation',
            courseId: courseRefId,
            courseTitle: title,
            auteurId: currentUid,
            auteurName: (currentUserProfile.prenom || '') + ' ' + (currentUserProfile.nom || ''),
            dateCreation: serverTimestamp(),
            status: 'open',
            dismissedBy: []
        });
    }

    if (isPublishing) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await addDoc(collection(db, "notifications"), {
                type: 'course_approved',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }

        const targetStudentsSet = new Set();
        selectedPills.forEach(formId => {
            const formObj = allFormationsData.find(f => f.id === formId || f.titre === formId);
            if (formObj && formObj.students) formObj.students.forEach(studentId => targetStudentsSet.add(studentId));
        });

        const targetStudentsArray = Array.from(targetStudentsSet);
        if (targetStudentsArray.length > 0) {
            await addDoc(collection(db, "notifications"), {
                type: 'new_course_published',
                courseId: courseRefId,
                courseTitle: title,
                targetStudents: targetStudentsArray,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }
    } else if (isRejecting) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await addDoc(collection(db, "notifications"), {
                type: 'course_rejected',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            });
        }
    }

    if (isPublishing || isRejecting) {
        await resolveCourseValidationNotifications({ courseId: courseRefId, currentUid });
    }
}
