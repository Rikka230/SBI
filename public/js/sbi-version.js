/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.347',
  branch: 'feature-messagerie',
  channel: 'Messagerie : correctif PERMISSIONS — lecture d\'un canal INEXISTANT (announce_*/group_* pas encore créés) autorisée (resource==null) ; sans ça, le getDoc sur doc absent levait sur null → « Missing or insufficient permissions » et la liste restait figée sur le cache. Traceur FOUC actif (?fouctrace=1).',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.347 - Messagerie : correctif permissions (lecture canal inexistant) — fin de la liste figée'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
