/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.277',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'suppression du depot d un seul eleve : Cloud Function deleteAssignmentSubmission (admin ou prof de la formation) supprime le doc + les fichiers Storage de CE depot, et permet a l eleve de redeposer. Bouton "Supprimer ce depot" cote admin + prof. Rappel : supprimer un devoir efface deja tous ses rendus (db + storage) via deleteAssignment.',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.277 - suppression du depot d un eleve seul (admin/prof) + redepot possible'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
