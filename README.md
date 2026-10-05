# OneOfOne Pack

Ouverture de boosters de cartes numérotées de 1/1 à 1413/1413 (998 991 cartes).
Chaque carte n'existe qu'en **un seul exemplaire** : une fois tirée, elle appartient à un seul joueur.

- Front : React + Vite, hébergé sur GitHub Pages
- Base de données : Supabase (toutes les tables commencent par `opennumber_`)
- Tirages, ventes et enchères sont gérés côté serveur (fonctions Postgres), jamais dans le navigateur

## Mise en route

1. Supabase > SQL Editor : coller et exécuter `supabase/schema.sql` (relançable sans risque, migre l'ancienne version).
2. Supabase > Authentication > URL Configuration : mettre l'URL du site dans *Site URL*.
3. `npm install`, puis `npm run dev` pour tester en local.
4. `npm run deploy` construit l'app et publie `dist/` sur la branche `gh-pages`.

## Règles

- 5 cartes par booster, 10 boosters offerts puis +10 toutes les 10 minutes (plafond 10).
- Raretés (priorité dans cet ordre) : **Unique** (1/1), **Alpha** (toutes les 1/m), **Omega** (toutes les m/m),
  puis selon la taille de série : Ultra Rare (≤ 10), Super Rare (≤ 100), Rare (≤ 250), Commune (au-delà).
- Un tirage ne donne que des cartes encore disponibles. Le poids d'une série = cartes restantes x (taille ^ exposant).
- **Booster doré** : 0,000001 % de chance par booster (`golden_booster_chance`). Il contient 1 Alpha, 1 Omega, 1 Ultra Rare,
  1 Super Rare et 1 Rare (contenu modifiable dans `opennumber_golden_contents`). Pour le tester :
  `update opennumber_config set value = 1 where key = 'golden_booster_chance';` puis remettre `0.00000001`.
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
| `rarity_exponent` | 1 = rareté proportionnelle, 0 = chaque carte disponible a la même chance | 1 |
| `direct_sell_price` | pièces reçues pour une revente directe | 1 |
| `auction_minutes` / `auction_start_price` | durée et prix de départ d'une enchère | 60 / 1 |
| `auction_min_increment` | surenchère minimale | 1 |
| `auction_extend_seconds` | fenêtre de prolongation en fin d'enchère | 60 |
| `golden_booster_chance` | probabilité d'un booster doré (0.00000001 = 0,000001 %) | 0.00000001 |

Les raretés (noms, couleurs, seuils de séries) sont dans `opennumber_rarities`.

```sql
update opennumber_config set value = 0.5 where key = 'rarity_exponent';
update opennumber_config set value = 20 where key = 'start_coins';
```
