/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.266',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'ecran eleves en retard : section "En decrochage" (cours obligatoire dont recommendedStartAt est passe mais status todo, signal preventif sans recouvrement avec le retard), lecture seule',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.266 - detection decrochage (pas demarre a temps) (lot 3)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
