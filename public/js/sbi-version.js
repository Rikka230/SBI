/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.253',
  branch: 'main',
  channel: 'FIX REPLAY DAILY - FALLBACK RECORDING LOOKUP',
  stage: 'resolveLiveReplay: fallback liste non-filtree (match room_name + fenetre temporelle) + logging diag',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.253 - fix replay daily fallback recording lookup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
