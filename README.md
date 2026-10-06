# OneOfOne Pack

Ouverture de boosters de cartes numérotées. Les boosters sont regroupés en **catégories** (« Années 80 », « Années 90 »…),
chaque catégorie contient des **types** de cartes (Magnétoscope VHS, Fax…), et chaque type a sa propre numérotation de 1/1 à N/N
(500/500 par défaut, soit 125 250 cartes par type). Chaque carte n'existe qu'en **un seul exemplaire** : une fois tirée, elle
appartient à un seul joueur.

- Front : React + Vite, hébergé sur GitHub Pages
- Base de données : Supabase (toutes les tables commencent par `opennumber_`)
- Tirages, ventes et enchères sont gérés côté serveur (fonctions Postgres), jamais dans le navigateur

## Mise en route

1. Supabase > SQL Editor : coller et exécuter `supabase/schema.sql` (relançable sans risque, migre l'ancienne version).
2. Supabase > Authentication > URL Configuration : mettre l'URL du site dans *Site URL*.
3. `npm install`, puis `npm run dev` pour tester en local.
4. `npm run deploy` construit l'app et publie `dist/` sur la branche `gh-pages`.

## Règles

- Une seule catégorie est ouvrable à la fois. Quand toutes ses cartes sont tirées, elle est terminée et la suivante s'ouvre
  automatiquement (ou à la main depuis la console admin). La progression est définitive : la revente à la banque est refusée
  dans une catégorie terminée (la vente sur le marché reste possible).
- 5 cartes par booster, 10 boosters offerts puis +10 toutes les 10 minutes (plafond 10).
- Raretés (priorité dans cet ordre) : **Unique** (1/1), **Alpha** (toutes les 1/m), **Omega** (toutes les m/m),
  puis selon la taille de série : Ultra Rare (≤ 35), Super Rare (≤ 100), Rare (≤ 250), Commune (au-delà).
- Un tirage ne donne que des cartes encore disponibles. Le poids d'une carte = taille de série ^ exposant (exposant 0 : toutes les cartes disponibles ont la même chance).
- L'encart « Chances de tirage » (écran Boosters) affiche, pour chaque rareté, sa part en % sur la totalité des cartes encore disponibles, calculée par
  le serveur sur les cartes encore disponibles (`opennumber_draw_odds`).
- **Booster doré** : 0,000001 % de chance par booster (`golden_booster_chance`). Il contient 1 Alpha, 1 Omega, 1 Ultra Rare,
  1 Super Rare et 1 Rare (contenu modifiable dans `opennumber_golden_contents`). Pour le tester :
  `update opennumber_config set value = 1 where key = 'golden_booster_chance';` puis remettre `0.00000001`.
- **Série complétée = pack doré.** Le premier joueur qui possède toutes les cartes d'un type dans une série (par exemple les 104
  cartes « Caméscope » de la série de 104) débloque un pack doré (1 Alpha, 1 Omega, 1 Ultra Rare, 1 Super Rare, 1 Rare, tirés dans la
  catégorie en cours). Une seule récompense par type et par série pour toute la communauté (un échange de cartes entre comptes ne la
  redonne pas). Détectée à chaque nouvelle carte : booster, achat sur le marché, enchère gagnée, pack doré. Réglage
  `series_reward_min_size` (2 par défaut : les séries d'une seule carte ne comptent pas ; 0 = désactivé). Les packs gagnés s'ouvrent
  à part (bouton doré sur l'écran Boosters) et ne consomment pas le stock de boosters.
- Pièces : revente directe à la banque (1 pièce, la carte retourne dans les boosters), achat direct (prix libre)
  ou enchère de 60 minutes à partir de 1 pièce.
- Enchères : la mise est bloquée tant qu'on est en tête et rendue si on est dépassé. Une mise dans la dernière
  minute remet le compteur à 1 minute. Le gagnant reçoit la carte, le vendeur les pièces.
- Les enchères terminées sont clôturées automatiquement à la prochaine lecture (pas de tâche planifiée).

## Réglages (table `opennumber_config`)

| clé | rôle | défaut |
|---|---|---|
| `max_series` | taille maximale de série | 1413 |
| `cards_per_booster` | cartes par booster | 5 |
| `start_boosters` / `start_coins` | boosters et pièces offerts à l'inscription | 10 / 0 |
| `regen_minutes` / `regen_amount` | recharge : +N boosters toutes les X minutes | 10 / 10 |
| `max_boosters` | plafond de stock | 10 |
| `rarity_exponent` | 0 = chaque carte disponible a la même chance (recommandé), 1 = les petites séries sont très difficiles à obtenir | 0 |
| `direct_sell_price` | pièces reçues pour une revente directe | 1 |
| `auction_minutes` / `auction_start_price` | durée et prix de départ d'une enchère | 60 / 1 |
| `auction_min_increment` | surenchère minimale | 1 |
| `auction_extend_seconds` | fenêtre de prolongation en fin d'enchère | 60 |
| `series_reward_min_size` | taille de série minimale pour gagner un pack doré en la complétant (0 = désactivé) | 2 |
| `golden_booster_chance` | probabilité d'un booster doré (0.00000001 = 0,000001 %) | 0.00000001 |

Les raretés (noms, couleurs, seuils de séries) sont dans `opennumber_rarities`.

```sql
update opennumber_config set value = 0.5 where key = 'rarity_exponent';
update opennumber_config set value = 20 where key = 'start_coins';
```

## Paiement Stripe (boosters supplémentaires)

Un joueur peut acheter un pack de boosters (10 par défaut). Les boosters achetés sont **hors plafond** de recharge
(colonne `bonus_boosters`) et sont utilisés **après** le stock gratuit.

Fonctionnement : l'application appelle la fonction `opennumber-checkout`, qui crée une page de paiement Stripe.
Une fois le paiement confirmé, Stripe appelle `opennumber-stripe-webhook`, qui vérifie la signature puis crédite les boosters
(`opennumber_credit_purchase`, idempotente : un même paiement ne crédite qu'une fois). Le navigateur ne crédite jamais rien.

Managed Payments : si cette offre Stripe est activée sur le compte (Stripe devient le vendeur officiel et gère la TVA),
chaque produit doit avoir un code fiscal. La fonction envoie `txcd_10201000` (jeu vidéo numérique) ; modifiable avec le secret
`STRIPE_TAX_CODE`. Pour ne pas utiliser Managed Payments, ajouter le secret `STRIPE_MANAGED_PAYMENTS` = `false`.

Réglages dans `opennumber_config` : `shop_enabled` (0 = bouton masqué), `stripe_pack_boosters`, `stripe_pack_price_cents`.

### Mise en place

1. Relancer `supabase/schema.sql`.
2. Stripe (mode test) : Développeurs > Clés API > copier la clé secrète `sk_test_...`.
3. Supabase > Edge Functions > Secrets : ajouter `STRIPE_SECRET_KEY` et `SITE_URL` (ex. `https://iamtsuba.github.io/OneOfOnePack/`).
4. Déployer les deux fonctions de `supabase/functions/` avec **Verify JWT désactivé** :
   - en ligne de commande : `supabase link --project-ref <ref>` puis `supabase functions deploy opennumber-checkout opennumber-stripe-webhook`
   - ou depuis le tableau de bord : Edge Functions > Deploy a new function > Via Editor, en collant chaque `index.ts`.
5. Stripe > Développeurs > Webhooks > Ajouter un endpoint :
   `https://<ref>.supabase.co/functions/v1/opennumber-stripe-webhook`, événements `checkout.session.completed`
   et `checkout.session.async_payment_succeeded`. Copier le secret de signature `whsec_...` dans le secret Supabase `STRIPE_WEBHOOK_SECRET`.
6. Afficher la boutique : `update opennumber_config set value = 1 where key = 'shop_enabled';`
7. Tester avec la carte `4242 4242 4242 4242` (date future, CVC au choix), puis passer en production :
   remplacer les deux secrets par la clé `sk_live_...` et le secret du webhook du mode production.

## Conditions de vente et consentement

Avant tout paiement, le joueur voit une fenêtre « Avant de payer » avec deux cases à cocher (acceptation des conditions de vente,
demande d'exécution immédiate avec renonciation au droit de rétractation, contenu numérique). Le bouton de paiement reste inactif
tant que les deux ne sont pas cochées. La fonction `opennumber-checkout` refuse ensuite toute demande sans consentement, puis
enregistre la preuve dans `opennumber_consents` (compte, date, version des conditions, textes exacts acceptés, IP, navigateur,
session Stripe). Les conditions et mentions légales sont accessibles depuis l'écran de connexion, le profil et la boutique.

À renseigner avant de vendre pour de vrai (table `opennumber_legal`) :

```sql
insert into opennumber_legal (key, value) values
  ('seller_name',    'Prénom Nom ou raison sociale'),
  ('seller_status',  'Entrepreneur individuel'),
  ('seller_address', '12 rue Exemple, 69000 Lyon'),
  ('seller_email',   'contact@exemple.fr'),
  ('seller_siret',   '123 456 789 00012'),
  ('seller_vat',     'TVA non applicable, art. 293 B du CGI'),   -- uniquement si c'est ton cas
  ('mediator_name',  'Nom du médiateur de la consommation'),
  ('mediator_url',   'https://exemple-mediateur.fr')
on conflict (key) do update set value = excluded.value;
```

Garde-fou : avec une clé Stripe de production (`sk_live_...`), la fonction refuse tout paiement tant que `seller_name`,
`seller_address` et `seller_email` sont vides. Les champs vides s'affichent en jaune « [à compléter] » dans les conditions.

Si le texte des conditions (`src/components/Legal.jsx`) change, incrémenter `cgv_version` dans `opennumber_config` :
les joueurs devront alors ré-accepter avant de payer.


## Catégories, types et console admin

Tout se règle depuis la **console admin** (Profil > Console admin) : catégories (nom, couleurs, position, nombre de séries,
activée, terminer à la main), types de cartes (nom, position, image), réglages du jeu et de la boutique, raretés, informations légales
et mot de passe. Les images d'un type peuvent être un emoji, une adresse `https://` ou une image téléversée (réduite à 256 px et
enregistrée dans la base).

Mot de passe admin : il n'est jamais écrit dans le code ni dans ce dépôt (public). Il est haché (bcrypt) dans la table
`opennumber_secrets`. À définir une seule fois depuis le SQL Editor de Supabase :

```sql
select opennumber_admin_set_password('ton mot de passe');   -- 8 caractères minimum
```

- Le premier compte qui saisit le bon mot de passe devient le seul compte admin (réinitialisation :
  `delete from opennumber_secrets where key = 'admin_user_id';`).
- Après 5 erreurs, l'accès est verrouillé 15 minutes (30 erreurs au total en 15 minutes : verrouillage général).
- Le nombre de séries d'une catégorie ne peut plus changer une fois des cartes tirées ; un type ou une catégorie ne se supprime
  que si aucune carte n'a été tirée.

Au premier lancement de cette version du schéma, les cartes, le marché et les pièces de l'ancienne structure sont remis à zéro
(comptes, boosters et achats conservés).


## Modèle de rareté v2

Chances au départ d'une catégorie (exposant 0, 8 types de 500 séries, pour 1 000 boosters de 5 cartes) : environ 1 040 Rares,
170 Super Rares, 22 Ultra Rares, 20 Alpha, 20 Omega, et 0,04 Unique (une carte 1/1 sur 25 000 boosters environ).
Au premier lancement de `schema.sql` sur une base existante, l'exposant passe de 1 à 0 et le seuil Ultra de 10 à 35. Cette
migration ne s'applique qu'une fois (marqueur `rarity_model_version`) et n'écrase pas un réglage que tu as personnalisé.
