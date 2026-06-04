/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.319',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile (3/3) : filet responsive sur les pages de consultation (anti-débordement ≤768px)',
  stage: 'Adaptation mobile ADMIN — pages de consultation (Comptes, Élèves en retard, Journal, Profil, Dashboard, Réglages accueil). Filet de sécurité PRUDENT (admin-responsive.css, ≤768px uniquement) : les tables/grilles denses deviennent scrollables DANS #main-content au lieu de casser la mise en page ; padding resserré ; images bornées. Desktop jamais touché. Le « mode cartes » fin par table reste une passe QA visuelle ultérieure (à faire avec retours réels).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.319 - Admin mobile (3/3) : filet responsive consultation (anti-débordement)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
