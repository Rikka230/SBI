/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.351',
  branch: 'feature-group-conversations',
  channel: 'Messagerie : pastille « nouveaux messages » sur l\'entrée Messagerie de la nav (bottom-nav + bouton « Plus » + nav desktop) — visible sur MOBILE où la cloche/assistant est peu repérable. La pastille s\'efface à la lecture du fil (dismiss de la notif new_message). + ping groupes + groupes personnalisés.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.351 - Messagerie : pastille non-lus sur la nav (visible mobile) + efface à la lecture'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
