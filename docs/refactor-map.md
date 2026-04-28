# SBI Refactor Map

Version chantier : 8.0L.1
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

## 8.0L.1 - Admin editor tabs polish

Statut : patch préparé + suppression ciblée faite sur GitHub.

Objectif : corriger les retours admin après activation PJAX de l'éditeur cours.

Changements :

- Harmonisation CSS des barres de sous-navigation :
  - profil admin,
  - profil prof/élève si classes legacy présentes,
  - éditeur cours admin,
  - éditeur cours prof.
- `installCourseEditorTabs()` devient compatible avec :
  - `.student-sub-nav-item` / `.student-view`,
  - `.sub-nav-item` / `.course-section`.
- `window.switchCourseTab()` fonctionne proprement côté admin.
- `window.safeSwitchTab()` reste compatible côté teacher.
- Nouveau cours / Edit bascule maintenant vers la vraie vue éditeur au lieu d'afficher l'éditeur en bas de liste.
- Suppression directe GitHub :
  - `public/admin/repair-access.html`.
- `route-guards.js` ne référence plus `repair-access.html`.

Points à tester :

- admin → Formations & Cours ;
- cliquer Nouveau Cours ;
- l'onglet Éditeur doit être actif ;
- l'éditeur doit apparaître comme une vue, pas sous la liste ;
- éditer un cours existant ;
- vérifier les barres profil/admin ;
- vérifier que `window.SBI_PJAX_CHECK('/admin/repair-access.html')` indique route non migrée/reload ou 404 si ouverte directement.

Pages encore hors PJAX :

- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime ;
- live.
