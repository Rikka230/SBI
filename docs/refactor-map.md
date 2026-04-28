# SBI Refactor Map

Version chantier : 8.0D
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Objectif

Réorganiser progressivement SBI sans casser les espaces validés.

Priorités :

1. aucune page blanche ;
2. aucun accès formation/cours cassé ;
3. pas d'emoji dans les interfaces ;
4. fichiers lisibles et segmentés ;
5. refonte visuelle cohérente par rôle ;
6. médias lourds hors repo, pilotés par Storage/Firestore ;
7. navigation PJAX progressive avec fallback reload.

## Règle de sécurité

Si un fichier est trop gros ou refusé par l'outil GitHub :

- ne pas rafistoler ;
- signaler le fichier ;
- préparer une version complète ou une découpe ;
- faire uploader/remplacer manuellement par Tony si nécessaire.

## Limite cible

Cible raisonnable : 700 à 900 lignes par fichier JS/CSS métier.
Maximum toléré : 1100 lignes, uniquement temporairement.

## Module à ne pas réactiver sans test

- `public/admin/js/sbi-internal-shell.js`
  - tentative shell/PJAX partielle.
  - statut : désactivé.
  - raison : probable contribution à une page blanche étudiant.

## Accès formations/cours

Règle logique actuelle :

- priorité à `users/{uid}.formationIds` ;
- fallback à `users/{uid}.formationsAcces` ;
- fallback membership `formations.students` ou `formations.profs` ;
- compatibilité anciens cours : `courses.formations` peut contenir un ID ou un titre.
- compatibilité cours publiés : `targetStudents`, `targetFormationIds`, `targetFormationTitles`.

Ne pas casser cette compatibilité tant que la base n'est pas migrée proprement.

## Étapes validées avant PJAX

### 7.0.3 - Correctif Quill prof + diffusion élèves

Statut : validé.

- Quill côté professeur applique la taille uniquement sur la sélection texte active.
- La publication admin recalcule les élèves ciblés à partir des formations du cours.
- Les cours publiés stockent `targetStudents`, `targetFormationIds` et `targetFormationTitles`.
- Les notifications élèves sont créées explicitement par élève ciblé.
- La lecture élève retrouve les cours via formation ou `targetStudents`.

### 7.1 - Harmonisation UI profils / éditeur / visualiseuse

Statut : validé.

- Profils admin / teacher / student.
- Éditeur cours admin.
- Éditeur cours teacher.
- Visualiseuse student / teacher.
- Aucun changement auth, Firestore, Storage, progression, notifications ou rules.

### 7.2 - Navigation progressive légère

Statut : validé.

- Transition visuelle courte sur les liens internes standards.
- Fermeture automatique des panneaux mobiles avant changement de page.
- Support clavier `Entrée` / `Espace` sur les éléments `data-sbi-href`.
- États actifs des panels consolidés.
- Pas de PJAX complet à ce stade.

### 7.3 - Audit sécurité/rules + nettoyage warnings

Statut : validé après déploiement rules.

- Lectures courses / formations / notifications durcies.
- Compatibilité target formations conservée.
- Storage rules médias cours renforcées.
- Debug optionnel avec :

```js
localStorage.setItem('sbiDebugAccess', 'true')
```

### 7.4 - Performance / médias / cache / merge readiness

Statut : validé et mergé dans `main`.

- Fond index/login rehaussé.
- Terrain, particules et traits lumineux renforcés.
- Logos login WebP + fallback PNG.
- Médias lourds pilotés par Firebase Storage.
- Cleanup final avant merge main.
- Backup final conservé.

## Étape 8.0A - App shell foundation PJAX expérimental

Statut : validé sur branche `pjax-app-shell-test`.

Objectif : poser les rails du vrai app shell sans remplacer toute la navigation.

Fichiers ajoutés :

- `public/js/app-shell/app-shell.js`
- `public/js/app-shell/router.js`
- `public/js/app-shell/route-registry.js`
- `public/js/app-shell/view-lifecycle.js`
- `public/js/app-shell/firebase-listeners.js`
- `public/js/app-shell/transitions.js`
- `public/js/app-shell/preload.js`
- `docs/pjax-app-shell-plan.md`

Principes :

- routeur désactivé par défaut ;
- activation locale avec `localStorage.setItem('sbiPjaxEnabled', 'true')` ;
- fallback reload complet pour toute route non migrée ;
- première route sûre limitée aux onglets admin déjà montés ;
- aucune migration des viewers, éditeurs, Quill, notifications lourdes ou flux Firebase critiques.

## Étape 8.0B - Admin shell : Gestion Accueil

Statut : validé en test initial.

Objectif : migrer une première vraie page admin externe dans le shell, sans toucher aux pages sensibles.

Changements :

- Ajout d'un loader de page admin externe : `public/js/app-shell/admin-page-loader.js`.
- Route PJAX pour `/admin/site-index-settings.html`.
- Route de retour vers `/admin/index.html?tab=...` avec restauration des onglets admin.
- Refactor de `public/admin/js/site-index-settings.js` en fonction `mountSiteIndexSettings()` avec cleanup.
- Nettoyage des listeners de Gestion Accueil au changement de vue.
- Fallback reload conservé si la route ou le montage échoue.

## Étape 8.0C - Version badge centralisé

Statut : validé.

Objectif : remplacer l'ancien badge figé par un badge version fiable.

Fichiers ajoutés :

- `public/js/sbi-version.js`
- `public/js/sbi-version-badge.js`

Fichier raccordé :

- `public/admin/js/admin-ui.js`

Version affichée :

```txt
SBI 8.0C - PJAX APP SHELL TEST
```

## Étape 8.0D - Admin shell : Mon Profil

Statut : patch préparé.

Objectif : migrer `/admin/admin-profile.html` dans le shell.

Changements :

- Route PJAX `admin-profile`.
- `profile-core.js` devient compatible montage direct via `mountProfileCore()`.
- Cleanup auth/presence du profil au changement de route.
- Chargement du script CropperJS si nécessaire.
- Injection du modal cropper depuis la page profil.
- Profil admin rattaché à l'onglet Utilisateurs.
- Version centralisée passée en `8.0D`.

Pages encore hors PJAX :

- éditeur cours ;
- viewer ;
- Quill ;
- quiz ;
- pages student / teacher.
