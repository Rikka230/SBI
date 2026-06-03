/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.287',
  branch: 'main',
  channel: 'Livret d\'apprentissage numerique + role Tuteur',
  stage: 'nouveau module Livret d\'apprentissage numerique avec role Tuteur (maitre d\'apprentissage) et son espace dedie /tutor (theme vert lime). Admin, eleve et tuteur editent chacun leur partie du livret ; le teacher (responsable pedagogique) valide. Donnees : collection apprenticeshipBooklets, ecritures Cloud Functions par role avec verrou, export PDF. Routing + nav cables pour admin (/admin/apprenticeship-booklets.html), eleve (/student/livret.html) et teacher (/teacher/livrets.html).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.287 - Module Livret d\'apprentissage + role Tuteur (espace /tutor)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
