# SBI Refactor Map

Version chantier : 8.0M.1
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Étapes PJAX validées

- 8.0A : foundation.
- 8.0B : Gestion Accueil admin.
- 8.0C : badge version centralisé.
- 8.0D : profil admin.
- 8.0D.1 : cache retour utilisateurs.
- 8.0E : PJAX activé par défaut.
- 8.0F : student dashboard / mes cours.
- 8.0F.2 : inline style guard.
- 8.0G : teacher dashboard / profil.
- 8.0G.1 : active nav sync.
- 8.0H : profil étudiant.
- 8.0H.1 : polish profil.
- 8.0I.1 : diagnostics clean.
- 8.0J : foundation éditeur cours montable.
- 8.0K : teacher course editor PJAX.
- 8.0K.4 : Quill tooltip single bottom.
- 8.0L : admin course editor PJAX.
- 8.0L.1 : admin editor tabs polish.
- 8.0L.2 : admin chrome harmonization.
- 8.0M : viewer bridge foundation.

## 8.0M.1 - Viewer mountable core

Statut : patch préparé.

Objectif : rendre le viewer montable sans activer le PJAX viewer.

Changements :

- `cours-viewer.js` expose `mountCourseViewer({ source })`.
- Auto-mount conservé pour les navigations classiques.
- `activeViewerCleanup` évite les doubles montages.
- `cleanup()` :
  - coupe le timer de sécurité,
  - désabonne `onAuthStateChanged`,
  - nettoie le bouton retour.
- Le viewer utilise `getEffectiveViewerUrl()` pour compatibilité future shell.
- Les bannières preview sont marquées `data-sbi-viewer-banner`.
- Les routes viewer restent protégées en reload classique.

Points à tester :

- ouvrir un cours étudiant classique ;
- vérifier progression / timer ;
- passer un quiz ;
- quitter la leçon ;
- ouvrir un aperçu prof/admin ;
- vérifier que `window.SBI_VIEWER_STATUS()` indique toujours `reload-protected`.

Pages encore hors PJAX :

- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime ;
- live.
