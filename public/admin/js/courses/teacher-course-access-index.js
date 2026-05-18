import { db } from '/js/firebase-init.js';
import {
    collection,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function normalizeValue(value) {
    return value == null ? '' : String(value).trim();
}

function normalizeList(value) {
    if (!Array.isArray(value)) return [];

    return Array.from(new Set(
        value.map(normalizeValue).filter(Boolean)
    ));
}

function courseFormationMatches(formation, ref) {
    const safeRef = normalizeValue(ref);
    if (!formation || !safeRef) return false;

    return normalizeValue(formation.id) === safeRef
        || normalizeValue(formation.titre || formation.title) === safeRef;
}

function getCourseFormationRefs(courseData = {}) {
    return normalizeList([
        ...normalizeList(courseData.formationIds),
        ...normalizeList(courseData.formationsIds),
        ...normalizeList(courseData.targetFormationIds),
        ...normalizeList(courseData.formations),
        ...normalizeList(courseData.targetFormationTitles)
    ]);
}

function getTargetFormationsForCourse(courseData = {}, allFormationsData = []) {
    const refs = getCourseFormationRefs(courseData);
    if (!refs.length || !Array.isArray(allFormationsData)) return [];

    const map = new Map();

    refs.forEach((ref) => {
        const formation = allFormationsData.find((item) => courseFormationMatches(item, ref));
        if (formation?.id) map.set(formation.id, formation);
    });

    return Array.from(map.values());
}

function getTeacherIdsFromFormations(formations = []) {
    const ids = new Set();

    formations.forEach((formation) => {
        normalizeList(formation?.profs).forEach((teacherId) => ids.add(teacherId));
    });

    return Array.from(ids);
}

function resolveTeacherIdsForCourse(courseData = {}, allFormationsData = []) {
    const explicitTeachers = normalizeList(courseData.targetTeacherIds);
    const formationTeachers = getTeacherIdsFromFormations(getTargetFormationsForCourse(courseData, allFormationsData));

    return normalizeList([...explicitTeachers, ...formationTeachers]);
}

function getFormationTitlesForCourse(courseData = {}, allFormationsData = []) {
    const explicitTitles = normalizeList(courseData.targetFormationTitles);
    const formationTitles = getTargetFormationsForCourse(courseData, allFormationsData)
        .map((formation) => normalizeValue(formation.titre || formation.title))
        .filter(Boolean);

    return normalizeList([...explicitTitles, ...formationTitles]);
}

function getFormationIdsForCourse(courseData = {}, allFormationsData = []) {
    const explicitIds = normalizeList([
        ...normalizeList(courseData.formationIds),
        ...normalizeList(courseData.formationsIds),
        ...normalizeList(courseData.targetFormationIds)
    ]);

    const formationIds = getTargetFormationsForCourse(courseData, allFormationsData)
        .map((formation) => normalizeValue(formation.id))
        .filter(Boolean);

    return normalizeList([...explicitIds, ...formationIds]);
}

export async function syncTeacherCourseAccessIndexForCourse({
    courseId,
    courseData = {},
    allFormationsData = []
} = {}) {
    const safeCourseId = normalizeValue(courseId || courseData?.id);
    if (!safeCourseId) return [];

    const teacherIds = resolveTeacherIdsForCourse(courseData, allFormationsData);
    if (!teacherIds.length) return [];

    const title = normalizeValue(courseData.titre || courseData.title) || 'Cours sans titre';
    const formationIds = getFormationIdsForCourse(courseData, allFormationsData);
    const formationTitles = getFormationTitlesForCourse(courseData, allFormationsData);

    const payload = {
        courseId: safeCourseId,
        title,
        titre: title,
        formationIds,
        formationTitles,
        targetTeacherIds: teacherIds,
        actif: courseData.actif === true,
        statutValidation: normalizeValue(courseData.statutValidation || courseData.lmsStatus || 'draft'),
        lmsStatus: normalizeValue(courseData.lmsStatus || ''),
        source: 'course-targeting',
        updatedAt: serverTimestamp()
    };

    await Promise.all(teacherIds.map((teacherId) => {
        return setDoc(
            doc(db, 'teacherCourseAccess', teacherId, 'courses', safeCourseId),
            {
                ...payload,
                teacherId
            },
            { merge: true }
        );
    }));

    return teacherIds;
}

export async function syncTeacherCourseAccessIndexForCourses(courses = [], allFormationsData = []) {
    if (!Array.isArray(courses) || !courses.length) return 0;

    let count = 0;

    for (const courseData of courses) {
        try {
            const teacherIds = await syncTeacherCourseAccessIndexForCourse({
                courseId: courseData?.id,
                courseData,
                allFormationsData
            });

            if (teacherIds.length > 0) count += 1;
        } catch (error) {
            console.warn('[SBI Courses] Index accès prof non synchronisé pour un cours :', error);
        }
    }

    return count;
}
