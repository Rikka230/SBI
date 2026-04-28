# SBI Refactor Map

Version chantier : 8.0M.3
Branche de travail : `pjax-app-shell-test`

## 8.0M.3 - Viewer syntax & student course recovery

Statut : patch préparé.

## Bug 1 : viewer bloqué

Symptôme :

- écran `Préparation de votre leçon...`,
- console : `Uncaught SyntaxError: missing ) after argument list`,
- fichier : `cours-viewer.js`.

Correction :

- remplacement de la chaîne HTML preview par un template literal sécurisé.

## Bug 2 : cours notifié mais absent de Mes Cours

Symptôme :

- l'élève reçoit la notification,
- le clic notification ouvre le viewer,
- mais le cours n'apparaît pas dans la liste Mes Cours.

Correction :

- `mes-cours.js` récupère aussi les cours liés aux notifications.
- Les cours directs/non classés dans une formation visible sont affichés dans un dossier `Cours assignés`.
- Ajout de `window.SBI_STUDENT_COURSES_DEBUG()` pour inspecter :
  - formations visibles,
  - cours chargés,
  - cours directs.

## Points à tester

- Élève → Mes Cours :
  - vérifier présence du dossier `Cours assignés` si le cours n'est pas rangé dans une formation visible.
- Notification nouveau cours :
  - cliquer,
  - le viewer doit charger.
- Viewer :
  - timer,
  - contenu,
  - bouton quitter.
- Console :
  - `window.SBI_STUDENT_COURSES_DEBUG()`.
