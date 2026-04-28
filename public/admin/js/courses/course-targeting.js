function normalizeCourseTargetValue(value) {
    return value ? String(value).trim() : '';
}

function courseFormationMatchesValue(formation, selectedValue) {
    const safeValue = normalizeCourseTargetValue(selectedValue);
    if (!formation || !safeValue) return false;

    return normalizeCourseTargetValue(formation.id) === safeValue
        || normalizeCourseTargetValue(formation.titre) === safeValue;
}

export function normalizeCourseAudienceList(items = []) {
    if (!Array.isArray(items)) return [];

    return Array.from(
        new Set(items.map((item) => normalizeCourseTargetValue(item)).filter(Boolean))
    );
}

export function resolveTargetFormationsForSelectedValues(selectedValues = [], allFormationsData = []) {
    const targetMap = new Map();

    selectedValues.forEach((formationValue) => {
        const formation = allFormationsData.find((item) => courseFormationMatchesValue(item, formationValue));

        if (formation?.id) {
            targetMap.set(formation.id, formation);
        }
    });

    return Array.from(targetMap.values());
}

export function getTargetStudentsFromFormations(formations = []) {
    const targetStudents = new Set();

    formations.forEach((formation) => {
        const students = Array.isArray(formation?.students) ? formation.students : [];

        students.forEach((studentId) => {
            const safeStudentId = normalizeCourseTargetValue(studentId);
            if (safeStudentId) targetStudents.add(safeStudentId);
        });
    });

    return Array.from(targetStudents);
}

export function getTargetFormationIdsFromFormations(formations = [], selectedValues = [], allFormationsData = []) {
    const ids = new Set();

    formations.forEach((formation) => {
        const safeId = normalizeCourseTargetValue(formation?.id);
        if (safeId) ids.add(safeId);
    });

    selectedValues.forEach((formationValue) => {
        const safeValue = normalizeCourseTargetValue(formationValue);

        if (
            safeValue &&
            allFormationsData.some((formation) => normalizeCourseTargetValue(formation.id) === safeValue)
        ) {
            ids.add(safeValue);
        }
    });

    return Array.from(ids);
}

export function getTargetFormationTitlesFromFormations(formations = [], selectedValues = [], allFormationsData = []) {
    const titles = new Set();

    formations.forEach((formation) => {
        const safeTitle = normalizeCourseTargetValue(formation?.titre);
        if (safeTitle) titles.add(safeTitle);
    });

    selectedValues.forEach((formationValue) => {
        const safeValue = normalizeCourseTargetValue(formationValue);

        if (
            safeValue &&
            allFormationsData.some((formation) => normalizeCourseTargetValue(formation.titre) === safeValue)
        ) {
            titles.add(safeValue);
        }
    });

    return Array.from(titles);
}

export function getCourseTargetingSnapshot(selectedValues = [], allFormationsData = [], { includeStudents = true } = {}) {
    const targetFormations = resolveTargetFormationsForSelectedValues(selectedValues, allFormationsData);

    return {
        targetFormations,
        targetFormationIds: getTargetFormationIdsFromFormations(targetFormations, selectedValues, allFormationsData),
        targetFormationTitles: getTargetFormationTitlesFromFormations(targetFormations, selectedValues, allFormationsData),
        targetStudents: includeStudents ? getTargetStudentsFromFormations(targetFormations) : []
    };
}
