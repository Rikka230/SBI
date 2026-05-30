/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.258',
  branch: 'main',
  channel: 'LIVE - BOUTON ANNULATION ADMIN TOUJOURS VISIBLE',
  stage: 'bouton annuler/supprimer replay affiche pour tout admin (desactive si aucune session), independant du statut/periode',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.258 - admin cancel button always visible'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
