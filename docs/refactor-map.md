# SBI Refactor Map

Version chantier : 8.0K
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

## 8.0K - Teacher course editor PJAX

Statut : patch préparé.

Objectif : activer une première route éditeur en PJAX, uniquement côté prof.

Changements :

- `/teacher/mes-cours.html` passe en PJAX.
- `/admin/formations-cours.html` reste en reload classique.
- `route-guards.js` retire `/teacher/mes-cours.html` des hard reload.
- `route-registry.js` ajoute la route `teacher-courses`.
- `course-editor-bridge.js` initialise Quill et les interactions inline non rejouées par PJAX.
- `admin-courses.js` est inclus avec `mountAdminCourses()` pour garantir le montage propre.

Points à tester :

- dashboard prof → formations & cours ;
- formations & cours → dashboard prof ;
- bouton Nouveau Cours ;
- onglets Ma Bibliothèque / Éditeur ;
- Quill sélection partielle taille texte ;
- switch image/vidéo ;
- ouvrir un brouillon ;
- sauvegarder brouillon léger ;
- soumettre à validation si besoin sur un test.

Pages encore hors PJAX :

- éditeur cours admin ;
- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime.
