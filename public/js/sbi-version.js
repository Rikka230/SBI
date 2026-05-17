/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.56',
  branch: 'main',
  channel: 'ADMIN ACCOUNT EMAIL ISSUE PRIORITY FIX',
  stage: 'EMAIL REJECTED INVALID PRIORITY BEFORE PASSWORD WAITING',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.56 - EMAIL REJECTED INVALID PRIORITY BEFORE PASSWORD WAITING'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
