/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.269',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'ecran eleves en retard - 3 lots: export PDF registre (client), assiduite Live (Cloud Function getPromotionLiveAttendanceBatch admin-only), relance email Brevo (Cloud Function sendLateStudentReminder admin-only, confirmation + rate-limit 24h + audit)',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.269 - registre PDF + assiduite Live + relances Brevo (Plan B lots 5-6-7)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
