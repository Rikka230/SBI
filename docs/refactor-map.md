# SBI Refactor Map

Version chantier : 8.0J
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

## 8.0J - Course editor mount foundation

Statut : patch préparé.

Objectif : préparer l'éditeur cours avant de l'activer en PJAX.

Changements :

- `public/admin/js/admin-courses.js` expose `mountAdminCourses()`.
- Le montage automatique classique reste conservé.
- Les listeners principaux peuvent maintenant être nettoyés lors d'un futur unmount PJAX.
- Ajout de `public/js/app-shell/course-editor-bridge.js` pour préparer :
  - chargement Quill,
  - onglets éditeur,
  - switch image/vidéo.
- Les routes éditeur restent en reload classique pour ce patch.

Pourquoi cette étape :

- `/teacher/mes-cours.html` et `/admin/formations-cours.html` contiennent Quill, uploads, validations et logique de cours.
- Il faut d'abord rendre le moteur montable avant de le charger dans le shell.

Pages encore hors PJAX :

- éditeur cours admin/prof ;
- viewer ;
- Quill ;
- quiz.
