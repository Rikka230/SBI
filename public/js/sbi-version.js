/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.166.8',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-E.4 PROFILE RETURN FIX',
  stage: 'PRIVATE PROFILE REFRESH RETURN FIX',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.166.8 - PROFILE REFRESH RETURN FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
