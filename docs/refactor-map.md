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

## Étape 6.9.3 - Console cleanup ciblé

Objectif : nettoyer les faux signaux rouges après 6.9 sans changer la logique métier.

- Les permissions Firestore optionnelles dans `learning-access.js` passent en debug silencieux.
- Le suivi profil ne log plus chaque cours inaccessible en warning attendu.
- Les erreurs notification attendues liées aux écoutes non autorisées sont silencieuses.
- Les fallbacks avatar Storage restent fonctionnels mais ne polluent plus la console.
- Gestion Accueil ne tente plus de charger les anciens médias locaux supprimés (`sbi_master.webm`, `sbi.mp4`).
- Le cropper affiche une vraie prévisualisation simple pour les avatars Storage distants au lieu d'un cadre vide.
- La grille spark du dashboard admin respire sans translation latérale.

Pour réactiver les logs détaillés :

```js
localStorage.setItem('sbiDebugAccess', 'true')
```


## Étape 7.0 - Découpe admin-courses.js

Statut : patch préparé.

Objectif : réduire le fichier critique `public/admin/js/admin-courses.js` sans changer le comportement métier.

Résultat :

- `admin-courses.js` passe d'environ 1498 lignes à environ 1149 lignes.
- Les blocs les plus autonomes sont déplacés dans `public/admin/js/courses/`.
- La création/édition/suppression de cours reste orchestrée par `admin-courses.js`.

Nouveaux modules :

- `public/admin/js/courses/course-icons.js`
  - icônes SVG utilisées par l'éditeur de cours.

- `public/admin/js/courses/course-quiz-builder.js`
  - ajout question quiz ;
  - ajout option ;
  - collecte des questions ;
  - rendu du builder quiz.

- `public/admin/js/courses/course-formations-ui.js`
  - rendu des formations accessibles ;
  - modal d'assignation prof/élève ;
  - pills formations ;
  - filtre bibliothèque ;
  - liste blocs.

- `public/admin/js/courses/course-save-feedback.js`
  - messages de sauvegarde ;
  - auteur affiché ;
  - filtrage brouillons admin.

- `public/admin/js/courses/course-notifications.js`
  - notifications validation ;
  - notifications publication ;
  - notifications refus ;
  - résolution des notifications de validation.

Points à tester :

- admin : création formation ;
- admin : modification accès formation ;
- prof/admin : création cours texte ;
- prof/admin : création cours quiz ;
- brouillon ;
- soumission validation ;
- publication admin ;
- refus admin ;
- visualisation preview ;
- duplication cours ;
- suppression cours + médias Storage.


## Étape 7.0.1 - Correctif publication cours

- Correction du passage de contexte vers `handleCourseNotifications`.
- Une erreur de notification ne bloque plus la sauvegarde d'un cours déjà enregistré.
- La notification élève `new_course_published` retrouve les élèves via les formations sélectionnées.
- Le toolbar Quill conserve la sélection avant de changer la taille de texte.
- Les notifications émettent `sbi:notifications-updated` pour fiabiliser le bip assistant sur vraie nouvelle notification.

## Étape 7.0.2 - Correctif sélection Quill + publication cours

Objectifs :

- la taille Quill s'applique uniquement au texte sélectionné, pas à toute la ligne ;
- les cours publiés stockent `targetStudents` pour sécuriser l'accès élève ;
- les élèves peuvent récupérer les cours publiés via `targetStudents` en fallback ;
- les listes Firestore `courses` et `notifications` restent listables par utilisateur actif pour éviter les blocages query-safe en preview.

Après installation, redéployer les Firestore Rules.

## Étape 7.0.3 - Correctif Quill prof + diffusion élèves

Statut : validé.

Objectifs :

- Quill côté professeur applique la taille uniquement sur la sélection texte active.
- La publication admin recalcule les élèves ciblés à partir des formations du cours.
- Les cours publiés stockent `targetStudents`, `targetFormationIds` et `targetFormationTitles`.
- Les notifications élèves sont créées explicitement par élève ciblé.
- La lecture élève retrouve les cours via formation ou `targetStudents`.

Aucun redéploiement rules nécessaire pour ce patch.

## Étape 7.1 - Harmonisation UI profils / éditeur / visualiseuse

Statut : patch préparé.

Objectif : homogénéiser les surfaces internes sans toucher aux flux métier.

Fichier ajouté :

- `public/css/sbi-7-1-harmonization.css`

Pages harmonisées :

- profils admin / teacher / student ;
- éditeur cours admin ;
- éditeur cours teacher ;
- visualiseuse student / teacher.

Principes conservés :

- admin : dark cockpit premium bleu SBI ;
- student : light pédagogique bleu SBI ;
- teacher : light coach orange sport ;
- aucun changement auth, Firestore, Storage, progression, notifications ou rules.

Micro-nettoyage inclus :

- retrait d'emojis d'interface restants sur les pages touchées ;
- remplacement de petits pictogrammes texte par SVG ou libellés propres ;
- bannière de prévisualisation viewer alignée avec la nouvelle couche UI.

## Étape 7.1.1 - Correctif avatars profils

Statut : validé.

Objectif : corriger les défauts visuels apparus après l'harmonisation profils.

- Suppression du fond carré parasite autour des avatars student / teacher.
- Badge d'édition avatar repositionné et unifié.
- Aucun changement auth, Storage, cropper ou données profil.

## Étape 7.2A - Navigation interne progressive

Statut : patch préparé.

Objectif : poser une première couche de navigation fluide sans activer de PJAX complet.

Fichier ajouté :

- `public/js/sbi-navigation-transitions.js`

Fichiers raccordés :

- `public/admin/js/admin-ui.js`
- `public/admin/js/components/admin-panels.js`
- `public/admin/js/components/student-panels.js`
- `public/admin/js/components/teacher-panels.js`
- `public/admin/js/admin-ui/admin-media-nav.js`
- `public/admin/js/site-index-nav.js`

Principe :

- navigation interne standard conservée via `window.location` ;
- transition visuelle légère avant changement de page ;
- écoute déléguée sur liens internes et éléments `data-sbi-href` ;
- menus student / teacher sans `onclick` inline pour préparer une navigation plus propre ;
- pas de modification des viewers, de l'auth, des notifications, de Firestore, de Storage ou des rules.
