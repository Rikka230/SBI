# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`

## État 8.0M.2

Patch bugfix prioritaire après 8.0M.1.

## Corrections

### Accès élève aux cours

La récupération des cours assignés est renforcée :

- support des champs array :
  - `formations`
  - `formationIds`
  - `formationsIds`
  - `targetFormationIds`
  - `targetFormationTitles`
- support des champs scalaires legacy :
  - `formationId`
  - `formation`
  - `formationTitre`
  - `formationTitle`
  - `formationName`
  - `formationNom`
  - `formationRef`
- fallback scan client si les requêtes ciblées ne ramènent pas les anciens cours.

### Panel d'assignation des formations

- Le modal `#formation-modal` est maintenant réinjecté en PJAX pour :
  - `/admin/formations-cours.html`
  - `/teacher/mes-cours.html`
- Les boutons `Modifier les accès` utilisent `currentTarget`.
- Si le modal manque, un warning console apparaît au lieu d'un clic silencieux.

## Routes viewer

Les viewers restent protégés en reload classique :

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## Version

`SBI 8.0M.2 - PJAX APP SHELL TEST`
