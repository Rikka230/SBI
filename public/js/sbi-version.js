/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.279',
  branch: 'main',
  channel: 'Replay Live servi depuis Firebase Storage (economie Daily)',
  stage: 'nouvelle logique replay : a la cloture le replay Daily est telecharge vers Firebase Storage (live-replays/{liveId}/replay.mp4) puis supprime cote Daily ; les eleves chargent la video DIRECTEMENT depuis Storage via une URL signee V4 emise par resolveLiveReplay. Archivage best-effort a la cloture + cron runLiveReplayArchival toutes les 5 min (recording Daily pas pret a l instant de la cloture) + archivage a la volee au 1er visionnage. cancelLiveReplay supprime aussi la copie Storage.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.279 - replay Live archive sur Storage + suppression Daily (economie de cout)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
