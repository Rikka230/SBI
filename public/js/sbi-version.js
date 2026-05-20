/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.131',
  branch: 'main',
  channel: 'P2I.19 DURABLE FINALIZATION FLOWS',
  stage: 'DIRECT TOKEN FINALIZATION FOR INVITES AND REMINDERS',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.131 - Durable finalization links for invites and reminders'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
