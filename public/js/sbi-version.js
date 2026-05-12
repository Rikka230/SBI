/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.129',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P1',
  stage: 'PRIVATE P1 QUILL ALIGN + STUDENT NOTICE + ADMIN DELETE CLEANUP',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.129 - PRIVATE P1.2 QUILL TOOLTIP REBIND FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
