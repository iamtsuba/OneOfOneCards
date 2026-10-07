# 1/1 Cards : environnements, mise en service et livraison

## Vue d'ensemble

| | **Production** | **Préproduction** |
|---|---|---|
| Adresse | `https://1o1cards.cc/` | `https://pp.1o1cards.cc/` |
| Branche Git (code source) | `main` | `preprod` |
| Projet Cloudflare Pages | `o1ocards` | `o1ocards-pp` |
| Commande de build | `npm ci && npm run build:prod` | `npm ci && npm run build:preprod` |
| Dossier de sortie | `dist/prod` | `dist/preprod` |
| Tables et fonctions SQL | `o1ocards_*` | `pp_o1ocards_*` |
| SQL à exécuter | `supabase/generated/schema.prod.sql` | `supabase/generated/schema.preprod.sql` |
| Fonctions Edge | `o1ocards-checkout`, `o1ocards-stripe-webhook` | `pp-o1ocards-checkout`, `pp-o1ocards-stripe-webhook` |
| Secrets Supabase | `STRIPE_SECRET_KEY`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET` | `PP_STRIPE_SECRET_KEY`, `PP_SITE_URL`, `PP_STRIPE_WEBHOOK_SECRET` |
| Stripe | clés **live** (ou test tant que tu ne vends pas) | clés **test** uniquement (une clé `sk_live_` est refusée) |
| Session de connexion (navigateur) | `o1ocards-auth` | `pp-o1ocards-auth` |
| Fichier de réglages du front | `.env.prod` | `.env.preprod` (aussi utilisé par `npm run dev`) |

Les deux environnements utilisent **la même base Supabase** (mêmes comptes joueurs, `auth.users` partagé) mais des tables et des
fonctions séparées : la progression en préproduction n'affecte jamais la production. La préproduction affiche un bandeau jaune
« Préproduction » et n'est pas référencée par les moteurs de recherche (balise `noindex` et en-tête `X-Robots-Tag`).

## Hébergement : Cloudflare Pages

Chaque environnement est un **projet Cloudflare Pages relié à ce dépôt GitHub**. Il n'y a rien à lancer à la main : un `git push` sur
`preprod` déploie la préproduction, un `git push` sur `main` déploie la production (Cloudflare compile avec la commande de la ligne
« Commande de build » ci-dessus). L'ancien hébergement GitHub Pages (branche `gh-pages`) est abandonné.

Le script `scripts/post-build.mjs` termine chaque build : il écrit `version.json` (commit, branche, date : ouvre
`https://pp.1o1cards.cc/version.json` pour savoir quel code est en ligne) et `_headers` (en-têtes de sécurité, cache, `noindex` en
préproduction). Il **refuse** un build de production lancé depuis une autre branche que `main` : sans cela, une prévisualisation de la
branche `preprod` compilée en mode production publierait du code non livré, branché sur les tables de production.

## Modèle SQL : un seul fichier source

Tout le SQL part de `supabase/schema.template.sql`, où `{{P}}` désigne le préfixe. `npm run build:schema` génère
`supabase/generated/schema.prod.sql` et `schema.preprod.sql` (à ne pas modifier à la main). Chaque fichier est **relançable sans risque**.
Quelques valeurs de départ diffèrent selon l'environnement : par exemple la boutique (`shop_enabled`) est activée d'emblée en
préproduction et masquée en production.

Pour une modification de structure qui ne peut pas être rejouée telle quelle (renommer une colonne, déplacer des données),
écris une migration `supabase/migrations/NNN_nom.template.sql` (même principe, `{{P}}`) : elle est générée pour chaque environnement.

## Mise en service (une seule fois)

### 1. Cloudflare : le domaine
Pour utiliser le domaine nu `1o1cards.cc` avec Cloudflare Pages, il doit être une **zone de ton compte Cloudflare** : Cloudflare >
Add a domain > `1o1cards.cc` (offre gratuite), puis, chez le revendeur du domaine, remplace les serveurs de noms par les deux que
Cloudflare indique. Attends que le domaine passe en « Actif » (de quelques minutes à 24 h). Tu pourras alors rattacher `1o1cards.cc`
et `pp.1o1cards.cc` à leurs projets : Cloudflare crée les enregistrements DNS lui-même.

### 2. Cloudflare : le projet de préproduction (à créer en premier)
Workers & Pages > Create > Pages > Connect to Git > dépôt `OneOfOneCards`, puis :

- Project name : `o1ocards-pp`
- Production branch : `preprod`
- Framework preset : aucun ; Build command : `npm ci && npm run build:preprod` ; Build output directory : `dist/preprod`
- (la version de Node est fixée par le fichier `.node-version`, rien à ajouter)

