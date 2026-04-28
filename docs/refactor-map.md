# SBI Refactor Map

Version chantier : 8.0M.4
Branche de travail : `pjax-app-shell-test`

## 8.0M.4 - Student course recovery opened notifications

Statut : patch préparé.

## Problème

Le cours M3 apparaît, donc le pipeline neuf fonctionne.
Le cours M2 reste invisible, probablement car il a été créé/ouvert pendant l'état viewer cassé :

- notification existante ;
- notification potentiellement marquée comme lue ;
- pas forcément de progression créée ;
- ciblage formation potentiellement incomplet.

## Changements

### `public/student/js/mes-cours.js`

- Le fallback de récupération par notifications n'ignore plus les notifications présentes dans `dismissedBy`.
- Les notifications résolues restent exclues.
- Les erreurs Firestore attendues sur `targetStudents` passent en `console.info`.
- `window.SBI_STUDENT_COURSES_DEBUG()` affiche :
  - formations assignées,
  - cours chargés,
  - cours directs,
  - dossiers rendus.

## Points à tester

- Élève → Mes Cours :
  - le cours M2 devrait réapparaître soit dans sa formation, soit dans `Cours assignés`.
- Console :
  - `window.SBI_STUDENT_COURSES_DEBUG()`.
- Viewer :
  - le cours M2 doit ouvrir si visible.
