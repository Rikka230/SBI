# SBI Refactor Map

Version chantier : 6.7C
Branche de travail : `avatar-profile-test`

## Objectif

Réorganiser progressivement SBI sans casser les espaces validés.

Priorités :

1. aucune page blanche ;
2. aucun accès formation/cours cassé ;
3. pas d'emoji dans les interfaces ;
4. fichiers lisibles et segmentés ;
5. refonte visuelle cohérente par rôle ;
6. médias lourds hors repo, pilotés par Storage/Firestore.

## Règle de sécurité

Si un fichier est trop gros ou refusé par l'outil GitHub :

- ne pas rafistoler ;
- signaler le fichier ;
- préparer une version complète ou une découpe ;
- faire uploader/remplacer manuellement par Tony si nécessaire.

## Limite cible

Cible raisonnable : 700 à 900 lignes par fichier JS/CSS métier.
Maximum toléré : 1100 lignes, uniquement temporairement.

## Fichiers à découper plus tard

### Très prioritaires

- `public/admin/js/admin-courses.js`
  - cible : découpage en modules cours admin.
  - risque : création/édition/suppression cours, upload média, validation.

- `public/js/profile-core.js`
  - cible : profil data, avatar, badges, tracking, private data.
  - risque : profils student/teacher/admin.

- `public/admin/js/components.js`
  - cible : panels admin/student/teacher en modules templates.
  - risque : navigation latérale, topbar, notifications, logout.

### Moyens

- `public/admin/index.html`
  - cible : extraire les vues inline en fichiers dédiés ou templates.

- `public/index.html`
  - cible : garder HTML propre, médias dynamiques uniquement via Storage/Firestore.

## Modules déjà ajoutés

- `public/admin/js/sbi-component-polish.js`
  - polish visuel non bloquant.
  - retire emojis résiduels.
  - remplace marque panel par SVG + label.

- `public/admin/js/sbi-safe-fixes.js`
  - garde-fous navigation/onglets/assistant.

- `public/admin/js/course-data-access.js`
  - accès cours/formations query-safe pour admin/prof.

- `public/student/js/mes-cours.js`
  - accès formations/cours étudiant durci avec fallbacks.

- `public/js/site-index-public.js`
  - médias index via Firestore/Storage.

- `public/admin/js/site-index-settings.js`
  - gestion admin des médias index.

## Module à ne pas réactiver sans test

- `public/admin/js/sbi-internal-shell.js`
  - tentative shell/PJAX partielle.
  - statut : désactivé.
  - raison : probable contribution à une page blanche étudiant.

## Prochaine découpe recommandée

### Étape 6.7D : components.js

Découper sans changer le rendu :

- `public/admin/js/components/panel-icons.js`
- `public/admin/js/components/admin-panels.js`
- `public/admin/js/components/student-panels.js`
- `public/admin/js/components/teacher-panels.js`
- `public/admin/js/components/shared-search.js`
- `public/admin/js/components/shared-auth-actions.js`

Puis transformer `components.js` en simple point d'entrée qui importe ces modules.

### Étape 6.7E : profile-core.js

Créer :

- `public/js/profile/profile-data.js`
- `public/js/profile/profile-avatar.js`
- `public/js/profile/profile-badges.js`
- `public/js/profile/profile-tracking.js`
- `public/js/profile/profile-private-data.js`

### Étape 6.7F : admin-courses.js

Créer :

- `public/admin/js/courses/course-state.js`
- `public/admin/js/courses/course-formations.js`
- `public/admin/js/courses/course-editor.js`
- `public/admin/js/courses/course-render.js`
- `public/admin/js/courses/course-save.js`
- `public/admin/js/courses/course-delete.js`

## Accès formations/cours

Règle logique actuelle :

- priorité à `users/{uid}.formationIds` ;
- fallback à `users/{uid}.formationsAcces` ;
- fallback membership `formations.students` ou `formations.profs` ;
- compatibilité anciens cours : `courses.formations` peut contenir un ID ou un titre.

Ne pas casser cette compatibilité tant que la base n'est pas migrée proprement.

## Étape 6.7E : stabilisation components / panels / topbars

Statut : patch ZIP préparé.

Objectifs :

- signal central `SBI_COMPONENTS_READY` plus fiable ;
- attente réelle des panels/topbars avant injection Firebase ;
- événements `sbi:component-mounted` et `sbi:topbar-ready` ;
- admin nav sans reload inutile sur `/admin/index.html` ;
- navigation admin vers onglets depuis pages admin externes conservée ;
- profils/topbars student/teacher/admin synchronisés via helper partagé ;
- anti page blanche conservé.

Fichier ajouté :

- `public/admin/js/components/ready.js`

Fichiers consolidés :

- `public/admin/js/components.js`
- `public/admin/js/components/index.js`
- `public/admin/js/components/admin-panels.js`
- `public/admin/js/components/student-panels.js`
- `public/admin/js/components/teacher-panels.js`
- `public/admin/js/admin-ui.js`
- `public/admin/js/admin-notifications.js`
- `public/student/js/student-hub.js`
- `public/student/js/mes-cours.js`
- `public/teacher/js/teacher-dashboard.js`
- `public/js/profile-core.js`


## Étape 6.9 - Découpe profile-core.js

Statut : patch préparé.

Objectif : transformer `public/js/profile-core.js` en orchestrateur léger.

Nouveaux modules :

- `public/js/profile/profile-utils.js`
- `public/js/profile/profile-topbar.js`
- `public/js/profile/profile-presence.js`
- `public/js/profile/profile-formations.js`
- `public/js/profile/profile-render.js`
- `public/js/profile/profile-tracking.js`
- `public/js/profile/profile-edit.js`
- `public/js/profile/profile-avatar-cropper.js`

Points conservés :

- affichage topbar nom/avatar/niveau ;
- profil public ;
- données privées propriétaire/admin ;
- édition bio/téléphone/adresse ;
- badges XP ;
- formations assignées avec les fallbacks learning-access ;
- suivi cours/quiz avec reset et édition de note admin ;
- présence en ligne ;
- cropper avatar + Storage + migration anciens avatars base64.

Fichier critique : `profile-core.js` devient un point d'entrée de coordination.


## Patch 6.9.1

Objectif : stabilisation post-découpe profil.

- Correction upload avatar élève/prof : fallback `photoURL` si les rules Firestore déployées ne permettent pas encore les nouveaux champs Storage.
- Ajout des champs avatar Storage dans `firestore.rules` : `photoStoragePath`, `avatarUpdatedAt`, `avatarStorageVersion`, `avatarCleanupAt`.
- Gel des animations parasites du dashboard admin qui pouvaient donner une impression de déplacement droite/gauche des cartes.

Action requise après remplacement : déployer les rules Firestore pour activer la sauvegarde complète des métadonnées avatar.