Après le premier déploiement : onglet Custom domains > Set up a domain > `pp.1o1cards.cc`.
Désactive ensuite les **déploiements de prévisualisation des autres branches** (Settings > Builds > Branch control) : sinon
chaque branche de travail publie une copie du site sur une adresse `*.pages.dev`.

### 3. Supabase
- Authentication > URL Configuration : *Site URL* = `https://1o1cards.cc`, et dans *Redirect URLs* ajoute `https://1o1cards.cc/**`
  et `https://pp.1o1cards.cc/**`.
- Base de données, dans le SQL Editor :
  - **préproduction** : `supabase/generated/schema.preprod.sql`, puis `select pp_o1ocards_admin_set_password('...');`
    (8 caractères minimum). Si tu l'avais déjà exécuté avant l'activation par défaut de la boutique, lance aussi
    `update pp_o1ocards_config set value = 1 where key = 'shop_enabled';` pour afficher le bouton d'achat.
  - **production** (à la première livraison, voir plus bas) : dans cet ordre, `supabase/migrations/001_rename_opennumber_to_o1ocards.sql`
    (renomme l'ancienne structure en `o1ocards_*`, données conservées), puis `supabase/generated/schema.prod.sql`.
    Le mot de passe admin de production existant est conservé par la migration.

### 4. Fonctions Edge (4)
Déploie chaque dossier de `supabase/functions/` (hors `_templates`) avec **Verify JWT désactivé**
(tableau de bord : Edge Functions > Deploy a new function > Via Editor ; ou `supabase functions deploy`).
Les anciennes `opennumber-checkout` et `opennumber-stripe-webhook` peuvent être supprimées une fois la production migrée.

Secrets (Edge Functions > Secrets) :
- production : `STRIPE_SECRET_KEY`, `SITE_URL` (`https://1o1cards.cc/`), `STRIPE_WEBHOOK_SECRET` ;
- préproduction : `PP_STRIPE_SECRET_KEY` (clé **test**), `PP_SITE_URL` (`https://pp.1o1cards.cc/`), `PP_STRIPE_WEBHOOK_SECRET`.

### 5. Stripe
Un webhook par environnement (événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`) :
- production : `https://uhsodmpqoporeiebhvwt.supabase.co/functions/v1/o1ocards-stripe-webhook` ;
- préproduction (en **mode test**) : `https://uhsodmpqoporeiebhvwt.supabase.co/functions/v1/pp-o1ocards-stripe-webhook`.
Le secret `whsec_…` de chacun va dans le secret Supabase correspondant.

### 6. Première livraison en production
Le projet Cloudflare de production se crée **au moment de la première livraison**, car `main` ne contient le nouveau code qu'après
la fusion de `preprod` :
1. exécuter la migration `001` puis `schema.prod.sql` (l'ancien site cesse de fonctionner dès la migration : enchaîne vite) ;
2. déployer les fonctions `o1ocards-*` et créer leurs secrets ;
3. fusionner `preprod` dans `main` (skill `o1ocards-release`, commande `apply`) ;
4. créer le projet Cloudflare `o1ocards` (même procédure que la préproduction) : Production branch `main`,
   Build command `npm ci && npm run build:prod`, Build output directory `dist/prod`, domaine `1o1cards.cc` (et `www.1o1cards.cc`
   si tu veux, avec une redirection vers le domaine nu) ; désactiver les prévisualisations ;
5. une fois `https://1o1cards.cc/` validé : retirer GitHub Pages (dépôt > Settings > Pages > Unpublish) et supprimer la branche `gh-pages`.

## Au quotidien

1. Développer sur la branche `preprod`, jouer le SQL de `schema.preprod.sql` (et les nouvelles migrations) sur la préproduction.
2. `git push` sur `preprod` : Cloudflare publie `https://pp.1o1cards.cc/` ; tester.
3. Livrer en production : skill `o1ocards-release`, ou à la main : exécuter le SQL de production, redéployer les fonctions
   modifiées, fusionner `preprod` dans `main` et pousser (Cloudflare publie `https://1o1cards.cc/`).
4. Retour arrière du site : Cloudflare > projet `o1ocards` > Deployments > choisir un déploiement précédent > Rollback to this deployment
   (immédiat), ou le skill (`rollback`). La base de données n'est jamais annulée automatiquement.

## Tests

`npm test` génère tout puis lance : le build (`tests/build.test.mjs`), le front (`tests/front.test.mjs`), les fonctions Edge
(`tests/functions.test.mjs`, nécessite Deno) et le SQL (`tests/run-sql.sh`, nécessite PostgreSQL : il démarre un serveur temporaire,
applique les deux schémas dans la même base, rejoue les scénarios pour chaque environnement et vérifie leur isolation).
