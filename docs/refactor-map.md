# SBI Refactor Map

Version chantier : 8.0L.2
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

## 8.0L.2 - Admin chrome harmonization

Statut : patch préparé.

Objectif : aligner les panneaux gauche/droit/topbar des pages admin avec la référence Dashboard / Profil.

Changements :

- Ajout de `public/admin/css/sbi-admin-chrome-harmonization.css`.
- `theme.js` injecte cette couche visuelle.
- Le style cockpit admin s'applique à tout `body.sbi-admin-space.sbi-internal-ui`, pas seulement au dashboard.
- Les panneaux Formations & Cours admin récupèrent :
  - fond cockpit sombre,
  - bordures SBI,
  - nav active bleue,
  - widget profil harmonisé,
  - topbar harmonisée.
- La vue médias/stockage de l'index admin reçoit aussi une couche visuelle plus cohérente.
- `theme.js` lit `window.SBI_APP_SHELL_CURRENT_URL` pour rester fiable en PJAX.

Points à tester :

- Dashboard admin : panneaux inchangés.
- Profil admin : panneaux inchangés.
- Formations & Cours admin : panneaux identiques au style cockpit.
- Index admin > Serveur & Stockage / médias : panneaux et cartes cohérents.
- Gestion Accueil : panneau gauche/droit cohérents.
- Côté student/teacher : vérifier qu'on ne casse pas leur style clair/orange.

Pages encore hors PJAX :

- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime ;
- live.
