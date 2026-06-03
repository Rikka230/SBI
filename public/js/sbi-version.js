/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.305',
  branch: 'main',
  channel: 'Navigation : ordre des onglets par fréquence d usage (PC) + IA livret/retour-admin',
  stage: 'Réordonnancement des panneaux PC par importance/fréquence (source unique de l ordre, qui sert aussi à choisir les onglets primary de la future bottom-nav mobile) : Élève = Hub/Cours/Devoirs/Lives/Profil ; Prof = Espace/Formations/Devoirs/Lives/Profil puis Livrets+Documents en dernier ; Admin = Dashboard/Comptes/Promotions/Cursus/Formations/Retard/Journal/Serveur. IA : (1) onglet « Mon livret » retiré de la nav élève → accessible depuis le coffre « Mes documents SBI » du profil ; (2) bouton « Retour admin » retiré des panneaux élève/prof/tuteur (était mort hors /admin/ ; reviendra comme entrée admin-only dans le shell).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.305 - Onglets réordonnés par importance (PC) + livret dans le coffre profil'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
