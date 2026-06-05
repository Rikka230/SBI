/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.348',
  branch: 'feature-messagerie',
  channel: 'FOUC élève/prof CORRIGÉ : recette validée sur la messagerie (thème interne en <link> STATIQUE + classes body sbi-internal-ui/sbi-*-space, AVANT components.js) généralisée aux 12 pages shell (dashboard/mes-cours/profil/documents/devoirs/livret ×2). Diag par traceur on-screen : le flash venait de feuilles ré-injectées en JS APRÈS le reveal ; en les ayant en statique avant le 1er paint, plus de re-style visible.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.348 - FOUC élève/prof corrigé (thème statique généralisé aux 12 pages shell)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
