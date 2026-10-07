# 1/1 Cards : règles du jeu et réglages

Les noms de tables ci-dessous sont donnés sans préfixe : en production ils commencent par `o1ocards_`, en préproduction par `pp_o1ocards_`.

## Règles

- Une seule catégorie est ouvrable à la fois. Quand toutes ses cartes sont tirées, elle est terminée et la suivante s'ouvre
  automatiquement (ou à la main depuis la console admin). La progression est définitive : la revente à la banque est refusée
  dans une catégorie terminée (la vente sur le marché reste possible).
- 5 cartes par booster, 10 boosters offerts puis +10 toutes les 10 minutes (plafond 10).
- Raretés (priorité dans cet ordre) : **Unique** (1/1), **Alpha** (toutes les 1/m), **Omega** (toutes les m/m),
  puis selon la taille de série : Ultra Rare (≤ 35), Super Rare (≤ 100), Rare (≤ 250), Commune (au-delà).
- Un tirage ne donne que des cartes encore disponibles. Le poids d'une carte = taille de série ^ exposant (exposant 0 : toutes les cartes disponibles ont la même chance).
- L'encart « Chances de tirage » (écran Boosters) affiche, pour chaque rareté, sa part en % sur la totalité des cartes encore disponibles, calculée par
  le serveur sur les cartes encore disponibles (`o1ocards_draw_odds`).
- **Booster doré** : 0,000001 % de chance par booster (`golden_booster_chance`). Il contient 1 Alpha, 1 Omega, 1 Ultra Rare,
  1 Super Rare et 1 Rare (contenu modifiable dans `o1ocards_golden_contents`). Pour le tester :
  `update o1ocards_config set value = 1 where key = 'golden_booster_chance';` (en préproduction : `pp_o1ocards_config`) puis remettre `0.00000001`.
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

## Réglages (table `<préfixe>config`)

| clé | rôle | défaut |
|---|---|---|
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

Les raretés (noms, couleurs, seuils de séries) sont dans `o1ocards_rarities`.

```sql
update o1ocards_config set value = 0.5 where key = 'rarity_exponent';
update o1ocards_config set value = 20 where key = 'start_coins';
```

## Paiement Stripe (boosters supplémentaires)

Un joueur peut acheter un pack de boosters (10 par défaut). Les boosters achetés sont **hors plafond** de recharge
(colonne `bonus_boosters`) et sont utilisés **après** le stock gratuit.

Fonctionnement : l'application appelle la fonction de paiement (`o1ocards-checkout` en production, `pp-o1ocards-checkout` en préproduction),
qui crée une page de paiement Stripe. Une fois le paiement confirmé, Stripe appelle le webhook de l'environnement
(`o1ocards-stripe-webhook` / `pp-o1ocards-stripe-webhook`), qui vérifie la signature puis crédite les boosters
(`<préfixe>credit_purchase`, idempotente : un même paiement ne crédite qu'une fois). Le navigateur ne crédite jamais rien.

Managed Payments : si cette offre Stripe est activée sur le compte (Stripe devient le vendeur officiel et gère la TVA),
chaque produit doit avoir un code fiscal. La fonction envoie `txcd_10201000` (jeu vidéo numérique) ; modifiable avec le secret
`STRIPE_TAX_CODE` (`PP_STRIPE_TAX_CODE` en préproduction, qui reprend sinon la valeur de la production). Pour ne pas utiliser
Managed Payments, ajouter le secret `STRIPE_MANAGED_PAYMENTS` = `false`.

Réglages dans `<préfixe>config` : `shop_enabled` (0 = bouton masqué), `stripe_pack_boosters`, `stripe_pack_price_cents`.

La préproduction ne peut pas encaisser de vrai argent : une clé Stripe `sk_live_` y est refusée, et les secrets de la production
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) ne lui servent jamais de repli.

Mise en place : voir [Environnements, mise en service et livraison](environnements.md) (secrets, fonctions Edge et webhooks de chaque environnement).
Pour tester un paiement : activer la boutique (`update <préfixe>config set value = 1 where key = 'shop_enabled';`) puis payer avec
la carte de test `4242 4242 4242 4242` (date future, CVC au choix), en préproduction.

## Conditions de vente et consentement

Avant tout paiement, le joueur voit une fenêtre « Avant de payer » avec deux cases à cocher (acceptation des conditions de vente,
demande d'exécution immédiate avec renonciation au droit de rétractation, contenu numérique). Le bouton de paiement reste inactif
tant que les deux ne sont pas cochées. La fonction de paiement refuse ensuite toute demande sans consentement, puis
enregistre la preuve dans `o1ocards_consents` (compte, date, version des conditions, textes exacts acceptés, IP, navigateur,
session Stripe). Les conditions et mentions légales sont accessibles depuis l'écran de connexion, le profil et la boutique.

À renseigner avant de vendre pour de vrai (table `o1ocards_legal`) :

```sql
insert into o1ocards_legal (key, value) values
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

Si le texte des conditions (`src/components/Legal.jsx`) change, incrémenter `cgv_version` dans `o1ocards_config` :
les joueurs devront alors ré-accepter avant de payer.

## Console admin, boutique et conditions de vente

Tout se règle depuis la **console admin** (Profil > Console admin) : catégories (nom, couleurs, position, nombre de séries,
activée, terminer à la main), types de cartes (nom, position, image), réglages du jeu et de la boutique, raretés, informations légales
et mot de passe. Les images d'un type peuvent être un emoji, une adresse `https://` ou une image téléversée (réduite à 256 px et
enregistrée dans la base).

Mot de passe admin (un par environnement) : il n'est jamais écrit dans le code ni dans ce dépôt (public). Il est haché (bcrypt) dans la table
`<préfixe>secrets`. À définir une seule fois depuis le SQL Editor de Supabase :

```sql
select o1ocards_admin_set_password('ton mot de passe');   -- 8 caractères minimum
```

- Le premier compte qui saisit le bon mot de passe devient le seul compte admin (réinitialisation :
  `delete from o1ocards_secrets where key = 'admin_user_id';`).
- Après 5 erreurs, l'accès est verrouillé 15 minutes (30 erreurs au total en 15 minutes : verrouillage général).
- Le nombre de séries d'une catégorie ne peut plus changer une fois des cartes tirées ; un type ou une catégorie ne se supprime
  que si aucune carte n'a été tirée.



## Modèle de rareté v2

Chances au départ d'une catégorie (exposant 0, 8 types de 500 séries, pour 1 000 boosters de 5 cartes) : environ 1 040 Rares,
170 Super Rares, 22 Ultra Rares, 20 Alpha, 20 Omega, et 0,04 Unique (une carte 1/1 sur 25 000 boosters environ).
Au premier lancement de `schema.sql` sur une base existante, l'exposant passe de 1 à 0 et le seuil Ultra de 10 à 35. Cette
migration ne s'applique qu'une fois (marqueur `rarity_model_version`) et n'écrase pas un réglage que tu as personnalisé.
