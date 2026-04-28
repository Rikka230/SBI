# SBI Refactor Map

Version chantier : 8.0M
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

## 8.0M - Viewer bridge foundation

Statut : patch préparé.

Objectif : préparer la migration viewer sans l'activer.

Changements :

- Ajout de `public/js/app-shell/course-viewer-bridge.js`.
- Ajout de helpers :
  - `isCourseViewerUrl()`,
  - `getViewerRoleFromUrl()`,
  - `getViewerRouteStatus()`,
  - `createViewerLifecyclePlan()`.
- Diagnostics disponibles :
  - `window.SBI_VIEWER_STATUS('/student/cours-viewer.html?id=test')`,
  - `window.SBI_VIEWER_ROUTES()`.
- `admin-ui.js` installe les diagnostics viewer.
- Les routes viewer restent protégées en reload classique.

Pourquoi ne pas activer tout de suite :

- le viewer actuel démarre sur `DOMContentLoaded` ;
- il utilise `onAuthStateChanged` directement ;
- il gère un `timerInterval` ;
- il sauvegarde la progression Firestore ;
- il porte le runtime quiz ;
- il utilise une redirection dynamique de sortie.

Prochaine étape possible :

- 8.0M.1 : rendre `/student/js/cours-viewer.js` montable sans changer le comportement reload.
- 8.0N : activer d'abord le viewer preview prof/admin en PJAX.
- 8.0N+ : activer le viewer étudiant seulement après validation du preview.
