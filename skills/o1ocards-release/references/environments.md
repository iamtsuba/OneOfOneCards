# 1/1 Cards : environnements, mise en service et livraison

## Vue d'ensemble

| | **Production** | **Préproduction** |
|---|---|---|
| Adresse | `https://1o1cards.cc/` | `https://1o1cards.cc/preprod/` |
| Branche Git (code source) | `main` | `preprod` |
| Tables et fonctions SQL | `o1ocards_*` | `pp_o1ocards_*` |
| SQL à exécuter | `supabase/generated/schema.prod.sql` | `supabase/generated/schema.preprod.sql` |
| Fonctions Edge | `o1ocards-checkout`, `o1ocards-stripe-webhook` | `pp-o1ocards-checkout`, `pp-o1ocards-stripe-webhook` |
| Secrets Supabase | `STRIPE_SECRET_KEY`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET` | `PP_STRIPE_SECRET_KEY`, `PP_SITE_URL`, `PP_STRIPE_WEBHOOK_SECRET` |
| Stripe | clés **live** (ou test tant que tu ne vends pas) | clés **test** uniquement (une clé `sk_live_` est refusée) |
| Session de connexion (navigateur) | `o1ocards-auth` | `pp-o1ocards-auth` |
| Fichier de réglages du front | `.env.prod` | `.env.preprod` (aussi utilisé par `npm run dev`) |

Les deux environnements utilisent **la même base Supabase** (mêmes comptes joueurs, `auth.users` partagé) mais des tables et des
fonctions séparées : la progression en préproduction n'affecte jamais la production. La préproduction affiche un bandeau jaune
« Préproduction » et n'est pas référencée par les moteurs de recherche.

Le site est publié sur GitHub Pages (branche `gh-pages`) : la production à la racine, la préproduction dans le dossier `preprod/`.
Le fichier `CNAME` (domaine) est conservé à chaque déploiement.

### Adresses provisoires (avant la configuration du domaine)

Tant que `1o1cards.cc` n'est pas relié à GitHub Pages, les sites sont accessibles sur `https://iamtsuba.github.io/OneOfOneCards/`
(production) et `https://iamtsuba.github.io/OneOfOneCards/preprod/` (préproduction). Ces adresses dépendent du nom du dépôt : si le
dépôt est renommé, elles changent et il faut mettre à jour les secrets `SITE_URL` / `PP_SITE_URL` et l'adresse du site dans Supabase.

## Modèle SQL : un seul fichier source

Tout le SQL part de `supabase/schema.template.sql`, où `{{P}}` désigne le préfixe. `npm run build:schema` génère
`supabase/generated/schema.prod.sql` et `schema.preprod.sql` (à ne pas modifier à la main). Chaque fichier est **relançable sans risque**.

Pour une modification de structure qui ne peut pas être rejouée telle quelle (renommer une colonne, déplacer des données),
écris une migration `supabase/migrations/NNN_nom.template.sql` (même principe, `{{P}}`) : elle est générée pour chaque environnement.

## Mise en service (une seule fois)

### 1. Domaine
Chez le revendeur du domaine `1o1cards.cc`, ajoute 4 enregistrements **A** sur `@` (domaine nu) :
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, et un **CNAME** `www` vers `iamtsuba.github.io`.
Puis, sur GitHub : dépôt > Settings > Pages > *Custom domain* : `1o1cards.cc`, et coche *Enforce HTTPS* quand c'est possible
(jusqu'à 24 h de propagation). GitHub ajoute le fichier `CNAME` à la branche `gh-pages`.

### 2. Supabase
- Authentication > URL Configuration : *Site URL* = `https://1o1cards.cc`, et dans *Redirect URLs* ajoute `https://1o1cards.cc/**`.
- Base de données, dans le SQL Editor, **dans cet ordre** :
  1. `supabase/migrations/001_rename_opennumber_to_o1ocards.sql` (renomme l'ancienne structure en `o1ocards_*`, données conservées) ;
  2. `supabase/generated/schema.prod.sql` ;
  3. `supabase/generated/schema.preprod.sql`.
- Mots de passe admin (un par environnement) :
  `select o1ocards_admin_set_password('...');` et `select pp_o1ocards_admin_set_password('...');` (8 caractères minimum).
  Le mot de passe de production existant est conservé par la migration.

### 3. Fonctions Edge (4)
Déploie chaque dossier de `supabase/functions/` (hors `_templates`) avec **Verify JWT désactivé**
(tableau de bord : Edge Functions > Deploy a new function > Via Editor ; ou `supabase functions deploy`).
Les anciennes `opennumber-checkout` et `opennumber-stripe-webhook` peuvent être supprimées une fois la production migrée.

Secrets (Edge Functions > Secrets) :
- production : `STRIPE_SECRET_KEY`, `SITE_URL` (`https://1o1cards.cc/`), `STRIPE_WEBHOOK_SECRET` ;
- préproduction : `PP_STRIPE_SECRET_KEY` (clé **test**), `PP_SITE_URL` (`https://1o1cards.cc/preprod/`), `PP_STRIPE_WEBHOOK_SECRET`.

### 4. Stripe
Un webhook par environnement (événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`) :
- production : `https://uhsodmpqoporeiebhvwt.supabase.co/functions/v1/o1ocards-stripe-webhook` ;
- préproduction (en **mode test**) : `https://uhsodmpqoporeiebhvwt.supabase.co/functions/v1/pp-o1ocards-stripe-webhook`.
Le secret `whsec_…` de chacun va dans le secret Supabase correspondant.

### 5. Déploiement du site
```bash
export GITHUB_TOKEN=...            # jeton avec « Contents : read and write » sur le dépôt
npm ci
npm run deploy:preprod             # préproduction
npm run deploy:prod                # production (demande --yes : déjà inclus dans le script npm)
```

## Au quotidien

1. Développer sur la branche `preprod`, jouer le SQL de `schema.preprod.sql` (et les nouvelles migrations) sur la préproduction.
2. `npm run deploy:preprod`, tester sur `https://1o1cards.cc/preprod/`.
3. Livrer en production : voir le skill `o1ocards-release` (livraison de la préproduction vers la production), ou à la main :
   exécuter le SQL de production, redéployer les fonctions modifiées, fusionner `preprod` dans `main`, puis `npm run deploy:prod`.

## Tests

`npm test` génère tout puis lance : le front (`tests/front.test.mjs`), les fonctions Edge (`tests/functions.test.mjs`, nécessite Deno)
et le SQL (`tests/run-sql.sh`, nécessite PostgreSQL : il démarre un serveur temporaire, applique les deux schémas dans la même base,
rejoue les scénarios pour chaque environnement et vérifie leur isolation).
