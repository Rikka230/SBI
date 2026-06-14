/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.368',
  branch: 'fix-viewer-mobile-nav-safe',
  channel: 'Messagerie : CORRECTIF requête DM. La requête `conversations where participants array-contains uid` était refusée (règle list via canReadConversation = OR de get() que l\'analyseur Firestore rejette) → les DM ne s\'affichaient QUE depuis le cache (visibles sur PC déjà chargé, INVISIBLES sur un appareil neuf comme le tél). Règle list passée au motif CANONIQUE array-contains (vérif directe du tableau participants). + pastille nav non-lus + groupes.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-14',
  label: 'SBI 8.0P.167.368 - Visualiseuse mobile (reprise sure apres incident .367) : le minuteur/actions passent dans la capsule flottante (slot Suiv.), barre du bas masquee sauf bouton Refaire. Implementation defensive : pas de MutationObserver, pas de :has() CSS, tout en try/catch hors du chemin de rendu (la capsule ne peut jamais bloquer l affichage de la lecon).'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
