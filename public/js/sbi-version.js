/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.146',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2F.4',
  stage: 'PRIVATE P2F.4 INDEX HIRING CTA WIDTH FIX',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.146 - PRIVATE P2F.4 INDEX HIRING CTA WIDTH FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
