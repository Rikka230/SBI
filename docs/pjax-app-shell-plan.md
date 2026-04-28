# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`

## État 8.0M.3

Patch bugfix prioritaire.

## Corrections

### Viewer

- Correction d'une SyntaxError dans `public/student/js/cours-viewer.js`.
- La bannière preview n'utilise plus une chaîne avec apostrophe mal échappée.
- Le viewer doit de nouveau dépasser l'écran `Préparation de votre leçon...`.

### Mes Cours élève

- Ajout d'un fallback par notifications :
  - notifications `destinataireId`,
  - notifications `targetStudents`.
- Si un cours est notifié à l'élève mais ne remonte pas dans une formation visible, il apparaît dans un dossier :
  - `Cours assignés`.
- Ajout diagnostic :
  - `window.SBI_STUDENT_COURSES_DEBUG()`.

## Routes viewer

Les viewers restent protégés en reload classique :

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## Version

`SBI 8.0M.3 - PJAX APP SHELL TEST`
