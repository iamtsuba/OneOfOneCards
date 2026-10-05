# OneOfOne Pack

Ouverture de boosters de cartes numérotées de 1/1 à 1413/1413 (998 991 cartes).
Chaque booster contient 5 cartes. Plus la série est petite, plus la carte est rare.

- Front : React + Vite, hébergé sur GitHub Pages
- Base de données : Supabase (toutes les tables commencent par `opennumber_`)
- Le tirage est fait côté serveur (fonction Postgres), jamais dans le navigateur

## Mise en route

1. Supabase > SQL Editor : coller et exécuter `supabase/schema.sql` (relançable sans risque).
2. Supabase > Authentication > URL Configuration : mettre l'URL du site (GitHub Pages) dans *Site URL*.
3. `npm install`, puis `npm run dev` pour tester en local.
4. `npm run deploy` construit l'app et publie `dist/` sur la branche `gh-pages`.

## Réglages (table `opennumber_config`)

| clé | rôle | défaut |
|---|---|---|
| `max_series` | taille maximale de série | 1413 |
| `cards_per_booster` | cartes par booster | 5 |
| `start_boosters` | boosters offerts à l'inscription | 10 |
| `regen_minutes` / `regen_amount` | recharge : +N boosters toutes les X minutes | 10 / 10 |
| `max_boosters` | plafond de stock | 50 |
| `rarity_exponent` | poids d'une carte = taille_de_série ^ exposant (0 = uniforme) | 1 |

Les raretés (noms, couleurs, seuils de séries) sont dans `opennumber_rarities`.

```sql
update opennumber_config set value = 0.5 where key = 'rarity_exponent';
update opennumber_rarities set max_series = 300 where id = 'rare';
```

## Raretés

Priorité : Unique (1/1), Alpha (1/10, 1/100, 1/1000), Omega (10/10, 100/100, 1000/1000),
puis selon la taille de série : Ultra Rare (≤ 10), Super Rare (≤ 100), Rare (≤ 250), Commune (au-delà).
