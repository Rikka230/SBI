/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.273',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'nouveau module Devoirs & Evaluations : collections assignments / assignmentSubmissions, rules Firestore + Storage, 4 Cloud Functions (createOrUpdateAssignment, validateAssignment, correctAssignmentSubmission, notifyAssignmentToProfs), pages admin (creation + file de validation + suivi), prof (a corriger + correction), eleve (depot unique + correction). Formulaire de creation mutualise admin/prof. Brevo aux profs au depot.',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.273 - module Devoirs & Evaluations (admin/prof/eleve, depot + correction)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
