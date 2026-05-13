/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.145',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2F.3',
  stage: 'PRIVATE P2F.3 DOMAIN RESET LINK + INDEX CTA FIX',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.145 - PRIVATE P2F.3 DOMAIN RESET LINK + INDEX CTA FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
