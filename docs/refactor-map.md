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
