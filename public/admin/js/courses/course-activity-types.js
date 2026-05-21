/**
 * SBI 8.0P.167.157
 * Registre central des activités pédagogiques.
 *
 * Objectif P2J.1 : préparer l'éditeur de cours à recevoir rapidement
 * de nouveaux outils sans casser les cours existants.
 */

export const COURSE_ACTIVITY_SCHEMA_VERSION = 'course-activity-v1';

export const COURSE_ACTIVITY_TYPES = Object.freeze({
  text: Object.freeze({
    type: 'text',
    family: 'lesson',
    label: 'Leçon',
    shortLabel: 'Leçon',
    icon: 'lesson',
    supportsScoring: false,
    supportsAutoCorrection: false,
    completionMode: 'manual_validation',
    status: 'stable'
  }),
  quiz: Object.freeze({
    type: 'quiz',
    family: 'assessment',
    label: 'QCM / Examen',
    shortLabel: 'QCM',
    icon: 'quiz',
    supportsScoring: true,
    supportsAutoCorrection: true,
    completionMode: 'score_then_validation',
    status: 'stable'
  }),
  fill_blank: Object.freeze({
    type: 'fill_blank',
    family: 'practice',
    label: 'Texte à trous',
    shortLabel: 'Trous',
    icon: 'fill_blank',
    supportsScoring: true,
    supportsAutoCorrection: true,
    completionMode: 'score_then_validation',
    status: 'planned'
  })
});

export function normalizeActivityType(type = '') {
  const safeType = String(type || '').trim();
  if (safeType === 'lesson') return 'text';
  if (safeType === 'qcm' || safeType === 'exam') return 'quiz';
  if (safeType === 'fillBlank' || safeType === 'fill_blanks') return 'fill_blank';
  return COURSE_ACTIVITY_TYPES[safeType] ? safeType : 'text';
}

export function getCourseActivityDefinition(type = '') {
  return COURSE_ACTIVITY_TYPES[normalizeActivityType(type)] || COURSE_ACTIVITY_TYPES.text;
}

export function listCourseActivityTypes({ includePlanned = true } = {}) {
  return Object.values(COURSE_ACTIVITY_TYPES).filter((definition) => {
    return includePlanned || definition.status !== 'planned';
  });
}

export function createCourseActivity(type = 'text', overrides = {}) {
  const definition = getCourseActivityDefinition(type);
  const id = overrides.id || `chap_${Date.now().toString()}`;
  const base = {
    id,
    type: definition.type,
    activityType: definition.type,
    activityFamily: definition.family,
    activitySchemaVersion: COURSE_ACTIVITY_SCHEMA_VERSION,
    completionMode: definition.completionMode,
    scoring: {
      enabled: definition.supportsScoring === true,
      autoCorrection: definition.supportsAutoCorrection === true,
      maxScore: 0
    },
    titre: overrides.titre || definition.label,
    title: overrides.title || overrides.titre || definition.label
  };

  if (definition.type === 'quiz') {
    return {
      ...base,
      titre: overrides.titre || 'QCM / Examen',
      questions: Array.isArray(overrides.questions) ? overrides.questions : [],
      ...overrides,
      type: 'quiz',
      activityType: 'quiz'
    };
  }

  if (definition.type === 'fill_blank') {
    return {
      ...base,
      prompt: overrides.prompt || '',
      blanks: Array.isArray(overrides.blanks) ? overrides.blanks : [],
      scoringMode: overrides.scoringMode || 'exact_or_alias',
      retryAllowed: overrides.retryAllowed !== false,
      ...overrides,
      type: 'fill_blank',
      activityType: 'fill_blank'
    };
  }

  return {
    ...base,
    titre: overrides.titre || 'Leçon',
    contenu: overrides.contenu || '',
    mediaType: overrides.mediaType || 'image',
    mediaImage: overrides.mediaImage || '',
    mediaVideo: overrides.mediaVideo || '',
    ...overrides,
    type: 'text',
    activityType: 'text'
  };
}

export function normalizeCourseActivity(chapter = {}, index = 0) {
  const definition = getCourseActivityDefinition(chapter.activityType || chapter.type);
  const normalized = createCourseActivity(definition.type, {
    ...chapter,
    id: chapter.id || `chap_${Date.now().toString()}_${index}`,
    titre: chapter.titre || chapter.title || definition.label
  });

  return {
    ...normalized,
    order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : index,
    activityType: definition.type,
    activityFamily: definition.family,
    activitySchemaVersion: chapter.activitySchemaVersion || COURSE_ACTIVITY_SCHEMA_VERSION,
    completionMode: chapter.completionMode || definition.completionMode
  };
}

export function normalizeCourseActivities(chapters = []) {
  if (!Array.isArray(chapters)) return [];
  return chapters.map((chapter, index) => normalizeCourseActivity(chapter, index));
}

export function summarizeCourseActivities(chapters = []) {
  const normalized = normalizeCourseActivities(chapters);
  const counts = normalized.reduce((acc, chapter) => {
    const type = normalizeActivityType(chapter.activityType || chapter.type);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const types = Object.keys(counts).sort();
  return {
    activitySchemaVersion: COURSE_ACTIVITY_SCHEMA_VERSION,
    activityCount: normalized.length,
    activityTypes: types,
    activityTypeCounts: counts,
    hasInteractiveActivities: normalized.some((chapter) => {
      const definition = getCourseActivityDefinition(chapter.activityType || chapter.type);
      return definition.supportsAutoCorrection === true;
    })
  };
}

if (typeof window !== 'undefined') {
  window.SBI_COURSE_ACTIVITY_TYPES = COURSE_ACTIVITY_TYPES;
}
