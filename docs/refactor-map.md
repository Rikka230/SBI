# SBI Refactor Map

Version chantier : 8.0L
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Check ZIP 8.0K.4

Le ZIP actuel reçu est bien en version :

```txt
SBI 8.0K.4 - PJAX APP SHELL TEST
```

Aucun dossier parasite `SBI-*` détecté à la racine du ZIP.

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

## 8.0L - Admin course editor PJAX

Statut : patch préparé.

Objectif : activer l'éditeur cours admin dans le shell.

Changements :

- `/admin/formations-cours.html` passe en PJAX.
- `route-guards.js` retire `/admin/formations-cours.html` des hard reload.
- `route-registry.js` ajoute la route `admin-courses`.
- `course-editor-bridge.js` devient compatible avec :
  - `#quill-editor`,
  - `#course-editor`.
- L'éditeur admin utilise maintenant le même montage propre que l'éditeur prof.
- Les tooltips Quill 8.0K.4 restent conservés.

Points à tester :

- admin index → Formations & Cours ;
- Formations & Cours → Utilisateurs ;
- Formations & Cours → Gestion Accueil ;
- bouton Nouveau Cours ;
- onglets Ma Bibliothèque / Éditeur ;
- Quill sélection partielle taille texte ;
- tooltips Quill ;
- switch image/vidéo ;
- ouvrir un cours/brouillon existant ;
- sauvegarde brouillon léger.

Pages encore hors PJAX :

- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime ;
- live.
