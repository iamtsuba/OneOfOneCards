# 1/1 Cards

Ouverture de boosters de cartes numérotées : chaque carte n'existe qu'en **un seul exemplaire**. Les boosters sont regroupés en
catégories (« Années 80 », « Années 90 »…), chaque catégorie contient des types de cartes (Magnétoscope VHS, Fax…) et chaque type
a sa propre numérotation de 1/1 à N/N. Site : https://1o1cards.cc/ (préproduction : https://1o1cards.cc/preprod/).

- Front : React + Vite, hébergé sur GitHub Pages
- Base de données : Supabase. Tirages, ventes et enchères sont gérés côté serveur (fonctions Postgres), jamais dans le navigateur
- Deux environnements dans la **même base** : production (tables `o1ocards_*`) et préproduction (tables `pp_o1ocards_*`)

## Documentation

- [Environnements, mise en service et livraison](docs/environnements.md)
- [Règles du jeu et réglages](docs/regles-du-jeu.md)

## Commandes

```bash
npm ci
npm run dev               # développement local, sur la préproduction
npm run build:all         # génère le SQL, les fonctions Edge et les deux sites
npm run deploy:preprod    # publie la préproduction (GITHUB_TOKEN requis)
npm run deploy:prod       # publie la production
npm test                  # tests du front, des fonctions Edge et du SQL
```

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `src/` | application React (`src/env.js` : réglages de l'environnement) |
| `supabase/schema.template.sql` | source unique du SQL (préfixe `{{P}}`) |
| `supabase/generated/` | SQL généré pour la prod et la préprod (à exécuter dans le SQL Editor) |
| `supabase/migrations/` | migrations ponctuelles |
| `supabase/functions/` | fonctions Edge générées (`_templates/` : modèles) |
| `scripts/` | génération du SQL et des fonctions, déploiement |
| `tests/` | tests du front, des fonctions Edge et du SQL |
| `skills/o1ocards-release/` | skill Claude de livraison préproduction → production (copie du fichier `.skill`) |
| `.env.prod`, `.env.preprod` | réglages publics de chaque environnement |

Branches : `main` = production, `preprod` = développement et préproduction, `gh-pages` = sites publiés (ne pas modifier à la main).

