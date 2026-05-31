/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.265',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'ecran eleves en retard : section "Couverture Qualiopi par promotion" (% de preuves cours isQualiopiEvidence validees par les eleves + eleves avec preuves manquantes), lecture seule',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.265 - couverture Qualiopi par promotion (lot 2)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
