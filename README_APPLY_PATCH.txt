SBI 8.0P.167.68 — Student documents vault patch

Apply from repo root:

git apply SBI-8.0P.167.68-student-documents-vault.diff

Then:

git status
git add .
git commit -m "Add admin student document vault"
git push origin main
firebase deploy --only hosting,functions,firestore:rules,storage --project sbi-web-4f6b4
