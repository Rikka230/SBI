/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.276',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'admin : peut desormais SUPPRIMER un devoir/eval (Cloud Function deleteAssignment : supprime le devoir + ses depots + fichiers Storage best-effort) et CORRIGER un depot depuis le suivi (feedback + note), comme un prof. Suite au theme sombre admin .275.',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.276 - admin peut supprimer un devoir + corriger les depots'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
