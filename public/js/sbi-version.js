/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.267',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'ecran eleves en retard : export CSV Qualiopi par promotion (metadonnees + 1 ligne/eleve : retard, decrochage, couverture preuves, preuves manquantes ; separateur ; + BOM pour Excel FR), lecture seule',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.267 - export Qualiopi CSV par promotion (lot 4)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
