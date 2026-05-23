# SBI 8.0P.167.190 — SEO redirects and 404 cleanup

Patch ZIP minimal basé sur la mémoire Git SBI.

## Fichiers modifiés

- `firebase.json`
  - ajout des redirections 301 des anciennes URLs Wix vers les pages publiques Firebase ;
  - conservation des Functions existantes ;
  - ajout cache no-cache pour `robots.txt` et `sitemap.xml`.

- `public/404.html`
  - nouvelle page 404 propre, premium SBI, en `noindex, follow`.

- `public/js/sbi-version.js`
  - bump version vers `8.0P.167.190`.

## Déploiement

```bash
git checkout main
git pull origin main
# copier les fichiers du ZIP dans le repo en respectant les chemins
git status
git add firebase.json public/404.html public/js/sbi-version.js
git commit -m "SEO redirects and 404 cleanup"
git push origin main
firebase deploy --only hosting --project sbi-web-4f6b4
```

## Après déploiement

Tester :

```txt
https://www.sbigroup.fr/about
https://www.sbigroup.fr/about-3
https://www.sbigroup.fr/faq
https://www.sbigroup.fr/contact-8
https://www.sbigroup.fr/book-online
https://www.sbigroup.fr/courses/arts-%26-crafts
https://www.sbigroup.fr/une-page-qui-nexiste-pas
```

À traiter dans une passe suivante si besoin : ajout statique des canonical / Open Graph directement dans les `<head>` HTML.
