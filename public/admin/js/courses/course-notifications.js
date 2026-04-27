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

function normalizeId(value) {
    return value ? String(value).trim() : '';
}

function getDisplayName(profile = {}) {
    return `${profile.prenom || ''} ${profile.nom || ''}`.trim() || 'Professeur';
}

function courseFormationMatches(formation, selectedValue) {
    const safeValue = normalizeId(selectedValue);
    if (!formation || !safeValue) return false;

    return normalizeId(formation.id) === safeValue
        || normalizeId(formation.titre) === safeValue;
}

function getTargetStudentsFromFormations(selectedPills = [], allFormationsData = []) {
    const targetStudents = new Set();

    selectedPills.forEach((formationValue) => {
        const formation = allFormationsData.find((item) => courseFormationMatches(item, formationValue));
        const students = Array.isArray(formation?.students) ? formation.students : [];

        students.forEach((studentId) => {
            const safeStudentId = normalizeId(studentId);
            if (safeStudentId) targetStudents.add(safeStudentId);
        });
    });

    return Array.from(targetStudents);
}

async function safeAddNotification(payload, label) {
    try {
        await addDoc(collection(db, "notifications"), payload);
        return true;
    } catch (error) {
        console.warn(`[SBI Notifications] ${label} non envoyée :`, error);
        return false;
    }
}

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
                    resolvedBy: currentUid || null
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
    selectedPills = [],
    isPublishing = false,
    isRejecting = false,
    currentUid = null,
    currentUserProfile = {},
    editingCourseAuthorId = null,
    allFormationsData = []
} = {}) {
    if (!courseRefId) return;

    if (actionType === 'submit') {
        await safeAddNotification({
            type: 'course_validation',
            courseId: courseRefId,
            courseTitle: title,
            auteurId: currentUid,
            auteurName: getDisplayName(currentUserProfile),
            dateCreation: serverTimestamp(),
            status: 'open',
            dismissedBy: []
        }, 'Demande de validation');
    }

    if (isPublishing) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await safeAddNotification({
                type: 'course_approved',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            }, 'Notification prof cours validé');
        }

        const targetStudentsArray = getTargetStudentsFromFormations(selectedPills, allFormationsData);

        if (targetStudentsArray.length > 0) {
            await safeAddNotification({
                type: 'new_course_published',
                courseId: courseRefId,
                courseTitle: title,
                targetStudents: targetStudentsArray,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            }, 'Notification élèves nouveau cours');
        } else {
            console.info('[SBI Notifications] Aucun élève cible trouvé pour le cours publié.', {
                courseRefId,
                selectedPills
            });
        }
    } else if (isRejecting) {
        if (editingCourseAuthorId && editingCourseAuthorId !== currentUid) {
            await safeAddNotification({
                type: 'course_rejected',
                courseId: courseRefId,
                courseTitle: title,
                destinataireId: editingCourseAuthorId,
                dateCreation: serverTimestamp(),
                dismissedBy: []
            }, 'Notification prof cours refusé');
        }
    }

    if (isPublishing || isRejecting) {
        await resolveCourseValidationNotifications({ courseId: courseRefId, currentUid });
    }
}
