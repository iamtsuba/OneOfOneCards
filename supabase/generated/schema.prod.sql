-- GÉNÉRÉ par scripts/build-schema.mjs à partir de supabase/schema.template.sql : ne pas modifier à la main.
-- Environnement : prod | préfixe des tables et des fonctions : o1ocards_

-- =====================================================================
-- 1/1 Cards : schéma Supabase
-- Toutes les tables et fonctions de cet environnement commencent par o1ocards_
-- À coller en entier dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Structure : catégories de boosters (Années 80, Années 90...) > types de cartes > séries numérotées.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Configuration du jeu (modifiable à tout moment) ----------
create table if not exists public.o1ocards_config (
  key         text primary key,
  value       numeric not null,
  description text
);

insert into public.o1ocards_config (key, value, description) values
  ('cards_per_booster',      5,    'Nombre de cartes par booster'),
  ('booster_common_slots',   3,    'Composition d''un booster : nombre de premières cartes tirées avec les poids « cartes 1 à 3 » (en principe les Communes)'),
  ('booster_uncommon_slots', 1,    'Composition d''un booster : nombre de cartes de la 2e catégorie (4e carte, juste après les premières). Les cartes suivantes sont tirées selon les poids de la 5e carte. Les poids de chaque rareté se règlent dans l''onglet Raretés'),
  ('gold_reward_weight_numbered', 1, 'Booster Gold (carte complétée dans l''album) : poids d''une carte à numéro visible du type complété pour la 5e carte'),
  ('gold_reward_weight_artrare',   1, 'Booster Gold : poids d''une carte Art Rare pour la 5e carte'),
  ('gold_reward_weight_alpha',     1, 'Booster Gold : poids d''une carte Alpha pour la 5e carte'),
  ('gold_reward_weight_omega',     1, 'Booster Gold : poids d''une carte Omega pour la 5e carte'),
  ('gold_reward_weight_unique',    1, 'Booster Gold : poids d''une carte Unique (1/1) pour la 5e carte'),
  ('start_boosters',         10,   'Boosters offerts à la création du profil'),
  ('start_coins',            0,    'Pièces offertes à la création du profil'),
  ('regen_minutes',          10,   'Délai entre deux recharges (minutes)'),
  ('regen_amount',           10,   'Boosters gagnés à chaque recharge'),
  ('max_boosters',           10,   'Plafond de boosters en stock'),
  ('rarity_exponent',        0,    'Poids d''une carte = taille_de_série ^ exposant. 0 = chaque carte disponible a la même chance (recommandé), 1 = les petites séries sont très difficiles à obtenir'),
  ('direct_sell_price',      1,    'Pièces reçues pour une revente directe (la carte est retirée du jeu pour de bon)'),
  ('auction_minutes',        60,   'Durée d''une enchère (minutes)'),
  ('auction_start_price',    1,    'Prix de départ d''une enchère (pièces)'),
  ('auction_min_increment',  1,    'Surenchère minimale (pièces)'),
  ('auction_extend_seconds', 60,   'Si une mise arrive dans les X dernières secondes, le compteur repart à X secondes'),
  ('golden_booster_chance',  0.00000001, 'Chance qu''un booster soit doré (0.00000001 = 0,000001 %). Contenu dans o1ocards_golden_contents'),
  ('golden_unique_chance',   0.005, 'Chance qu''un booster doré contienne EN PLUS une carte Unique (1/1) (0.005 = 0,5 %). S''ajoute au contenu garanti de o1ocards_golden_contents, indépendamment de lui'),
  ('series_reward_min_size', 2,    'Une série complétée (toutes ses cartes d''un type) donne un pack doré au premier joueur qui la complète. Taille de série minimale pour être récompensée (0 = désactivé)'),
  ('shop_enabled',           0,    'Boutique Stripe : 1 = visible dans l''application, 0 = masquée (à passer à 1 une fois Stripe configuré). Activée par défaut en préproduction pour pouvoir tester les achats'),
  ('stripe_pack_boosters',   10,   'Boosters bonus ajoutés par achat'),
  ('stripe_pack_price_cents', 99,  'Prix d''un pack en centimes d''euro (99 = 0,99 EUR)'),
  ('cgv_version',            3,    'Version des conditions générales de vente. À incrémenter à chaque modification du texte : les joueurs doivent alors ré-accepter avant de payer')
on conflict (key) do nothing;
-- Libellé corrigé : la revente directe retire la carte du jeu (elle ne retourne plus dans les boosters). Sans effet une fois corrigé.
update public.o1ocards_config set description = 'Pièces reçues pour une revente directe (la carte est retirée du jeu pour de bon)'
where key = 'direct_sell_price' and description like '%retourne dans les boosters%';
-- Le nombre de séries se règle maintenant par catégorie (console admin)
delete from public.o1ocards_config where key = 'max_series';

-- ---------- Raretés (noms, couleurs, seuils modifiables) ----------
-- kind : unique  = la carte 1/1
--        alpha   = toutes les cartes numérotées 1/ (1/2, 1/3 ... 1/1413)
--        omega   = toutes les dernières cartes d'une série (2/2, 3/3 ... 1413/1413)
--        range   = les autres cartes, selon la taille de série (max_series = taille maximale incluse, null = toutes les autres)
-- sort_order : 1 = la plus rare
create table if not exists public.o1ocards_rarities (
  id         text primary key,
  name       text not null,
  kind       text not null check (kind in ('unique', 'alpha', 'omega', 'range')),
  max_series int,
  sort_order int not null,
  color      text not null,
  color2     text not null,
  text_color text not null
);

insert into public.o1ocards_rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('unique', 'Unique',     'unique', null, 1, '#8b5cf6', '#4c1d95', '#ffffff'),
  ('alpha',  'Alpha',      'alpha',  null, 2, '#f2c94c', '#b7791f', '#3b2a05'),
  ('omega',  'Omega',      'omega',  null, 3, '#e5e9f0', '#9aa5b8', '#1f2937'),
  ('ultra',  'Ultra Rare', 'range',  35,   4, '#f43f5e', '#9f1239', '#ffffff'),
  ('super',  'Super Rare', 'range',  100,  5, '#3b82f6', '#1e3a8a', '#ffffff'),
  ('rare',   'Rare',       'range',  250,  6, '#10b981', '#065f46', '#ffffff'),
  ('common', 'Commune',    'range',  null, 7, '#f3efe6', '#cfc8b8', '#3a3630')
on conflict (id) do nothing;

-- Modèle de rareté v2 (appliqué une seule fois aux bases existantes, sans écraser un réglage personnalisé) :
-- exposant 0 (chaque carte disponible a la même chance) et Ultra Rare = séries jusqu'à 35 cartes.
do $$
begin
  if coalesce((select value from public.o1ocards_config where key = 'rarity_model_version'), 0) < 2 then
    update public.o1ocards_config set value = 0,
      description = 'Poids d''une carte = taille_de_série ^ exposant. 0 = chaque carte disponible a la même chance (recommandé), 1 = les petites séries sont très difficiles à obtenir'
    where key = 'rarity_exponent' and value = 1;
    update public.o1ocards_rarities set max_series = 35 where id = 'ultra' and kind = 'range' and max_series = 10;
    insert into public.o1ocards_config (key, value, description)
    values ('rarity_model_version', 2, 'Version du modèle de rareté (ne pas modifier : marqueur de migration)')
    on conflict (key) do update set value = 2;
  end if;
end $$;

-- Contenu d'un booster doré : une ligne par rareté, avec le nombre de cartes tirées dans cette rareté
create table if not exists public.o1ocards_golden_contents (
  rarity_id text primary key references public.o1ocards_rarities (id) on delete cascade,
  quantity  int not null default 1 check (quantity >= 1)
);
insert into public.o1ocards_golden_contents (rarity_id, quantity) values
  ('alpha', 1), ('omega', 1), ('ultra', 1), ('super', 1), ('rare', 1)
on conflict (rarity_id) do nothing;

-- ---------- Profils ----------
create table if not exists public.o1ocards_profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text not null,
  boosters            int  not null default 0,
  boosters_updated_at timestamptz not null default now(),
  boosters_opened     int  not null default 0,
  created_at          timestamptz not null default now()
);
alter table public.o1ocards_profiles add column if not exists coins bigint not null default 0;
-- Boosters achetés : hors plafond de recharge, consommés après le stock gratuit
alter table public.o1ocards_profiles add column if not exists bonus_boosters int not null default 0;
-- Packs dorés gagnés en complétant une série : s'ouvrent à part, sans toucher au stock de boosters
alter table public.o1ocards_profiles add column if not exists golden_packs int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'o1ocards_profiles_coins_check') then
    alter table public.o1ocards_profiles add constraint o1ocards_profiles_coins_check check (coins >= 0);
  end if;
end $$;

-- ---------- Catalogue : catégories de boosters et types de cartes ----------
-- Une seule catégorie est ouvrable à la fois : la première (par position) qui est activée et pas terminée.
-- Quand toutes ses cartes sont tirées, elle est marquée « closed » et la suivante prend le relais.
create table if not exists public.o1ocards_categories (
  id           int generated always as identity primary key,
  name         text not null,
  position     int  not null default 1,
  series_count int  not null default 500 check (series_count between 1 and 5000),  -- séries de 1/1 à N/N pour chaque type
  color        text not null,   -- couleur principale (fond des cartes et du booster)
  color2       text not null,   -- couleur plus soutenue
  text_color   text not null,
  image        text not null default '',   -- image au centre du booster (emoji, adresse https ou image intégrée) ; vide = « 1/1 »
  enabled      boolean not null default true,
  closed       boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.o1ocards_categories add column if not exists image text not null default '';

-- Un type de carte : chaque type a sa propre numérotation de 1/1 à N/N.
-- image : un emoji, une adresse https:// ou une image intégrée (data:image/...)
create table if not exists public.o1ocards_types (
  id          int generated always as identity primary key,
  category_id int  not null references public.o1ocards_categories (id) on delete cascade,
  name        text not null,
  image       text not null default '',
  position    int  not null default 1
);
create index if not exists o1ocards_types_category_idx on public.o1ocards_types (category_id, position);

-- Nombre de séries propre à un type (null = celui de sa catégorie) et type « secret » : caché aux joueurs tant qu'ils
-- n'en possèdent aucune carte, numéroté au-delà de la checklist de la catégorie (ex. 51/50).
alter table public.o1ocards_types add column if not exists series_count int check (series_count is null or series_count between 1 and 5000);
alter table public.o1ocards_types add column if not exists secret boolean not null default false;

-- Catalogue de départ (seulement si aucune catégorie n'existe) : modifiable ensuite dans la console admin
do $$
declare c int;
begin
  if not exists (select 1 from public.o1ocards_categories) then
    insert into public.o1ocards_categories (name, position, series_count, color, color2, text_color)
    values ('Années 80', 1, 500, '#ffc88a', '#f29a45', '#3d1f00') returning id into c;
    insert into public.o1ocards_types (category_id, name, image, position) values
      (c, 'Magnétoscope VHS', '📼', 1), (c, 'Baladeur cassette', '🎧', 2), (c, 'Téléviseur cathodique', '📺', 3),
      (c, 'Console de jeux', '🎮', 4), (c, 'Caméscope', '📹', 5), (c, 'Téléphone à cadran', '☎️', 6),
      (c, 'Fax', '📠', 7), (c, 'Disquette', '💾', 8);

    insert into public.o1ocards_categories (name, position, series_count, color, color2, text_color)
    values ('Années 90', 2, 500, '#a8d8ff', '#5fb0f0', '#05304f') returning id into c;
    insert into public.o1ocards_types (category_id, name, image, position) values
      (c, 'Console de jeux 32 bits', '🎮', 1), (c, 'Console portable', '🕹️', 2), (c, 'Animal électronique de poche', '🐣', 3),
      (c, 'TV cathodique grand écran', '📺', 4), (c, 'Discman / lecteur CD portable', '💿', 5), (c, 'Téléphone portable à antenne', '📱', 6),
      (c, 'Appareil photo jetable', '📷', 7), (c, 'Lecteur DVD', '🎥', 8);
  end if;
end $$;

-- Raretés d'un type (logique « Topps »). CHAQUE rareté a ses propres séries, de 1/1 à max_series/max_series : Ultra Rare avec
-- 50 séries = cartes 1/1 à 50/50 ; Super Rare avec 100 séries = 1/1 à 100/100, etc. Une même série existe donc dans plusieurs
-- raretés (des cartes différentes). numbered_series = nombre de séries, en partant de la 1re, dont le numéro n/m est visible sur
-- la carte (les autres sont numérotées en interne mais le numéro est masqué ; 0 = rareté non numérotée). Un type sans ligne ici
-- utilise les réglages par défaut de la table rarities (une série de 1 à max_series par rareté, numéros toujours visibles).
create table if not exists public.o1ocards_type_rarities (
  type_id         int  not null references public.o1ocards_types (id) on delete cascade,
  rarity_id       text not null references public.o1ocards_rarities (id) on delete cascade,
  max_series      int  not null check (max_series between 1 and 5000),
  numbered_series int  not null default 0 check (numbered_series >= 0),
  card_style      text not null default 'simple' check (card_style in ('simple', 'fullart')),   -- simple : image dans un cadre ; fullart : image sur toute la carte
  primary key (type_id, rarity_id)
);
-- Bases créées avant : le style devient « simple » (le dessin actuel de la carte) pour toutes les raretés
alter table public.o1ocards_type_rarities add column if not exists card_style text not null default 'simple' check (card_style in ('simple', 'fullart'));

-- Migration : la rareté ne dépend plus de la catégorie. Sur une base qui avait encore des seuils par catégorie, on convertit
-- UNE fois chaque type sans raretés propres (chaque rareté garde la fin de sa tranche comme nombre de séries ; TOUS les numéros
-- restent visibles, comme avant : numbered_series = max_series), puis on supprime les seuils par catégorie. Sans effet sur une base neuve.
do $$
begin
  if to_regclass('public.o1ocards_category_rarities') is not null then
    insert into public.o1ocards_type_rarities (type_id, rarity_id, max_series, numbered_series)
    select t.id, b.rarity_id, b.hi, b.hi
    from public.o1ocards_types t
    join public.o1ocards_categories c on c.id = t.category_id
    cross join lateral (
      select o.rarity_id, o.lo, o.hi
      from (
        select src.rarity_id,
               least(coalesce(src.max_series, coalesce(t.series_count, c.series_count)), coalesce(t.series_count, c.series_count)) as hi,
               coalesce(lag(least(coalesce(src.max_series, coalesce(t.series_count, c.series_count)), coalesce(t.series_count, c.series_count)))
                          over (order by coalesce(src.max_series, 2147483647), src.rarity_id), 0) + 1 as lo
        from (
          select cr.rarity_id, cr.max_series
          from public.o1ocards_category_rarities cr
          join public.o1ocards_rarities r on r.id = cr.rarity_id and r.kind = 'range'
          where cr.category_id = c.id
          union all
          select r.id, r.max_series from public.o1ocards_rarities r
          where r.kind = 'range'
            and not exists (select 1 from public.o1ocards_category_rarities y where y.category_id = c.id)
        ) src
      ) o
      where o.lo <= o.hi
    ) b
    where not exists (select 1 from public.o1ocards_type_rarities x where x.type_id = t.id);
    drop table public.o1ocards_category_rarities;
  end if;
end $$;

-- Réglage des raretés d'UN type : pour chaque rareté « à seuil », son nombre de séries (smax) et le nombre de séries dont le
-- numéro est visible (numbered). Ses propres lignes si elle en a, sinon les réglages par défaut de la table rarities
-- (max_series null = « le reste » : le nombre de séries de la catégorie ; numéros toujours visibles).
create or replace function public.o1ocards_type_config(p_type int)
returns table (rarity_id text, smax int, numbered int)
language sql stable set search_path = public as $$
  select tr.rarity_id, tr.max_series, tr.numbered_series
  from public.o1ocards_type_rarities tr where tr.type_id = p_type
  union all
  select r.id, least(coalesce(r.max_series, c.series_count), c.series_count), 2147483647
  from public.o1ocards_types t
  join public.o1ocards_categories c on c.id = t.category_id
  cross join public.o1ocards_rarities r
  where t.id = p_type and r.kind = 'range'
    and not exists (select 1 from public.o1ocards_type_rarities x where x.type_id = p_type)
$$;

-- Rareté de base « par défaut » d'une carte (type, série) : la plus rare des raretés du type qui peut contenir cette taille de
-- série (plus petit nombre de séries >= la série). Sert à convertir les cartes existantes et d'insertion de secours.
create or replace function public.o1ocards_default_base_rarity(p_type int, p_series int)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select c.rarity_id from public.o1ocards_type_config(p_type) c where c.smax >= p_series order by c.smax, c.rarity_id limit 1),
    (select c.rarity_id from public.o1ocards_type_config(p_type) c order by c.smax desc, c.rarity_id limit 1))
$$;

-- ---------- Cartes : chaque carte n'existe qu'en UN exemplaire ----------
-- Une ligne = une carte déjà tirée et son propriétaire. Une carte absente de la table est encore dans les boosters.
-- Une carte = type + rareté de base + série + numéro. Chaque rareté d'un type a ses propres séries (de 1/1 à N/N) : un 3/7 Ultra
-- Rare et un 3/7 Super Rare sont deux cartes différentes. La rareté AFFICHÉE peut différer de la rareté de base : Unique (série
-- 1), Alpha (1/m) et Omega (m/m, numéro visible) remplacent la rareté de ces cartes.
create table if not exists public.o1ocards_cards (
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  base_rarity text references public.o1ocards_rarities (id),   -- fait partie de la clé primaire : jamais null
  series      int  not null check (series >= 1),
  number      int  not null check (number >= 1 and number <= series),
  owner_id    uuid references auth.users (id) on delete cascade,   -- null : carte retirée du jeu (revendue à la banque)
  obtained_at timestamptz not null default now(),
  retired_at  timestamptz,
  primary key (type_id, base_rarity, series, number)
);
-- Une carte revendue à la banque n'est PAS supprimée : elle reste dans la table, sans propriétaire, avec sa date de retrait.
-- Elle reste donc « tirée » (le compteur de la série ne baisse pas) et aucun booster ne peut la redonner.
-- Migrations (sûres à relancer) pour les bases créées avant.
alter table public.o1ocards_cards alter column owner_id drop not null;
alter table public.o1ocards_cards add column if not exists retired_at timestamptz;
alter table public.o1ocards_cards add column if not exists base_rarity text;
alter table public.o1ocards_cards drop constraint if exists o1ocards_cards_owner_or_retired;
alter table public.o1ocards_cards add constraint o1ocards_cards_owner_or_retired check (owner_id is not null or retired_at is not null);

-- Insertion sans rareté de base (ancien code, scripts) : on prend la rareté par défaut de la série
create or replace function public.o1ocards_cards_default_base()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.base_rarity is null then new.base_rarity := public.o1ocards_default_base_rarity(new.type_id, new.series); end if;
  return new;
end $$;
drop trigger if exists o1ocards_cards_default_base_trg on public.o1ocards_cards;
create trigger o1ocards_cards_default_base_trg
  before insert on public.o1ocards_cards
  for each row execute function public.o1ocards_cards_default_base();

-- Journal des 1/1 (série de taille 1 : rareté Unique) obtenues, consultable en admin
create table if not exists public.o1ocards_unique_wins (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  base_rarity text,
  won_at      timestamptz not null default now()
);
alter table public.o1ocards_unique_wins add column if not exists base_rarity text;
create index if not exists o1ocards_unique_wins_user_idx on public.o1ocards_unique_wins (user_id);

create or replace function public.o1ocards_log_unique_win()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.series = 1 then   -- une série de 1 carte : c'est forcément la 1/1 (rareté Unique)
    insert into public.o1ocards_unique_wins (user_id, type_id, base_rarity) values (new.owner_id, new.type_id, new.base_rarity);
  end if;
  return new;
end $$;

drop trigger if exists o1ocards_cards_unique_win_trg on public.o1ocards_cards;
create trigger o1ocards_cards_unique_win_trg
  after insert on public.o1ocards_cards
  for each row execute function public.o1ocards_log_unique_win();

-- Compteur de cartes déjà tirées par type, rareté de base et série (pour un tirage rapide)
create table if not exists public.o1ocards_series_taken (
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  base_rarity text,
  series      int  not null,
  taken       int  not null default 0,
  primary key (type_id, base_rarity, series)
);
alter table public.o1ocards_series_taken add column if not exists base_rarity text;

create or replace function public.o1ocards_cards_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.o1ocards_series_taken (type_id, base_rarity, series, taken) values (new.type_id, new.base_rarity, new.series, 1)
    on conflict (type_id, base_rarity, series) do update set taken = o1ocards_series_taken.taken + 1;
    return new;
  elsif tg_op = 'DELETE' then
    update public.o1ocards_series_taken set taken = greatest(taken - 1, 0)
    where type_id = old.type_id and base_rarity = old.base_rarity and series = old.series;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists o1ocards_cards_counter_trg on public.o1ocards_cards;
create trigger o1ocards_cards_counter_trg
  after insert or delete on public.o1ocards_cards
  for each row execute function public.o1ocards_cards_counter();

-- ---------- Séries complétées : un pack doré pour le PREMIER joueur qui possède toutes les cartes d'une série d'une rareté d'un type ----------
-- (une récompense par type, rareté et série, pour toute la communauté : un échange de cartes entre comptes ne la redonne pas)
create table if not exists public.o1ocards_series_rewards (
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  base_rarity text,
  series      int  not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  seen        boolean not null default false,   -- le joueur a vu l'annonce de sa récompense
  primary key (type_id, base_rarity, series)
);
alter table public.o1ocards_series_rewards add column if not exists base_rarity text;
create index if not exists o1ocards_series_rewards_user_idx on public.o1ocards_series_rewards (user_id, seen);

create or replace function public.o1ocards_cards_reward()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_min int := coalesce(public.o1ocards_cfg('series_reward_min_size'), 0)::int; v_owned int; v_rows int;
begin
  if new.owner_id is null then return new; end if;   -- carte retirée du jeu : rien à récompenser
  if v_min < 1 or new.series < v_min then return new; end if;
  select count(*) into v_owned from public.o1ocards_cards
  where type_id = new.type_id and base_rarity = new.base_rarity and series = new.series and owner_id = new.owner_id;
  if v_owned = new.series then
    insert into public.o1ocards_series_rewards (type_id, base_rarity, series, user_id)
    values (new.type_id, new.base_rarity, new.series, new.owner_id) on conflict (type_id, base_rarity, series) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      update public.o1ocards_profiles set golden_packs = golden_packs + 1 where id = new.owner_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists o1ocards_cards_reward_trg on public.o1ocards_cards;
create trigger o1ocards_cards_reward_trg
  after insert or update of owner_id on public.o1ocards_cards
  for each row execute function public.o1ocards_cards_reward();

-- Rattrapage (sûr à relancer) : séries déjà complètes par un seul joueur. Une série dont une carte a été retirée du jeu n'est
-- jamais complète : count(owner_id) ne compte que les cartes qui ont un propriétaire.
create or replace function public.o1ocards_series_rewards_backfill()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with ins as (
    insert into public.o1ocards_series_rewards (type_id, base_rarity, series, user_id)
    select c.type_id, c.base_rarity, c.series, min(c.owner_id::text)::uuid
    from public.o1ocards_cards c
    where coalesce((select value from public.o1ocards_config where key = 'series_reward_min_size'), 0) >= 1
      and c.series >= (select value from public.o1ocards_config where key = 'series_reward_min_size')
    group by c.type_id, c.base_rarity, c.series
    having count(c.owner_id) = c.series and count(distinct c.owner_id) = 1
    on conflict (type_id, base_rarity, series) do nothing
    returning user_id
  ),
  upd as (
    update public.o1ocards_profiles pr set golden_packs = pr.golden_packs + x.n
    from (select user_id, count(*) as n from ins group by user_id) x
    where pr.id = x.user_id
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

-- ---------- Marché ----------
create table if not exists public.o1ocards_listings (
  id             bigint generated always as identity primary key,
  type_id        int  not null,
  base_rarity    text,
  series         int  not null,
  number         int  not null,
  seller_id      uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('buy_now', 'auction')),
  price          int  not null check (price >= 1),        -- achat direct : prix ; enchère : prix de départ
  current_bid    int,
  current_bidder uuid references auth.users (id) on delete set null,
  bid_count      int  not null default 0,
  ends_at        timestamptz,                              -- enchères uniquement
  status         text not null default 'active' check (status in ('active', 'sold', 'expired', 'cancelled')),
  buyer_id       uuid references auth.users (id) on delete set null,
  final_price    int,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);
alter table public.o1ocards_listings add column if not exists base_rarity text;
create index if not exists o1ocards_listings_due_idx on public.o1ocards_listings (ends_at) where status = 'active' and kind = 'auction';
create index if not exists o1ocards_listings_seller_idx on public.o1ocards_listings (seller_id);
create index if not exists o1ocards_listings_bidder_idx on public.o1ocards_listings (current_bidder) where status = 'active';

create table if not exists public.o1ocards_bids (
  id         bigint generated always as identity primary key,
  listing_id bigint not null references public.o1ocards_listings (id) on delete cascade,
  bidder_id  uuid   not null references auth.users (id) on delete cascade,
  amount     int    not null,
  created_at timestamptz not null default now()
);
create index if not exists o1ocards_bids_bidder_idx on public.o1ocards_bids (bidder_id, listing_id);

-- ---------- Album : un emplacement par carte (type) et par rareté AFFICHÉE, rempli avec un de ses exemplaires ----------
-- rarity_id = rareté affichée de l'emplacement ; base_rarity + series + number = la carte choisie
create table if not exists public.o1ocards_album_picks (
  user_id     uuid not null references auth.users (id) on delete cascade,
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  rarity_id   text not null references public.o1ocards_rarities (id) on delete cascade,
  base_rarity text,
  series      int  not null,
  number      int  not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, type_id, rarity_id)
);
alter table public.o1ocards_album_picks add column if not exists base_rarity text;

-- ---------- Favoris : suivre une carte qu'on ne possède pas ----------
create table if not exists public.o1ocards_favorites (
  user_id     uuid not null references auth.users (id) on delete cascade,
  type_id     int  not null references public.o1ocards_types (id) on delete cascade,
  base_rarity text,
  series      int  not null,
  number      int  not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, type_id, base_rarity, series, number)
);
alter table public.o1ocards_favorites add column if not exists base_rarity text;

-- ---------- Offres directes : proposer un prix pour la carte d'un autre joueur, en vente ou non ----------
create table if not exists public.o1ocards_offers (
  id           bigint generated always as identity primary key,
  type_id      int  not null,
  base_rarity  text,
  series       int  not null,
  number       int  not null,
  buyer_id     uuid not null references auth.users (id) on delete cascade,
  seller_id    uuid not null references auth.users (id) on delete cascade,
  amount       int  not null check (amount >= 1),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
alter table public.o1ocards_offers add column if not exists base_rarity text;
create index if not exists o1ocards_offers_seller_idx on public.o1ocards_offers (seller_id, status, created_at desc);
create index if not exists o1ocards_offers_buyer_idx on public.o1ocards_offers (buyer_id, status, created_at desc);

-- ---------- Notifications : cloche en haut de l'application ----------
create table if not exists public.o1ocards_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('favorite_listed', 'offer_received', 'offer_accepted', 'offer_declined')),
  type_id    int,
  card_base  text,
  series     int,
  number     int,
  listing_id bigint,
  offer_id   bigint,
  amount     int,
  actor_name text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.o1ocards_notifications add column if not exists card_base text;
create index if not exists o1ocards_notifications_user_idx on public.o1ocards_notifications (user_id, read, created_at desc);

-- Une carte favorite d'un joueur vient d'être mise en vente : on le prévient (sauf si c'est lui le vendeur)
create or replace function public.o1ocards_notify_favorites()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller_name text;
begin
  select username into v_seller_name from public.o1ocards_profiles where id = new.seller_id;
  insert into public.o1ocards_notifications (user_id, kind, type_id, card_base, series, number, listing_id, amount, actor_name)
  select f.user_id, 'favorite_listed', new.type_id, new.base_rarity, new.series, new.number, new.id, new.price, v_seller_name
  from public.o1ocards_favorites f
  where f.type_id = new.type_id and f.base_rarity = new.base_rarity and f.series = new.series and f.number = new.number
    and f.user_id <> new.seller_id;
  return new;
end $$;
drop trigger if exists o1ocards_listings_notify_trg on public.o1ocards_listings;
create trigger o1ocards_listings_notify_trg
  after insert on public.o1ocards_listings
  for each row execute function public.o1ocards_notify_favorites();

-- ================= MIGRATION : chaque rareté a ses propres séries ; la rareté de base entre dans l'identité d'une carte =================
-- Sur une base créée avant, chaque carte (et chaque annonce, offre, favori, choix d'album) garde la rareté qu'elle avait : celle de
-- la tranche de sa série (rareté par défaut de sa taille de série). Les réglages des types (max_series) deviennent le nombre de
-- séries de chaque rareté. Sans effet sur une base déjà migrée ou neuve.
do $$
declare v_done boolean;
begin
  select exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public.o1ocards_cards'::regclass and i.indisprimary and a.attname = 'base_rarity'
  ) into v_done;
  if v_done then return; end if;

  update public.o1ocards_cards c set base_rarity = d.b
  from (select distinct type_id, series, public.o1ocards_default_base_rarity(type_id, series) as b from public.o1ocards_cards) d
  where c.type_id = d.type_id and c.series = d.series and c.base_rarity is null;

  update public.o1ocards_listings l set base_rarity = coalesce(
    (select c.base_rarity from public.o1ocards_cards c where c.type_id = l.type_id and c.series = l.series and c.number = l.number),
    public.o1ocards_default_base_rarity(l.type_id, l.series)) where l.base_rarity is null;
  update public.o1ocards_offers o set base_rarity = coalesce(
    (select c.base_rarity from public.o1ocards_cards c where c.type_id = o.type_id and c.series = o.series and c.number = o.number),
    public.o1ocards_default_base_rarity(o.type_id, o.series)) where o.base_rarity is null;
  update public.o1ocards_album_picks a set base_rarity = coalesce(
    (select c.base_rarity from public.o1ocards_cards c where c.type_id = a.type_id and c.series = a.series and c.number = a.number),
    public.o1ocards_default_base_rarity(a.type_id, a.series)) where a.base_rarity is null;
  update public.o1ocards_favorites f set base_rarity = coalesce(
    (select c.base_rarity from public.o1ocards_cards c where c.type_id = f.type_id and c.series = f.series and c.number = f.number),
    public.o1ocards_default_base_rarity(f.type_id, f.series)) where f.base_rarity is null;
  update public.o1ocards_notifications n set card_base = coalesce(
    (select c.base_rarity from public.o1ocards_cards c where c.type_id = n.type_id and c.series = n.series and c.number = n.number),
    public.o1ocards_default_base_rarity(n.type_id, n.series)) where n.card_base is null and n.type_id is not null;
  update public.o1ocards_series_rewards r set base_rarity = public.o1ocards_default_base_rarity(r.type_id, r.series) where r.base_rarity is null;
  update public.o1ocards_unique_wins u set base_rarity = public.o1ocards_default_base_rarity(u.type_id, 1) where u.base_rarity is null;
  delete from public.o1ocards_series_taken;   -- recalculé juste après avec la rareté de base

  alter table public.o1ocards_cards alter column base_rarity set not null;
  alter table public.o1ocards_cards add constraint o1ocards_cards_base_rarity_fk foreign key (base_rarity) references public.o1ocards_rarities (id);
  alter table public.o1ocards_cards drop constraint o1ocards_cards_pkey;
  alter table public.o1ocards_cards add primary key (type_id, base_rarity, series, number);

  alter table public.o1ocards_series_taken alter column base_rarity set not null;
  alter table public.o1ocards_series_taken drop constraint o1ocards_series_taken_pkey;
  alter table public.o1ocards_series_taken add primary key (type_id, base_rarity, series);

  alter table public.o1ocards_series_rewards alter column base_rarity set not null;
  alter table public.o1ocards_series_rewards drop constraint o1ocards_series_rewards_pkey;
  alter table public.o1ocards_series_rewards add primary key (type_id, base_rarity, series);

  alter table public.o1ocards_favorites alter column base_rarity set not null;
  alter table public.o1ocards_favorites drop constraint o1ocards_favorites_pkey;
  alter table public.o1ocards_favorites add primary key (user_id, type_id, base_rarity, series, number);

  alter table public.o1ocards_listings alter column base_rarity set not null;
  alter table public.o1ocards_offers alter column base_rarity set not null;
  alter table public.o1ocards_album_picks alter column base_rarity set not null;
  drop index if exists public.o1ocards_listings_one_active;
  drop index if exists public.o1ocards_offers_one_pending;
  drop index if exists public.o1ocards_album_picks_card_idx;
  drop index if exists public.o1ocards_favorites_card_idx;
  drop index if exists public.o1ocards_cards_owner_idx;
end $$;

-- Index qui dépendent de la rareté de base (créés après la migration)
create index if not exists o1ocards_cards_owner_idx on public.o1ocards_cards (owner_id, type_id, base_rarity, series, number);
create unique index if not exists o1ocards_listings_one_active on public.o1ocards_listings (type_id, base_rarity, series, number) where status = 'active';
-- Une seule offre active à la fois par acheteur et par carte : en refaire une remplace la précédente (montant mis à jour)
create unique index if not exists o1ocards_offers_one_pending on public.o1ocards_offers (type_id, base_rarity, series, number, buyer_id) where status = 'pending';
create index if not exists o1ocards_album_picks_card_idx on public.o1ocards_album_picks (type_id, base_rarity, series, number);
create index if not exists o1ocards_favorites_card_idx on public.o1ocards_favorites (type_id, base_rarity, series, number);

-- Recalcul des compteurs de cartes tirées (sûr à relancer)
insert into public.o1ocards_series_taken (type_id, base_rarity, series, taken)
select type_id, base_rarity, series, count(*) from public.o1ocards_cards group by type_id, base_rarity, series
on conflict (type_id, base_rarity, series) do update set taken = excluded.taken;
update public.o1ocards_series_taken t set taken = 0
where not exists (select 1 from public.o1ocards_cards c where c.type_id = t.type_id and c.base_rarity = t.base_rarity and c.series = t.series);
select public.o1ocards_series_rewards_backfill();

-- Informations légales du vendeur et textes de consentement (affichés dans les conditions de vente).
-- À compléter avant de vendre pour de vrai : voir README.
create table if not exists public.o1ocards_legal (
  key   text primary key,
  value text not null default ''
);
insert into public.o1ocards_legal (key, value) values
  ('seller_name',     ''),   -- nom (ou raison sociale) du vendeur
  ('seller_status',   ''),   -- ex. Entrepreneur individuel, SASU...
  ('seller_address',  ''),   -- adresse postale complète
  ('seller_email',    ''),   -- adresse de contact
  ('seller_phone',    ''),   -- facultatif
  ('seller_siret',    ''),   -- numéro SIRET
  ('seller_vat',      ''),   -- n° de TVA, ou mention du type « TVA non applicable, art. 293 B du CGI »
  ('mediator_name',   ''),   -- médiateur de la consommation
  ('mediator_url',    ''),   -- site ou adresse du médiateur
  ('consent_cgv_text', 'J''ai lu et j''accepte les conditions générales de vente.'),
  ('consent_withdrawal_text', 'Je demande l''exécution immédiate de ma commande : les boosters sont ajoutés à mon compte dès le paiement. Je reconnais que je perds mon droit de rétractation dès que les boosters sont fournis.')
on conflict (key) do nothing;

-- Preuve du consentement donné avant chaque paiement (écrite uniquement par la fonction serveur de paiement)
create table if not exists public.o1ocards_consents (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  cgv_version       int  not null,
  statement         text not null,   -- textes exacts acceptés par le joueur
  ip                text,
  user_agent        text,
  boosters          int,
  amount_cents      int,
  currency          text,
  stripe_session_id text,
  created_at        timestamptz not null default now()
);
create index if not exists o1ocards_consents_user_idx on public.o1ocards_consents (user_id, created_at desc);
create index if not exists o1ocards_consents_session_idx on public.o1ocards_consents (stripe_session_id);

-- Achats Stripe (un enregistrement par session de paiement : empêche de créditer deux fois)
create table if not exists public.o1ocards_purchases (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  boosters              int  not null,
  amount_cents          int,
  currency              text,
  created_at            timestamptz not null default now()
);
create index if not exists o1ocards_purchases_user_idx on public.o1ocards_purchases (user_id, created_at desc);

-- ---------- Console admin : secrets et journal des tentatives ----------
-- Le mot de passe admin n'est jamais écrit en clair : seul son hachage (bcrypt) est stocké ici.
create table if not exists public.o1ocards_secrets (
  key   text primary key,
  value text not null
);
create table if not exists public.o1ocards_admin_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists o1ocards_admin_log_idx on public.o1ocards_admin_log (created_at);

-- ---------- Sécurité : tout passe par les fonctions ci-dessous ----------
alter table public.o1ocards_config       enable row level security;
alter table public.o1ocards_rarities     enable row level security;
alter table public.o1ocards_type_rarities enable row level security;
alter table public.o1ocards_unique_wins enable row level security;
alter table public.o1ocards_album_picks enable row level security;
alter table public.o1ocards_profiles     enable row level security;
alter table public.o1ocards_categories   enable row level security;
alter table public.o1ocards_types        enable row level security;
alter table public.o1ocards_cards        enable row level security;
alter table public.o1ocards_series_taken enable row level security;
alter table public.o1ocards_listings     enable row level security;
alter table public.o1ocards_bids         enable row level security;
alter table public.o1ocards_golden_contents enable row level security;
alter table public.o1ocards_purchases    enable row level security;
alter table public.o1ocards_legal        enable row level security;
alter table public.o1ocards_consents     enable row level security;
alter table public.o1ocards_secrets      enable row level security;
alter table public.o1ocards_admin_log    enable row level security;
alter table public.o1ocards_series_rewards enable row level security;
alter table public.o1ocards_favorites     enable row level security;
alter table public.o1ocards_offers        enable row level security;
alter table public.o1ocards_notifications enable row level security;

drop policy if exists o1ocards_legal_read on public.o1ocards_legal;
create policy o1ocards_legal_read on public.o1ocards_legal
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_consents_read_own on public.o1ocards_consents;
create policy o1ocards_consents_read_own on public.o1ocards_consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists o1ocards_purchases_read_own on public.o1ocards_purchases;
create policy o1ocards_purchases_read_own on public.o1ocards_purchases
  for select to authenticated using (user_id = auth.uid());

drop policy if exists o1ocards_config_read on public.o1ocards_config;
create policy o1ocards_config_read on public.o1ocards_config
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_rarities_read on public.o1ocards_rarities;
create policy o1ocards_rarities_read on public.o1ocards_rarities
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_categories_read on public.o1ocards_categories;
create policy o1ocards_categories_read on public.o1ocards_categories
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_types_read on public.o1ocards_types;
create policy o1ocards_types_read on public.o1ocards_types
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_type_rarities_read on public.o1ocards_type_rarities;
create policy o1ocards_type_rarities_read on public.o1ocards_type_rarities
  for select to anon, authenticated using (true);

drop policy if exists o1ocards_profiles_read_own on public.o1ocards_profiles;
create policy o1ocards_profiles_read_own on public.o1ocards_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists o1ocards_cards_read_own on public.o1ocards_cards;
create policy o1ocards_cards_read_own on public.o1ocards_cards
  for select to authenticated using (owner_id = auth.uid());

revoke insert, update, delete on public.o1ocards_config, public.o1ocards_rarities, public.o1ocards_profiles,
  public.o1ocards_categories, public.o1ocards_types, public.o1ocards_cards from anon, authenticated;
revoke all on public.o1ocards_series_taken, public.o1ocards_listings, public.o1ocards_bids, public.o1ocards_golden_contents,
  public.o1ocards_secrets, public.o1ocards_admin_log, public.o1ocards_series_rewards from anon, authenticated;
revoke all on public.o1ocards_favorites, public.o1ocards_offers, public.o1ocards_notifications from anon, authenticated;
revoke all on public.o1ocards_unique_wins from anon, authenticated;
revoke insert, update, delete on public.o1ocards_type_rarities from anon, authenticated;
revoke all on public.o1ocards_album_picks from anon, authenticated;
revoke insert, update, delete on public.o1ocards_purchases, public.o1ocards_legal, public.o1ocards_consents from anon, authenticated;

-- ---------- Fonctions utilitaires ----------
create or replace function public.o1ocards_cfg(p_key text)
returns numeric language sql stable set search_path = public as $$
  select value from public.o1ocards_config where key = p_key
$$;

-- Anciennes fonctions de tranches de séries (remplacées : chaque rareté a ses propres séries)
drop function if exists public.o1ocards_range_rarity(int);
drop function if exists public.o1ocards_range_rarity(int, int);
drop function if exists public.o1ocards_type_bands(int);
drop function if exists public.o1ocards_type_range_rarity(int, int);
drop function if exists public.o1ocards_number_visible(int, int);
drop function if exists public.o1ocards_rarity_id(int, int, int);

-- Plus grand nombre de séries d'une rareté d'un type
create or replace function public.o1ocards_type_series_count(p_type int)
returns int language sql stable set search_path = public as $$
  select coalesce(max(c.smax), 1) from public.o1ocards_type_config(p_type) c
$$;

-- Le numéro n/m des cartes d'une série d'une rareté d'un type est-il visible ? Oui pour les `numbered` premières séries de cette
-- rareté (de 1 à `numbered`), non au-delà.
create or replace function public.o1ocards_number_visible(p_type int, p_base text, m int)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select m <= c.numbered from public.o1ocards_type_config(p_type) c where c.rarity_id = p_base), true)
$$;

-- Rareté AFFICHÉE de la carte n/m de la rareté de base p_base du type p_type. Priorité :
-- Unique (série 1) > Alpha (1/m) > Omega (m/m) > rareté de base. Alpha et Omega n'existent que pour les séries dont le numéro
-- est visible : sinon la carte 1/m ou m/m garde la rareté de base, comme les autres.
create or replace function public.o1ocards_rarity_id(n int, m int, p_type int, p_base text)
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  if m = 1 then
    select id into v from public.o1ocards_rarities where kind = 'unique' limit 1;
  elsif n = 1 and public.o1ocards_number_visible(p_type, p_base, m) then
    select id into v from public.o1ocards_rarities where kind = 'alpha' limit 1;
  elsif n = m and public.o1ocards_number_visible(p_type, p_base, m) then
    select id into v from public.o1ocards_rarities where kind = 'omega' limit 1;
  end if;
  if v is not null then return v; end if;
  return p_base;
end $$;

-- Le joueur possède-t-il déjà au moins une carte de ce type dans cette rareté affichée (= un emplacement d'album déjà rempli
-- ou remplissable) ? Sert à repérer les NOUVELLES cartes d'un booster ; appelée avant l'insertion de la carte tirée.
create or replace function public.o1ocards_owns_card_rarity(p_uid uuid, p_type int, p_rarity text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.o1ocards_cards c
    where c.owner_id = p_uid and c.type_id = p_type
      and public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) = p_rarity
  )
$$;

-- Catégorie actuellement ouvrable : la première activée et non terminée
create or replace function public.o1ocards_active_category()
returns int language sql stable set search_path = public as $$
  select id from public.o1ocards_categories where enabled and not closed order by position, id limit 1
$$;

-- Nombre total de cartes d'une catégorie (tous types) et nombre déjà tirées
create or replace function public.o1ocards_category_total(p_category int)
returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(c.smax::bigint * (c.smax + 1) / 2), 0)
  from public.o1ocards_types t
  cross join lateral public.o1ocards_type_config(t.id) c
  where t.category_id = p_category
$$;

create or replace function public.o1ocards_category_taken(p_category int)
returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(s.taken), 0)::bigint
  from public.o1ocards_series_taken s
  join public.o1ocards_types t on t.id = s.type_id
  where t.category_id = p_category
$$;

-- Tire au hasard une carte encore disponible d'une rareté donnée dans une catégorie (booster doré).
-- Même pondération que les boosters normaux : poids d'une carte = taille de série ^ exposant.
-- (jit = off : le plan de ces requêtes est jugé coûteux par PostgreSQL, qui le compilerait à chaque appel pour ~35 ms de plus)
drop function if exists public.o1ocards_draw_rarity(text, int);
create or replace function public.o1ocards_draw_rarity(
  p_rarity text, p_category int, out o_type int, out o_base text, out o_series int, out o_number int
)
language plpgsql security definer set search_path = public set jit = off as $$
declare
  rar      public.o1ocards_rarities;
  e        double precision := public.o1ocards_cfg('rarity_exponent')::double precision;
  ts       int[];
  bs       text[];
  ms       int[];
  av       int[];
  hs       boolean[];
  ws       double precision[];
  total    double precision := 0;
  x        double precision;
  acc      double precision := 0;
  i        int;
  pick     int := 1;
  k        int;
  v_lo     int;
  v_hi     int;
  g_lo     int;
begin
  select * into rar from public.o1ocards_rarities where id = p_rarity;
  if not found then return; end if;
  if not exists (select 1 from public.o1ocards_categories where id = p_category) then return; end if;

  -- Cartes encore disponibles de cette rareté AFFICHÉE : (type, rareté de base, série) avec le nombre de cartes restantes.
  --  Unique : la carte 1/1 de chaque rareté de base ; Alpha / Omega : la 1re / dernière carte de chaque série à numéro visible
  --  (série 2 à `numbered`) ; rareté « à seuil » : les cartes de SA rareté de base, soit 2..m-1 dans une série à numéro visible
  --  (1/m = Alpha et m/m = Omega), soit toutes (1..m) dans une série à numéro masqué.
  g_lo := case when rar.kind = 'unique' then 1 when rar.kind in ('alpha', 'omega') then 2 else 2 end;
  with cf as materialized (
    select ty.id as type_id, c.rarity_id as base, c.smax, c.numbered
    from public.o1ocards_types ty
    cross join lateral public.o1ocards_type_config(ty.id) c
    where ty.category_id = p_category
      and (rar.kind in ('unique', 'alpha', 'omega') or c.rarity_id = p_rarity)
  )
  select array_agg(q.type_id order by q.type_id, q.base, q.m), array_agg(q.base order by q.type_id, q.base, q.m),
         array_agg(q.m order by q.type_id, q.base, q.m), array_agg(q.avail order by q.type_id, q.base, q.m),
         array_agg(q.hid order by q.type_id, q.base, q.m),
         array_agg(q.avail * power(q.m::double precision, e) order by q.type_id, q.base, q.m)
  into ts, bs, ms, av, hs, ws
  from (
    select cf.type_id, cf.base, g as m, (g > cf.numbered) as hid,
      case
        when rar.kind = 'unique' then
          case when not exists (select 1 from public.o1ocards_cards c where c.type_id = cf.type_id and c.base_rarity = cf.base and c.series = 1 and c.number = 1) then 1 else 0 end
        when rar.kind = 'alpha' then
          case when not exists (select 1 from public.o1ocards_cards c where c.type_id = cf.type_id and c.base_rarity = cf.base and c.series = g and c.number = 1) then 1 else 0 end
        when rar.kind = 'omega' then
          case when not exists (select 1 from public.o1ocards_cards c where c.type_id = cf.type_id and c.base_rarity = cf.base and c.series = g and c.number = g) then 1 else 0 end
        else
          case when g <= cf.numbered
               then greatest(g - 2 - (select count(*)::int from public.o1ocards_cards c where c.type_id = cf.type_id and c.base_rarity = cf.base and c.series = g and c.number between 2 and g - 1), 0)
               else g - (select count(*)::int from public.o1ocards_cards c where c.type_id = cf.type_id and c.base_rarity = cf.base and c.series = g)
          end
      end as avail
    from cf
    cross join lateral generate_series(
      g_lo,
      case when rar.kind = 'unique' then 1
           when rar.kind in ('alpha', 'omega') then least(cf.numbered::bigint, cf.smax)::int
           else cf.smax end
    ) g
  ) q
  where q.avail > 0;

  if ts is null then return; end if;
  for i in 1 .. array_length(ws, 1) loop total := total + ws[i]; end loop;
  if total <= 0 then return; end if;

  x := random() * total;
  for i in 1 .. array_length(ws, 1) loop
    pick := i;
    acc := acc + ws[i];
    exit when acc > x;
  end loop;
  o_type   := ts[pick];
  o_base   := bs[pick];
  o_series := ms[pick];

  if rar.kind in ('unique', 'alpha') then
    o_number := 1;
  elsif rar.kind = 'omega' then
    o_number := o_series;
  else
    v_lo := case when hs[pick] then 1 else 2 end;
    v_hi := case when hs[pick] then o_series else o_series - 1 end;
    k := floor(random() * av[pick])::int;
    select y into o_number
    from generate_series(v_lo, v_hi) y
    where not exists (select 1 from public.o1ocards_cards c where c.type_id = o_type and c.base_rarity = o_base and c.series = o_series and c.number = y)
    order by y
    offset k limit 1;
  end if;
end $$;

create or replace function public.o1ocards_ensure_profile(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.o1ocards_profiles (id, username, boosters, coins)
  select a.id,
         left(coalesce(nullif(trim(a.raw_user_meta_data ->> 'username'), ''),
                       nullif(split_part(a.email, '@', 1), ''), 'joueur'), 24),
         public.o1ocards_cfg('start_boosters')::int,
         coalesce(public.o1ocards_cfg('start_coins'), 0)::bigint
  from auth.users a
  where a.id = p_uid
  on conflict (id) do nothing;
end $$;

-- ---------- Recharge des boosters (calculée à la demande) ----------
create or replace function public.o1ocards_sync(p_uid uuid)
returns public.o1ocards_profiles
language plpgsql security definer set search_path = public as $$
declare
  p       public.o1ocards_profiles;
  v_max   int := public.o1ocards_cfg('max_boosters')::int;
  v_min   int := greatest(public.o1ocards_cfg('regen_minutes')::int, 1);
  v_amt   int := public.o1ocards_cfg('regen_amount')::int;
  v_ticks int;
  v_new   int;
begin
  perform public.o1ocards_ensure_profile(p_uid);
  select * into p from public.o1ocards_profiles where id = p_uid for update;
  if not found then raise exception 'profile_not_found'; end if;

  if p.boosters >= v_max then
    update public.o1ocards_profiles set boosters_updated_at = now()
    where id = p_uid returning * into p;
  else
    v_ticks := floor(extract(epoch from (now() - p.boosters_updated_at)) / (v_min * 60))::int;
    if v_ticks > 0 then
      v_new := least(v_max, p.boosters + v_ticks * v_amt);
      update public.o1ocards_profiles
      set boosters = v_new,
          boosters_updated_at = case
            when v_new >= v_max then now()
            else p.boosters_updated_at + (v_ticks * v_min) * interval '1 minute'
          end
      where id = p_uid returning * into p;
    end if;
  end if;
  return p;
end $$;

-- Clôture les enchères terminées (appelée automatiquement avant chaque lecture)
create or replace function public.o1ocards_settle_due()
returns void language plpgsql security definer set search_path = public as $$
declare r public.o1ocards_listings;
begin
  for r in
    select * from public.o1ocards_listings
    where status = 'active' and kind = 'auction' and ends_at <= now()
    order by id
    for update skip locked
  loop
    if r.current_bidder is null then
      update public.o1ocards_listings set status = 'expired', closed_at = now() where id = r.id;
    else
      update public.o1ocards_profiles set coins = coins + r.current_bid where id = r.seller_id;
      update public.o1ocards_cards set owner_id = r.current_bidder, obtained_at = now()
      where type_id = r.type_id and base_rarity = r.base_rarity and series = r.series and number = r.number;
      delete from public.o1ocards_favorites where user_id = r.current_bidder and type_id = r.type_id and base_rarity = r.base_rarity and series = r.series and number = r.number;
      delete from public.o1ocards_album_picks where user_id = r.seller_id and type_id = r.type_id and base_rarity = r.base_rarity and series = r.series and number = r.number;
      update public.o1ocards_listings
      set status = 'sold', buyer_id = r.current_bidder, final_price = r.current_bid, closed_at = now()
      where id = r.id;
    end if;
  end loop;
end $$;

create or replace function public.o1ocards_status_json(p public.o1ocards_profiles)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_max    int := public.o1ocards_cfg('max_boosters')::int;
  v_min    int := greatest(public.o1ocards_cfg('regen_minutes')::int, 1);
  v_cat    int := public.o1ocards_active_category();
  v_taken  bigint := 0;
  v_total  bigint := 0;
  v_locked bigint;
  v_next   jsonb;
  v_closed jsonb;
begin
  if v_cat is not null then
    v_taken := public.o1ocards_category_taken(v_cat);
    v_total := public.o1ocards_category_total(v_cat);
  end if;
  select coalesce(sum(current_bid), 0) into v_locked
  from public.o1ocards_listings where current_bidder = p.id and status = 'active';
  select jsonb_build_object('id', c.id, 'name', c.name) into v_next
  from public.o1ocards_categories c
  where c.enabled and not c.closed and c.id is distinct from v_cat
  order by c.position, c.id limit 1;
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into v_closed
  from public.o1ocards_categories where closed;
  return jsonb_build_object(
    'username',            p.username,
    'boosters',            p.boosters,
    'bonus_boosters',      p.bonus_boosters,
    'shop_enabled',        coalesce(public.o1ocards_cfg('shop_enabled'), 0) = 1,
    'golden_packs',        p.golden_packs,
    'unseen_rewards',      (select coalesce(jsonb_agg(jsonb_build_object('type_id', r.type_id, 'base_rarity', r.base_rarity, 'series', r.series) order by r.claimed_at), '[]'::jsonb)
                            from public.o1ocards_series_rewards r where r.user_id = p.id and not r.seen),
    'series_reward_min_size', coalesce(public.o1ocards_cfg('series_reward_min_size'), 0)::int,
    'pack_boosters',       public.o1ocards_cfg('stripe_pack_boosters')::int,
    'pack_price_cents',    public.o1ocards_cfg('stripe_pack_price_cents')::int,
    'cgv_version',         coalesce(public.o1ocards_cfg('cgv_version'), 1)::int,
    'max_boosters',        v_max,
    'regen_minutes',       v_min,
    'regen_amount',        public.o1ocards_cfg('regen_amount')::int,
    'boosters_opened',     p.boosters_opened,
    'next_refill_at',      case when p.boosters >= v_max then null
                                else p.boosters_updated_at + v_min * interval '1 minute' end,
    'coins',               p.coins,
    'coins_locked',        v_locked,
    'friend_requests',     (select count(*) from public.o1ocards_friendships f where f.addressee_id = p.id and f.status = 'pending'),
    'gold_rewards',        (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'type_id', g.type_id, 'seen', g.seen) order by g.id), '[]'::jsonb)
                            from public.o1ocards_gold_rewards g where g.user_id = p.id and g.opened_at is null),
    'active_category_id',  v_cat,
    'next_category',       v_next,
    'closed_categories',   v_closed,
    'cards_taken',         v_taken,
    'total_cards',         v_total,
    'direct_sell_price',   public.o1ocards_cfg('direct_sell_price')::int,
    'auction_minutes',     public.o1ocards_cfg('auction_minutes')::int,
    'auction_start_price', public.o1ocards_cfg('auction_start_price')::int,
    'server_now',          now()
  );
end $$;

-- ---------- Fonctions appelées par l'application ----------
create or replace function public.o1ocards_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.o1ocards_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();
  p := public.o1ocards_sync(auth.uid());
  return public.o1ocards_status_json(p);
end $$;

-- Tire le contenu d'un booster doré (défini dans o1ocards_golden_contents) dans une catégorie et l'attribue au joueur.
-- Renvoie la liste des cartes obtenues (vide si plus aucune carte de ces raretés n'est disponible).
create or replace function public.o1ocards_draw_golden(p_uid uuid, p_cat int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  gc   record;
  q    int;
  t2   int;
  tid  int;
  m    int;
  num  int;
  rows int;
  v_new boolean;
  v_base text;
  res  jsonb := '[]'::jsonb;
begin
  for gc in select rarity_id, quantity from public.o1ocards_golden_contents order by rarity_id loop
    for q in 1 .. gc.quantity loop
      t2 := 0;
      while t2 < 10 loop
        t2 := t2 + 1;
        select d2.o_type, d2.o_base, d2.o_series, d2.o_number into tid, v_base, m, num
        from public.o1ocards_draw_rarity(gc.rarity_id, p_cat) d2;
        exit when tid is null;
        v_new := not public.o1ocards_owns_card_rarity(p_uid, tid, public.o1ocards_rarity_id(num, m, tid, v_base));
        insert into public.o1ocards_cards (type_id, base_rarity, series, number, owner_id) values (tid, v_base, m, num, p_uid)
        on conflict (type_id, base_rarity, series, number) do nothing;
        get diagnostics rows = row_count;
        if rows = 1 then
          if v_new then perform public.o1ocards_auto_place_album(p_uid, tid, v_base, m, num); end if;
          res := res || jsonb_build_array(jsonb_build_object(
            'type_id', tid, 'base_rarity', v_base, 'series', m, 'number', num, 'rarity_id', public.o1ocards_rarity_id(num, m, tid, v_base), 'is_new', v_new
          ));
          exit;
        end if;
      end loop;
    end loop;
  end loop;

  -- Petite chance supplémentaire (indépendante du contenu garanti ci-dessus) d'une carte Unique (1/1) en plus
  if random() < coalesce(public.o1ocards_cfg('golden_unique_chance'), 0)::double precision then
    t2 := 0;
    while t2 < 10 loop
      t2 := t2 + 1;
      select d2.o_type, d2.o_base, d2.o_series, d2.o_number into tid, v_base, m, num
      from public.o1ocards_draw_rarity('unique', p_cat) d2;
      exit when tid is null;
      v_new := not public.o1ocards_owns_card_rarity(p_uid, tid, public.o1ocards_rarity_id(num, m, tid, v_base));
      insert into public.o1ocards_cards (type_id, base_rarity, series, number, owner_id) values (tid, v_base, m, num, p_uid)
      on conflict (type_id, base_rarity, series, number) do nothing;
      get diagnostics rows = row_count;
      if rows = 1 then
        if v_new then perform public.o1ocards_auto_place_album(p_uid, tid, v_base, m, num); end if;
        res := res || jsonb_build_array(jsonb_build_object(
          'type_id', tid, 'base_rarity', v_base, 'series', m, 'number', num, 'rarity_id', public.o1ocards_rarity_id(num, m, tid, v_base), 'is_new', v_new
        ));
        exit;
      end if;
    end loop;
  end if;

  return res;
end $$;

-- Ouvre un booster de la catégorie en cours. Chaque carte tirée n'existait pas encore : elle devient
-- la seule de son espèce, et elle est à toi. Quand la catégorie est épuisée, la suivante prend le relais.
-- (jit = off : le plan de ces requêtes est jugé coûteux par PostgreSQL, qui le compilerait à chaque appel pour ~35 ms de plus)

-- Tirage d'un booster : poids de chaque rareté pour les premières cartes (booster_common_slots : « cartes 1 à 3 »), pour la carte suivante
-- (booster_uncommon_slots : « carte 4 ») et pour toutes les autres (« carte 5 »). Une rareté à 0 n'est jamais tirée à cet emplacement. Ces
-- poids sont réglables dans l'onglet Raretés de l'admin ; l'identifiant d'une rareté n'a aucune importance.
alter table public.o1ocards_rarities add column if not exists weight_slots_1_3 double precision not null default 0 check (weight_slots_1_3 >= 0);
alter table public.o1ocards_rarities add column if not exists weight_slot_4    double precision not null default 0 check (weight_slot_4 >= 0);
alter table public.o1ocards_rarities add column if not exists weight_slot_5    double precision not null default 0 check (weight_slot_5 >= 0);
-- Poids de départ selon le NOM de la rareté (jamais selon son identifiant) : Commune : cartes 1 à 3 ; Peu commune : carte 4 et 10 sur la carte 5 ;
-- Rare 55, Super Rare 29, Ultra Rare 5, Art Rare 0,8, Unique 0,2 sur la carte 5 (total 100) ; toute autre rareté ordinaire 0,5. N'agit que tant
-- qu'AUCUN poids n'est réglé. Seule exception : les poids de départ de la toute première version (Peu commune 50, Rare 35, Super Rare 11, Ultra Rare 3)
-- sont remplacés par les nouveaux, mais uniquement si ces quatre raretés ont encore EXACTEMENT ces anciennes valeurs (un réglage de l'admin n'est
-- jamais écrasé).
create or replace function public.o1ocards_seed_rarity_weights()
returns void language plpgsql security definer set search_path = public as $$
declare v_old boolean;
begin
  if not exists (select 1 from public.o1ocards_rarities where weight_slots_1_3 > 0 or weight_slot_4 > 0 or weight_slot_5 > 0) then
    update public.o1ocards_rarities r set
      weight_slots_1_3 = case when n.k = 'commune' then 1 else 0 end,
      weight_slot_4    = case when n.k = 'peu commune' then 1 else 0 end,
      weight_slot_5    = case
        when r.kind = 'unique' then 0.2
        when r.kind <> 'range' then 0
        when n.k = 'commune' then 0
        when n.k = 'peu commune' then 10
        when n.k = 'rare' then 55
        when n.k = 'super rare' then 29
        when n.k = 'ultra rare' then 5
        when n.k in ('art rare', 'full art', 'fullart') then 0.8
        else 0.5 end
    from (select id, regexp_replace(lower(translate(trim(name), 'éèêëàâîïôöùûüç', 'eeeeaaiioouuuc')), '\s+', ' ', 'g') as k from public.o1ocards_rarities) n
    where n.id = r.id;
  end if;

  -- anciens poids de départ (50 / 35 / 11 / 3) jamais modifiés : on passe aux nouveaux (10 / 55 / 29 / 5)
  select bool_and(
           (n.k = 'peu commune' and r.weight_slots_1_3 = 0 and r.weight_slot_4 = 1 and r.weight_slot_5 = 50)
        or (n.k = 'rare'        and r.weight_slots_1_3 = 0 and r.weight_slot_4 = 0 and r.weight_slot_5 = 35)
        or (n.k = 'super rare'  and r.weight_slots_1_3 = 0 and r.weight_slot_4 = 0 and r.weight_slot_5 = 11)
        or (n.k = 'ultra rare'  and r.weight_slots_1_3 = 0 and r.weight_slot_4 = 0 and r.weight_slot_5 = 3))
    into v_old
  from public.o1ocards_rarities r
  join (select id, regexp_replace(lower(translate(trim(name), 'éèêëàâîïôöùûüç', 'eeeeaaiioouuuc')), '\s+', ' ', 'g') as k from public.o1ocards_rarities) n on n.id = r.id
  where r.kind = 'range' and n.k in ('peu commune', 'rare', 'super rare', 'ultra rare');
  if coalesce(v_old, false) then
    update public.o1ocards_rarities r set weight_slot_5 = case n.k when 'peu commune' then 10 when 'rare' then 55 when 'super rare' then 29 when 'ultra rare' then 5 end
    from (select id, regexp_replace(lower(translate(trim(name), 'éèêëàâîïôöùûüç', 'eeeeaaiioouuuc')), '\s+', ' ', 'g') as k from public.o1ocards_rarities) n
    where n.id = r.id and r.kind = 'range' and n.k in ('peu commune', 'rare', 'super rare', 'ultra rare');
  end if;
end $$;
revoke all on function public.o1ocards_seed_rarity_weights() from public, anon, authenticated;
select public.o1ocards_seed_rarity_weights();
delete from public.o1ocards_config where key like 'premium_weight_%';

-- ---------- Composition d'un booster : emplacements et poids par rareté ----------
-- Un booster est tiré carte après carte, dans l'ordre : les booster_common_slots premières cartes suivent les poids « cartes 1 à 3 » des raretés
-- (les Communes), les booster_uncommon_slots suivantes les poids « carte 4 » (les Peu communes), toutes les autres les poids « carte 5 ».
-- Pour chaque carte, on tire d'abord une RARETÉ selon ces poids, parmi celles qui ont encore des cartes dans la catégorie, puis une carte au hasard
-- parmi les cartes restantes de cette rareté (poids d'une série = cartes restantes x taille^exposant). La rareté « Unique » est une option comme les
-- autres : ses cartes sont les 1/1 (série 1), qui ne sortent donc que par ce poids (ou par le repli). Si aucune rareté n'est possible à un
-- emplacement, la carte est tirée parmi toutes les cartes encore disponibles.
drop function if exists public.o1ocards_booster_tier(text, text);
drop function if exists public.o1ocards_premium_weight(text);
drop function if exists public.o1ocards_series_pool(int, double precision);
drop function if exists public.o1ocards_pick_series(int, text, double precision);

-- Type d'emplacement de la carte numéro p_slot (1, 2, 3…) d'un booster : common, uncommon ou premium
create or replace function public.o1ocards_slot_class(p_slot int)
returns text language sql stable set search_path = public as $$
  select case
    when p_slot <= coalesce(public.o1ocards_cfg('booster_common_slots'), 3)::int then 'common'
    when p_slot <= coalesce(public.o1ocards_cfg('booster_common_slots'), 3)::int + coalesce(public.o1ocards_cfg('booster_uncommon_slots'), 1)::int then 'uncommon'
    else 'premium'
  end
$$;

-- Toutes les séries d'une catégorie qui ont encore des cartes : (type, rareté de base, série), cartes restantes et poids de tirage
create or replace function public.o1ocards_series_pool(p_cat int, p_e double precision)
returns table (type_id int, base text, g int, remaining int, w double precision)
language sql stable security definer set search_path = public as $$
  select ty.id, cf.rarity_id, g, (g - coalesce(t.taken, 0))::int,
         (g - coalesce(t.taken, 0)) * power(g::double precision, p_e)
  from public.o1ocards_types ty
  cross join lateral public.o1ocards_type_config(ty.id) cf
  cross join lateral generate_series(1, cf.smax) g
  left join public.o1ocards_series_taken t on t.type_id = ty.id and t.base_rarity = cf.rarity_id and t.series = g
  where ty.category_id = p_cat and g > coalesce(t.taken, 0)
$$;

-- Tire une série (type, rareté de base, numéro de série) pour un emplacement : p_class = common, uncommon, premium ou any (toutes les cartes).
-- Ne renvoie aucune ligne si l'emplacement n'a plus de carte.
-- p_exclude : cartes (types) à ne pas tirer ; sert aux Communes d'un booster, qui doivent être des cartes différentes
create or replace function public.o1ocards_pick_series(p_cat int, p_class text, p_e double precision, p_exclude int[] default '{}')
returns table (type_id int, base text, g int)
language plpgsql volatile security definer set search_path = public set jit = off as $$
declare v_opt text; v_uid text;
begin
  select id into v_uid from public.o1ocards_rarities where kind = 'unique' limit 1;
  if p_class <> 'any' then
    with sp as materialized (select * from public.o1ocards_series_pool(p_cat, p_e) x where x.type_id <> all (coalesce(p_exclude, '{}'))),
    pool as (
      select sp.base as opt, sum(sp.remaining)::bigint as rem from sp where sp.g > 1 group by sp.base
      union all
      select v_uid, count(*)::bigint from sp where sp.g = 1 and v_uid is not null
    ),
    wts as (
      select pool.opt,
             case p_class when 'common' then r.weight_slots_1_3 when 'uncommon' then r.weight_slot_4 else r.weight_slot_5 end as wt
      from pool join public.o1ocards_rarities r on r.id = pool.opt
      where pool.rem > 0
    ),
    pos as (select wts.opt, wts.wt, sum(wts.wt) over (order by wts.opt) as cs from wts where wts.wt > 0),
    tot as (select sum(pos.wt) as tw, random() as rr from pos)
    select pos.opt into v_opt
    from pos cross join tot
    where tot.tw > 0 and pos.cs > tot.rr * tot.tw
    order by pos.cs limit 1;
    if v_opt is null then return; end if;
  end if;

  return query
  with s as materialized (
    select sp.type_id, sp.base, sp.g, sp.w
    from public.o1ocards_series_pool(p_cat, p_e) sp
    where sp.type_id <> all (coalesce(p_exclude, '{}'))
      and case when p_class = 'any' then true
               when v_opt = v_uid then sp.g = 1
               else sp.base = v_opt and sp.g > 1 end
  ),
  t as (select sum(s.w) as tw, random() as rr from s)
  select z.type_id, z.base, z.g
  from (select s.*, sum(s.w) over (order by s.type_id, s.base, s.g) as cs from s) z
  cross join t
  where t.tw > 0 and z.cs > t.rr * t.tw
  order by z.cs, z.type_id, z.base, z.g
  limit 1;
end $$;

-- Une carte nouvelle (le joueur n'avait rien dans cet emplacement de l'album) est placée d'office dans l'album, à son emplacement
create or replace function public.o1ocards_auto_place_album(p_uid uuid, p_type int, p_base text, p_series int, p_number int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.o1ocards_album_picks (user_id, type_id, rarity_id, base_rarity, series, number)
  values (p_uid, p_type, public.o1ocards_rarity_id(p_number, p_series, p_type, p_base), p_base, p_series, p_number)
  on conflict (user_id, type_id, rarity_id) do nothing;
  perform public.o1ocards_check_type_reward(p_uid, p_type);   -- la carte est peut-être maintenant complète : booster Gold
end $$;

revoke all on function public.o1ocards_slot_class(int) from public, anon, authenticated;
revoke all on function public.o1ocards_series_pool(int, double precision) from public, anon, authenticated;
revoke all on function public.o1ocards_pick_series(int, text, double precision, int[]) from public, anon, authenticated;
revoke all on function public.o1ocards_auto_place_album(uuid, int, text, int, int) from public, anon, authenticated;

-- Réglage des poids de tirage d'une rareté (onglet Raretés de l'admin)
create or replace function public.o1ocards_admin_set_rarity_weights(p_password text, p_id text, p_w13 double precision, p_w4 double precision, p_w5 double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if p_w13 is null or p_w4 is null or p_w5 is null or least(p_w13, p_w4, p_w5) < 0 or greatest(p_w13, p_w4, p_w5) > 1000000 then
    raise exception 'invalid_weight';
  end if;
  update public.o1ocards_rarities set weight_slots_1_3 = p_w13, weight_slot_4 = p_w4, weight_slot_5 = p_w5
  where id = p_id and kind in ('range', 'unique');
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.o1ocards_admin_set_rarity_weights(text, text, double precision, double precision, double precision) from public, anon;
grant execute on function public.o1ocards_admin_set_rarity_weights(text, text, double precision, double precision, double precision) to authenticated;

create or replace function public.o1ocards_open_booster()
returns jsonb language plpgsql security definer set search_path = public set jit = off as $$
declare
  uid       uuid := auth.uid();
  p         public.o1ocards_profiles;
  v_max     int;
  was_full  boolean;
  use_bonus boolean;
  v_cat     int;
  n_cards   int;
  e         double precision;
  v_class   text;
  v_seen    int[] := '{}';   -- cartes déjà tirées parmi les Communes de ce booster
  tid       int;
  m         int;
  avail     int;
  k         int;
  num       int;
  got       int;
  tries     int;
  rows      int;
  exhausted boolean;
  res       jsonb;
  v_golden  boolean := false;
  gc        record;
  q         int;
  t2        int;
  d         record;
  v_new     boolean;
  v_base    text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  p := public.o1ocards_sync(uid);
  if p.boosters <= 0 and p.bonus_boosters <= 0 then raise exception 'no_boosters'; end if;
  use_bonus := p.boosters <= 0;   -- le stock gratuit est utilisé en premier : la recharge repart plus vite

  v_max    := public.o1ocards_cfg('max_boosters')::int;
  was_full := p.boosters >= v_max;
  n_cards  := public.o1ocards_cfg('cards_per_booster')::int;
  e        := public.o1ocards_cfg('rarity_exponent')::double precision;

  <<category_loop>>
  loop
    v_cat := public.o1ocards_active_category();
    if v_cat is null then raise exception 'pool_empty'; end if;
    got := 0; tries := 0; exhausted := false; res := '[]'::jsonb; v_golden := false;

    -- Booster doré : chance très faible, contenu défini dans o1ocards_golden_contents
    if random() < coalesce(public.o1ocards_cfg('golden_booster_chance'), 0)::double precision then
      v_golden := true;
      res := public.o1ocards_draw_golden(uid, v_cat);
      got := jsonb_array_length(res);
      if got = 0 then v_golden := false; end if;   -- contenu doré indisponible : booster normal
    end if;

    while not v_golden and got < n_cards and tries < n_cards * 25 loop
      tries := tries + 1;

      -- Emplacement de cette carte : les premières sont Communes, puis Peu communes, les suivantes Premium (voir pick_series)
      v_class := public.o1ocards_slot_class(got + 1);
      tid := null; v_base := null; m := null;
      -- Les Communes d'un booster sont des cartes DIFFÉRENTES : jamais de doublon ni de triplon d'une même carte
      select ps.type_id, ps.base, ps.g into tid, v_base, m from public.o1ocards_pick_series(v_cat, v_class, e, case when v_class = 'common' then v_seen else '{}'::int[] end) ps;
      if tid is null and v_class = 'common' and cardinality(v_seen) > 0 then   -- plus assez de cartes différentes avec des Communes : un doublon plutôt qu'un booster incomplet
        select ps.type_id, ps.base, ps.g into tid, v_base, m from public.o1ocards_pick_series(v_cat, v_class, e) ps;
      end if;
      if tid is null then   -- plus de carte dans ce palier : on tire parmi toutes les cartes encore disponibles
        select ps.type_id, ps.base, ps.g into tid, v_base, m from public.o1ocards_pick_series(v_cat, 'any', e) ps;
        if tid is null then exhausted := true; exit; end if;
      end if;

      select m - coalesce((select taken from public.o1ocards_series_taken where type_id = tid and base_rarity = v_base and series = m), 0) into avail;
      continue when avail <= 0;

      -- Une des cartes encore disponibles de cette série de cette rareté de ce type, au hasard
      k := floor(random() * avail)::int;
      select x into num
      from generate_series(1, m) x
      where not exists (select 1 from public.o1ocards_cards c where c.type_id = tid and c.base_rarity = v_base and c.series = m and c.number = x)
      order by x
      offset k limit 1;
      continue when num is null;

      v_new := not public.o1ocards_owns_card_rarity(uid, tid, public.o1ocards_rarity_id(num, m, tid, v_base));
      insert into public.o1ocards_cards (type_id, base_rarity, series, number, owner_id) values (tid, v_base, m, num, uid)
      on conflict (type_id, base_rarity, series, number) do nothing;
      get diagnostics rows = row_count;
      continue when rows = 0;               -- quelqu'un d'autre vient de la tirer : on retente
      if v_new then perform public.o1ocards_auto_place_album(uid, tid, v_base, m, num); end if;   -- nouvelle carte : directement dans l'album

      got := got + 1;
      if v_class = 'common' then v_seen := array_append(v_seen, tid); end if;
      res := res || jsonb_build_array(jsonb_build_object(
        'type_id', tid, 'base_rarity', v_base, 'series', m, 'number', num, 'rarity_id', public.o1ocards_rarity_id(num, m, tid, v_base), 'is_new', v_new
      ));
    end loop;

    exit category_loop when got > 0;
    if exhausted then
      update public.o1ocards_categories set closed = true where id = v_cat;   -- catégorie terminée : on passe à la suivante
      continue category_loop;
    end if;
    raise exception 'try_again';
  end loop category_loop;

  -- Catégorie complètement tirée : elle se ferme, la suivante s'ouvre pour le prochain booster
  if public.o1ocards_category_taken(v_cat) >= public.o1ocards_category_total(v_cat) then
    update public.o1ocards_categories set closed = true where id = v_cat;
  end if;

  update public.o1ocards_profiles
  set boosters            = boosters - case when use_bonus then 0 else 1 end,
      bonus_boosters      = bonus_boosters - case when use_bonus then 1 else 0 end,
      boosters_opened     = boosters_opened + 1,
      boosters_updated_at = case when was_full and not use_bonus then now() else boosters_updated_at end
  where id = uid returning * into p;

  return jsonb_build_object('cards', res, 'golden', v_golden, 'category_id', v_cat, 'status', public.o1ocards_status_json(p));
end $$;

-- Ouvre un pack doré gagné en complétant une série (catégorie en cours). Ne consomme aucun booster.
create or replace function public.o1ocards_open_golden_pack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.o1ocards_profiles; v_cat int; res jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  p := public.o1ocards_sync(uid);
  if p.golden_packs <= 0 then raise exception 'no_golden_pack'; end if;
  v_cat := public.o1ocards_active_category();
  if v_cat is null then raise exception 'pool_empty'; end if;
  res := public.o1ocards_draw_golden(uid, v_cat);
  if jsonb_array_length(res) = 0 then raise exception 'pool_empty'; end if;
  if public.o1ocards_category_taken(v_cat) >= public.o1ocards_category_total(v_cat) then
    update public.o1ocards_categories set closed = true where id = v_cat;
  end if;
  update public.o1ocards_profiles set golden_packs = golden_packs - 1 where id = uid returning * into p;
  return jsonb_build_object('cards', res, 'golden', true, 'category_id', v_cat, 'status', public.o1ocards_status_json(p));
end $$;

-- Marque les annonces de séries complétées comme vues
create or replace function public.o1ocards_ack_rewards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.o1ocards_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.o1ocards_series_rewards set seen = true where user_id = auth.uid() and not seen;
  p := public.o1ocards_sync(auth.uid());
  return public.o1ocards_status_json(p);
end $$;

-- Mes cartes (filtres catégorie / type / rareté, tri, pagination)
-- Ma collection (page « Mes cartes »), paginée. Une tuile par carte à numéro VISIBLE ; une seule pile par (type, rareté)
-- pour les cartes à numéro masqué (elles sont indiscernables pour le joueur) : stack_qty = nombre de cartes de la pile,
-- stack_free = celles qu'on peut vendre (ni dans l'album ni en vente). La carte portée par une pile est la plus grande série.
-- total = nombre de tuiles (pagination), cards_total = nombre de cartes (somme des quantités).
drop function if exists public.o1ocards_list_collection(int, int, text, text, int, int);
create or replace function public.o1ocards_list_collection(
  p_category int  default null,
  p_type     int  default null,
  p_rarity   text default null,
  p_sort     text default 'series',
  p_limit    int  default 60,
  p_offset   int  default 0
)
returns table (
  card_type    int,
  card_base    text,
  card_series  int,
  card_number  int,
  rarity_id    text,
  obtained_at  timestamptz,
  listing_id   bigint,
  listing_kind text,
  is_stack     boolean,
  stack_qty    int,
  stack_free   int,
  in_album     boolean,
  total        bigint,
  cards_total  bigint
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_unique text; v_alpha text; v_omega text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();
  select r.id into v_unique from public.o1ocards_rarities r where r.kind = 'unique' limit 1;
  select r.id into v_alpha  from public.o1ocards_rarities r where r.kind = 'alpha'  limit 1;
  select r.id into v_omega  from public.o1ocards_rarities r where r.kind = 'omega'  limit 1;
  return query
  with mine as (
    select c.type_id, c.base_rarity, c.series, c.number, c.obtained_at, ty.position as tpos
    from public.o1ocards_cards c join public.o1ocards_types ty on ty.id = c.type_id
    where c.owner_id = uid
      and (p_category is null or ty.category_id = p_category)
      and (p_type is null or c.type_id = p_type)
  ),
  pinfo as (   -- une seule évaluation par (type, rareté de base, série) : numéro masqué ou non
    select d.type_id, d.base_rarity, d.series, not public.o1ocards_number_visible(d.type_id, d.base_rarity, d.series) as hidden
    from (select distinct m.type_id, m.base_rarity, m.series from mine m) d
  ),
  cardrows as (
    select m.type_id, m.base_rarity, m.series, m.number, m.obtained_at, m.tpos, pi.hidden,
           case when m.series = 1 then v_unique
                when not pi.hidden and m.number = 1 then v_alpha
                when not pi.hidden and m.number = m.series then v_omega
                else m.base_rarity end as rid,
           (a.user_id is not null) as in_album, l.id as lid, l.kind as lkind
    from mine m
    join pinfo pi on pi.type_id = m.type_id and pi.base_rarity = m.base_rarity and pi.series = m.series
    left join public.o1ocards_album_picks a on a.user_id = uid and a.type_id = m.type_id and a.base_rarity = m.base_rarity and a.series = m.series and a.number = m.number
    left join public.o1ocards_listings l on l.type_id = m.type_id and l.base_rarity = m.base_rarity and l.series = m.series and l.number = m.number and l.status = 'active'
  ),
  tiles as (
    select r.type_id, r.base_rarity, r.series, r.number, r.obtained_at, r.tpos, r.rid, r.lid, r.lkind, false as is_stack,
           1 as qty, case when r.in_album or r.lid is not null then 0 else 1 end as free, r.in_album
    from cardrows r
    where not r.hidden and (p_rarity is null or r.rid = p_rarity)
    union all
    select r.type_id,
           (array_agg(r.base_rarity order by r.series desc, r.number desc, r.base_rarity))[1],
           (array_agg(r.series order by r.series desc, r.number desc, r.base_rarity))[1],
           (array_agg(r.number order by r.series desc, r.number desc, r.base_rarity))[1],
           max(r.obtained_at), min(r.tpos), r.rid, null::bigint, null::text, true,
           count(*)::int, (count(*) filter (where not r.in_album and r.lid is null))::int, bool_or(r.in_album)
    from cardrows r
    where r.hidden and (p_rarity is null or r.rid = p_rarity)
    group by r.type_id, r.rid
  )
  select t.type_id, t.base_rarity, t.series, t.number, t.rid, t.obtained_at, t.lid, t.lkind, t.is_stack, t.qty, t.free, t.in_album,
         count(*) over (), sum(t.qty) over ()
  from tiles t
  left join public.o1ocards_rarities r on r.id = t.rid
  order by
    case when p_sort = 'rarity' then r.sort_order end asc nulls last,
    case when p_sort = 'recent' then t.obtained_at end desc,
    t.tpos, t.type_id, t.series asc, t.number asc, t.base_rarity
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end $$;

drop function if exists public.o1ocards_type_state(int, int);

-- Statistiques de collection : par catégorie, par type et par rareté (pour la catégorie demandée)
create or replace function public.o1ocards_my_stats(p_category int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  v_cat     int  := coalesce(p_category, public.o1ocards_active_category(), (select min(id) from public.o1ocards_categories));
  v_unique  text;
  v_alpha   text;
  v_omega   text;
  by_rarity jsonb;
  v_owned   bigint;
  v_started bigint;
  v_rarest  jsonb;
  v_cats    jsonb;
  v_types   jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();

  select id into v_unique from public.o1ocards_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.o1ocards_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.o1ocards_rarities where kind = 'omega'  limit 1;

  -- Totaux par rareté AFFICHÉE. Chaque rareté de base d'un type a ses séries 1..sm ; avec kk = min(séries numérotées, sm) :
  --   Unique : 1 (la série 1) ; Alpha et Omega : kk - 1 chacune (séries 2..kk, à numéro visible) ;
  --   rareté de base : les cartes 2..m-1 des séries visibles (somme de m-2 pour m = 2..kk) + toutes les cartes des séries
  --   masquées (somme de m pour m = max(kk+1, 2)..sm). La somme des raretés égale toujours le nombre de cartes.
  with cf as materialized (
    select ty.id as type_id, c.rarity_id as base, c.smax as sm, least(c.numbered::bigint, c.smax)::int as kk
    from public.o1ocards_types ty
    cross join lateral public.o1ocards_type_config(ty.id) c
    where ty.category_id = v_cat
  ),
  totals as (
    select base as id,
           (case when kk >= 2 then ((kk - 2)::bigint * (kk - 1)) / 2 else 0 end
            + case when sm >= greatest(kk + 1, 2)
                   then (sm::bigint * (sm + 1)) / 2 - ((greatest(kk + 1, 2) - 1)::bigint * greatest(kk + 1, 2)) / 2
                   else 0 end)::bigint as n
    from cf
    union all select v_unique, 1::bigint from cf where v_unique is not null
    union all select v_alpha,  greatest(kk - 1, 0)::bigint from cf where v_alpha is not null
    union all select v_omega,  greatest(kk - 1, 0)::bigint from cf where v_omega is not null
  ),
  tot as (select id, sum(n)::bigint as n from totals group by id),
  own as (
    select public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) as id, count(*)::bigint as n
    from public.o1ocards_cards c
    join public.o1ocards_types ty on ty.id = c.type_id
    where c.owner_id = uid and ty.category_id = v_cat
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'owned', coalesce(own.n, 0), 'total', coalesce(tot.n, 0)
         ) order by r.sort_order)
  into by_rarity
  from public.o1ocards_rarities r
  left join tot on tot.id = r.id
  left join own on own.id = r.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'total', public.o1ocards_category_total(c.id),
           'taken', public.o1ocards_category_taken(c.id),
           'owned', (select count(*) from public.o1ocards_cards k join public.o1ocards_types ty on ty.id = k.type_id
                     where k.owner_id = uid and ty.category_id = c.id)
         ) order by c.position, c.id), '[]'::jsonb)
  into v_cats
  from public.o1ocards_categories c;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ty.id,
           'category_id', ty.category_id,
           'total', (select coalesce(sum(c.smax::bigint * (c.smax + 1) / 2), 0) from public.o1ocards_type_config(ty.id) c),
           'owned', (select count(*) from public.o1ocards_cards k where k.owner_id = uid and k.type_id = ty.id)
         ) order by ty.category_id, ty.position, ty.id), '[]'::jsonb)
  into v_types
  from public.o1ocards_types ty
  join public.o1ocards_categories c on c.id = ty.category_id;

  select count(*), count(distinct (type_id, series)) into v_owned, v_started
  from public.o1ocards_cards where owner_id = uid;

  select jsonb_build_object('type_id', q.type_id, 'base_rarity', q.base_rarity, 'series', q.series, 'number', q.number, 'rarity_id', q.rid)
  into v_rarest
  from (
    select c.type_id, c.base_rarity, c.series, c.number, public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) as rid
    from public.o1ocards_cards c where c.owner_id = uid
  ) q
  left join public.o1ocards_rarities r on r.id = q.rid
  order by r.sort_order asc nulls last, q.series asc, q.number asc, q.type_id
  limit 1;

  return jsonb_build_object(
    'category_id',    v_cat,
    'total_cards',    public.o1ocards_category_total(v_cat),
    'unique_owned',   v_owned,
    'series_started', v_started,
    'by_rarity',      coalesce(by_rarity, '[]'::jsonb),
    'categories',     v_cats,
    'types',          v_types,
    'rarest',         v_rarest
  );
end $$;

-- Chances de tirage de la catégorie (en cours par défaut), calculées sur les cartes ENCORE disponibles.
-- Pour chaque rareté : cartes restantes, part des tirages, chance qu'un booster en contienne au moins une.
create or replace function public.o1ocards_draw_odds(p_category int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cat     int := coalesce(p_category, public.o1ocards_active_category());
  e         double precision := public.o1ocards_cfg('rarity_exponent')::double precision;
  n_cards   int := public.o1ocards_cfg('cards_per_booster')::int;
  n_com     int;
  n_unc     int;
  n_pre     int;
  v_unique  text;
  v_alpha   text;
  v_omega   text;
  v_res     jsonb;
  v_golden  jsonb;
begin
  if v_cat is null or not exists (select 1 from public.o1ocards_categories where id = v_cat) then
    return jsonb_build_object('category_id', null, 'by_rarity', '[]'::jsonb);
  end if;
  select id into v_unique from public.o1ocards_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.o1ocards_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.o1ocards_rarities where kind = 'omega'  limit 1;

  -- Composition d'un booster : premières cartes, carte suivante, le reste (mêmes règles que open_booster)
  n_com := least(greatest(coalesce(public.o1ocards_cfg('booster_common_slots'), 3)::int, 0), n_cards);
  n_unc := least(greatest(coalesce(public.o1ocards_cfg('booster_uncommon_slots'), 1)::int, 0), n_cards - n_com);
  n_pre := n_cards - n_com - n_unc;

  -- s = une ligne par (type, rareté de base, série) avec le nombre de cartes restantes ; vis = numéro visible (séries 1..numbered) :
  -- Alpha (1/m) et Omega (m/m) existent seulement alors. parts = les cartes par rareté AFFICHÉE ; is_first = carte 1/1 (rareté Unique).
  with cf as materialized (
    select ty.id as type_id, c.rarity_id as base, c.smax, c.numbered
    from public.o1ocards_types ty cross join lateral public.o1ocards_type_config(ty.id) c
    where ty.category_id = v_cat
  ),
  s as (
    select cf.type_id, cf.base as rid, g as m, (g <= cf.numbered) as vis, (g - coalesce(t.taken, 0)) as avail,
           (case when a.type_id is not null then 1 else 0 end) as a_taken,
           (case when o.type_id is not null then 1 else 0 end) as o_taken
    from cf
    cross join lateral generate_series(1, cf.smax) g
    left join public.o1ocards_series_taken t on t.type_id = cf.type_id and t.base_rarity = cf.base and t.series = g
    left join public.o1ocards_cards a on g > 1 and a.type_id = cf.type_id and a.base_rarity = cf.base and a.series = g and a.number = 1
    left join public.o1ocards_cards o on g > 1 and o.type_id = cf.type_id and o.base_rarity = cf.base and o.series = g and o.number = g
  ),
  parts as (
    select v_unique as id, rid as base, true as is_first, greatest(avail, 0)::bigint as remaining, 1::bigint as total, greatest(avail, 0)::double precision as w
      from s where m = 1 and v_unique is not null
    union all
    select v_alpha, rid, false, (1 - a_taken)::bigint, 1::bigint, (1 - a_taken) * power(m::double precision, e)
      from s where m > 1 and vis and v_alpha is not null
    union all
    select v_omega, rid, false, (1 - o_taken)::bigint, 1::bigint, (1 - o_taken) * power(m::double precision, e)
      from s where m > 1 and vis and v_omega is not null
    union all
    select rid, rid, false,
           (case when vis then greatest(avail - 2 + a_taken + o_taken, 0) else greatest(avail, 0) end)::bigint,
           (case when vis then m - 2 else m end)::bigint,
           (case when vis then greatest(avail - 2 + a_taken + o_taken, 0) else greatest(avail, 0) end) * power(m::double precision, e)
      from s where m > 1
  ),
  -- repli : toutes les cartes restantes
  any_pool as (select id, sum(w) as w from parts group by id having sum(w) > 0),
  any_tot as (select coalesce(sum(w), 0) as tw from any_pool),
  -- options de tirage : chaque rareté ordinaire (sans ses 1/1) et la rareté Unique (les 1/1 de toutes les raretés)
  opt_pool as (
    select base as opt, id, sum(w) as w from parts where not is_first group by base, id having sum(w) > 0
    union all
    select v_unique as opt, id, sum(w) from parts where is_first group by id having sum(w) > 0
  ),
  opt_tot as (select opt, sum(w) as tw from opt_pool group by opt),
  cls(class, n) as (values ('common', n_com), ('uncommon', n_unc), ('premium', n_pre)),
  slot_w as (
    select c.class, c.n, o.opt,
           case c.class when 'common' then r.weight_slots_1_3 when 'uncommon' then r.weight_slot_4 else r.weight_slot_5 end as wt
    from cls c cross join opt_tot o join public.o1ocards_rarities r on r.id = o.opt
  ),
  cls_tot as (select class, n, sum(wt) as sw from slot_w group by class, n),
  -- chance qu'UNE carte d'un emplacement de ce type soit de cette rareté affichée
  mix as (
    select c.class, c.n, p.id,
           case when coalesce(ct.sw, 0) > 0
                then coalesce((select sum(sw2.wt / ct.sw * op.w / ot.tw)
                               from slot_w sw2
                               join opt_pool op on op.opt = sw2.opt and op.id = p.id
                               join opt_tot ot on ot.opt = sw2.opt
                               where sw2.class = c.class), 0)
                else p.w / nullif(at.tw, 0)
           end as p
    from cls c cross join any_pool p cross join any_tot at left join cls_tot ct on ct.class = c.class
  ),
  expd as (
    select id, sum(n * p) as expected, 1 - exp(sum(n * ln(greatest(1 - least(p, 1), 1e-12)))) as at_least
    from mix group by id
  ),
  agg as (select id, sum(remaining)::bigint as remaining, sum(total)::bigint as total from parts group by id)
  select jsonb_build_object(
    'by_rarity', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'remaining', coalesce(a.remaining, 0),
               'total', coalesce(a.total, 0),
               'share', case when n_cards > 0 then coalesce(x.expected, 0) / n_cards else 0 end,
               'per_booster', coalesce(x.at_least, 0)
             ) order by r.sort_order)
      from public.o1ocards_rarities r
      left join agg a on a.id = r.id
      left join expd x on x.id = r.id), '[]'::jsonb),
    -- pour chaque type d'emplacement, les raretés possibles et leur chance (somme = 1)
    'slot_options', (
      select jsonb_object_agg(z.class, z.opts) from (
        select sw.class, coalesce(jsonb_agg(jsonb_build_object('id', sw.opt, 'p', sw.wt / ct.sw) order by sw.wt desc, sw.opt), '[]'::jsonb) as opts
        from slot_w sw join cls_tot ct on ct.class = sw.class and ct.sw > 0
        where sw.wt > 0 group by sw.class) z)
  ) into v_res;

  select jsonb_build_object(
           'chance', coalesce(public.o1ocards_cfg('golden_booster_chance'), 0),
           'unique_chance', coalesce(public.o1ocards_cfg('golden_unique_chance'), 0),
           'contents', coalesce((select jsonb_agg(jsonb_build_object('rarity_id', rarity_id, 'quantity', quantity) order by rarity_id)
                                 from public.o1ocards_golden_contents), '[]'::jsonb))
  into v_golden;

  return jsonb_build_object(
    'category_id',       v_cat,
    'exponent',          e,
    'cards_per_booster', n_cards,
    'pool_left',         public.o1ocards_category_total(v_cat) - public.o1ocards_category_taken(v_cat),
    'slots',             jsonb_build_object('common', n_com, 'uncommon', n_unc, 'premium', n_pre),
    'by_rarity',         v_res -> 'by_rarity',
    'slot_options',      coalesce(v_res -> 'slot_options', '{}'::jsonb),
    'golden',            v_golden
  );
end $$;

create or replace function public.o1ocards_set_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_username, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) < 2 or char_length(v) > 24 then raise exception 'invalid_username'; end if;
  perform public.o1ocards_ensure_profile(auth.uid());
  update public.o1ocards_profiles set username = v where id = auth.uid();
  return v;
end $$;

-- ---------- Marché ----------

-- Revente directe : la carte est retirée du jeu pour de bon, tu reçois des pièces.
-- Refusée pour une catégorie terminée : la progression est définitive.
drop function if exists public.o1ocards_sell_direct(int, int, int);
create or replace function public.o1ocards_sell_direct(p_type int, p_base text, p_series int, p_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_price int  := public.o1ocards_cfg('direct_sell_price')::int;
  p       public.o1ocards_profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  select owner_id into v_owner from public.o1ocards_cards
  where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.o1ocards_listings
             where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';
  end if;
  if exists (select 1 from public.o1ocards_album_picks
             where user_id = uid and type_id = p_type and base_rarity = p_base and series = p_series and number = p_number) then
    raise exception 'card_in_album';   -- une carte placée dans l'album ne peut pas être vendue
  end if;
  if exists (select 1 from public.o1ocards_types t join public.o1ocards_categories c on c.id = t.category_id
             where t.id = p_type and c.closed) then
    raise exception 'category_closed';
  end if;
  -- La carte est retirée du jeu pour de bon : on garde sa ligne, sans propriétaire, donc elle reste « tirée » et ne peut plus
  -- jamais être redonnée par un booster. Favoris et offres en attente sur cette carte n'ont plus d'objet.
  update public.o1ocards_cards set owner_id = null, retired_at = now()
  where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  delete from public.o1ocards_album_picks where user_id = uid and type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  delete from public.o1ocards_favorites where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  update public.o1ocards_offers set status = 'cancelled', responded_at = now()
  where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number and status = 'pending';
  update public.o1ocards_profiles set coins = coins + v_price where id = uid returning * into p;
  return jsonb_build_object('status', public.o1ocards_status_json(p));
end $$;

-- Mise en vente : achat direct (prix libre) ou enchère (durée et prix de départ fixés dans la config)
drop function if exists public.o1ocards_list_card(int, int, int, text, int);
create or replace function public.o1ocards_list_card(p_type int, p_base text, p_series int, p_number int, p_kind text, p_price int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_price int;
  v_end   timestamptz;
  v_id    bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  select owner_id into v_owner from public.o1ocards_cards
  where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.o1ocards_listings
             where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';
  end if;
  if exists (select 1 from public.o1ocards_album_picks
             where user_id = uid and type_id = p_type and base_rarity = p_base and series = p_series and number = p_number) then
    raise exception 'card_in_album';   -- une carte placée dans l'album ne peut pas être vendue
  end if;

  if p_kind = 'buy_now' then
    if p_price is null or p_price < 1 or p_price > 100000000 then raise exception 'invalid_price'; end if;
    v_price := p_price;
  elsif p_kind = 'auction' then
    v_price := public.o1ocards_cfg('auction_start_price')::int;
    v_end   := now() + public.o1ocards_cfg('auction_minutes')::int * interval '1 minute';
  else
    raise exception 'invalid_kind';
  end if;

  insert into public.o1ocards_listings (type_id, base_rarity, series, number, seller_id, kind, price, ends_at)
  values (p_type, p_base, p_series, p_number, uid, p_kind, v_price, v_end)
  returning id into v_id;
  return jsonb_build_object('listing_id', v_id);
end $$;

create or replace function public.o1ocards_buy_now(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l public.o1ocards_listings; p public.o1ocards_profiles; bal bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  select * into l from public.o1ocards_listings where id = p_id for update;
  if not found or l.status <> 'active' then raise exception 'listing_unavailable'; end if;
  if l.kind <> 'buy_now' then raise exception 'invalid_kind'; end if;
  if l.seller_id = uid then raise exception 'own_listing'; end if;

  perform 1 from public.o1ocards_profiles where id in (uid, l.seller_id) order by id for update;
  select coins into bal from public.o1ocards_profiles where id = uid;
  if bal < l.price then raise exception 'insufficient_coins'; end if;

  update public.o1ocards_profiles set coins = coins - l.price where id = uid returning * into p;
  update public.o1ocards_profiles set coins = coins + l.price where id = l.seller_id;
  update public.o1ocards_cards set owner_id = uid, obtained_at = now()
  where type_id = l.type_id and base_rarity = l.base_rarity and series = l.series and number = l.number and owner_id = l.seller_id;
  if not found then raise exception 'listing_unavailable'; end if;
  delete from public.o1ocards_favorites where user_id = uid and type_id = l.type_id and base_rarity = l.base_rarity and series = l.series and number = l.number;
  delete from public.o1ocards_album_picks where user_id = l.seller_id and type_id = l.type_id and base_rarity = l.base_rarity and series = l.series and number = l.number;
  update public.o1ocards_listings
  set status = 'sold', buyer_id = uid, final_price = l.price, closed_at = now() where id = l.id;
  return jsonb_build_object('status', public.o1ocards_status_json(p));
end $$;

-- Annulation d'une annonce (impossible si une enchère a reçu des offres)
create or replace function public.o1ocards_cancel_listing(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l public.o1ocards_listings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();
  select * into l from public.o1ocards_listings where id = p_id for update;
  if not found or l.status <> 'active' then raise exception 'listing_unavailable'; end if;
  if l.seller_id <> uid then raise exception 'not_owner'; end if;
  if l.kind = 'auction' and l.bid_count > 0 then raise exception 'has_bids'; end if;
  update public.o1ocards_listings set status = 'cancelled', closed_at = now() where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

-- Enchère : la mise est bloquée tant que tu es en tête, et rendue si quelqu'un te dépasse.
-- Une mise dans la dernière minute remet le compteur à 1 minute.
create or replace function public.o1ocards_place_bid(p_id bigint, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid      uuid := auth.uid();
  l        public.o1ocards_listings;
  p        public.o1ocards_profiles;
  inc      int := public.o1ocards_cfg('auction_min_increment')::int;
  ext      int := public.o1ocards_cfg('auction_extend_seconds')::int;
  min_next int;
  bal      bigint;
  need     bigint;
  new_end  timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  select * into l from public.o1ocards_listings where id = p_id for update;
  if not found or l.status <> 'active' then return jsonb_build_object('error', 'auction_ended'); end if;
  if l.kind <> 'auction' then raise exception 'invalid_kind'; end if;
  if l.ends_at <= now() then
    perform public.o1ocards_settle_due();
    return jsonb_build_object('error', 'auction_ended');
  end if;
  if l.seller_id = uid then raise exception 'own_listing'; end if;

  min_next := case when l.current_bid is null then l.price else l.current_bid + inc end;
  if p_amount is null or p_amount < min_next then
    raise exception 'bid_too_low:%', min_next;
  end if;

  perform 1 from public.o1ocards_profiles
  where id in (uid, coalesce(l.current_bidder, uid)) order by id for update;
  select coins into bal from public.o1ocards_profiles where id = uid;
  need := p_amount - case when l.current_bidder = uid then l.current_bid else 0 end;
  if bal < need then raise exception 'insufficient_coins'; end if;

  if l.current_bidder is not null and l.current_bidder <> uid then
    update public.o1ocards_profiles set coins = coins + l.current_bid where id = l.current_bidder;
  end if;
  update public.o1ocards_profiles set coins = coins - need where id = uid returning * into p;

  new_end := case when l.ends_at - now() <= ext * interval '1 second'
                  then now() + ext * interval '1 second' else l.ends_at end;
  update public.o1ocards_listings
  set current_bid = p_amount, current_bidder = uid, bid_count = bid_count + 1, ends_at = new_end
  where id = l.id;
  insert into public.o1ocards_bids (listing_id, bidder_id, amount) values (l.id, uid, p_amount);

  return jsonb_build_object('status', public.o1ocards_status_json(p), 'ends_at', new_end);
end $$;

-- Annonces en cours
drop function if exists public.o1ocards_market_list(text, text, int, int);
create or replace function public.o1ocards_market_list(
  p_kind   text default null,
  p_sort   text default 'ending',
  p_limit  int  default 40,
  p_offset int  default 0
)
returns table (
  listing_id  bigint,
  card_type   int,
  card_base   text,
  card_series int,
  card_number int,
  rarity_id   text,
  seller_name text,
  kind        text,
  price       int,
  current_bid int,
  bid_count   int,
  ends_at     timestamptz,
  min_bid     int,
  is_mine     boolean,
  is_leading  boolean,
  total       bigint,
  server_now  timestamptz
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); inc int := public.o1ocards_cfg('auction_min_increment')::int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();
  return query
  select l.id, l.type_id, l.base_rarity, l.series, l.number, public.o1ocards_rarity_id(l.number, l.series, l.type_id, l.base_rarity), p.username, l.kind,
         case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end,
         l.current_bid, l.bid_count, l.ends_at,
         case when l.kind = 'auction'
              then (case when l.current_bid is null then l.price else l.current_bid + inc end) end,
         l.seller_id = uid, l.current_bidder = uid, count(*) over (), now()
  from public.o1ocards_listings l
  join public.o1ocards_profiles p on p.id = l.seller_id
  left join public.o1ocards_rarities r on r.id = public.o1ocards_rarity_id(l.number, l.series, l.type_id, l.base_rarity)
  where l.status = 'active' and (p_kind is null or l.kind = p_kind)
  order by
    case when p_sort = 'price' then (case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end) end asc nulls last,
    case when p_sort = 'rarity' then r.sort_order end asc nulls last,
    case when p_sort = 'recent' then l.created_at end desc,
    case when p_sort = 'ending' then l.ends_at end asc nulls last,
    l.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end $$;

-- Mes ventes, mes achats et mes enchères (en cours + 7 derniers jours)
drop function if exists public.o1ocards_market_mine();
create or replace function public.o1ocards_market_mine()
returns table (
  listing_id  bigint,
  card_type   int,
  card_base   text,
  card_series int,
  card_number int,
  rarity_id   text,
  kind        text,
  price       int,
  current_bid int,
  bid_count   int,
  ends_at     timestamptz,
  status      text,
  final_price int,
  closed_at   timestamptz,
  role        text,
  my_bid      int,
  is_leading  boolean,
  min_bid     int,
  seller_name text,
  server_now  timestamptz
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); inc int := public.o1ocards_cfg('auction_min_increment')::int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_settle_due();
  return query
  select l.id, l.type_id, l.base_rarity, l.series, l.number, public.o1ocards_rarity_id(l.number, l.series, l.type_id, l.base_rarity), l.kind,
         case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end,
         l.current_bid, l.bid_count, l.ends_at, l.status, l.final_price, l.closed_at,
         case when l.seller_id = uid then 'seller' when l.buyer_id = uid then 'buyer' else 'bidder' end,
         (select max(b.amount)::int from public.o1ocards_bids b where b.listing_id = l.id and b.bidder_id = uid),
         (l.status = 'active' and l.current_bidder = uid),
         case when l.kind = 'auction'
              then (case when l.current_bid is null then l.price else l.current_bid + inc end) end,
         p.username, now()
  from public.o1ocards_listings l
  join public.o1ocards_profiles p on p.id = l.seller_id
  where (l.seller_id = uid or l.buyer_id = uid
         or exists (select 1 from public.o1ocards_bids b where b.listing_id = l.id and b.bidder_id = uid))
    and (l.status = 'active' or l.closed_at > now() - interval '7 days')
  order by case when l.status = 'active' then 0 else 1 end,
           l.ends_at asc nulls last, l.closed_at desc nulls last, l.id desc
  limit 100;
end $$;

-- ---------- Favoris ----------
-- Ajoute ou retire une carte de mes favoris (impossible sur une carte qui m'appartient déjà)
drop function if exists public.o1ocards_toggle_favorite(int, int, int);
create or replace function public.o1ocards_toggle_favorite(p_type int, p_base text, p_series int, p_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_owner uuid; v_rows int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  select owner_id into v_owner from public.o1ocards_cards where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  if v_owner = uid then raise exception 'own_card'; end if;
  delete from public.o1ocards_favorites where user_id = uid and type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.o1ocards_favorites (user_id, type_id, base_rarity, series, number) values (uid, p_type, p_base, p_series, p_number);
    return jsonb_build_object('favorited', true);
  end if;
  return jsonb_build_object('favorited', false);
end $$;

-- Mes cartes favorites et leur état actuel (propriétaire, en vente ou non)
drop function if exists public.o1ocards_list_favorites();
create or replace function public.o1ocards_list_favorites()
returns table (
  card_type     int,
  card_base     text,
  card_series   int,
  card_number   int,
  rarity_id     text,
  owner_id      uuid,
  owner_name    text,
  listing_id    bigint,
  listing_kind  text,
  listing_price int,
  created_at    timestamptz
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select f.type_id, f.base_rarity, f.series, f.number, public.o1ocards_rarity_id(f.number, f.series, f.type_id, f.base_rarity),
         c.owner_id, p.username, l.id, l.kind,
         case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end,
         f.created_at
  from public.o1ocards_favorites f
  left join public.o1ocards_cards c on c.type_id = f.type_id and c.base_rarity = f.base_rarity and c.series = f.series and c.number = f.number
  left join public.o1ocards_profiles p on p.id = c.owner_id
  left join public.o1ocards_listings l
         on l.type_id = f.type_id and l.base_rarity = f.base_rarity and l.series = f.series and l.number = f.number and l.status = 'active'
  where f.user_id = uid
  order by f.created_at desc
  limit 200;
end $$;

-- ---------- Offres directes ----------
-- Propose un prix pour la carte d'un autre joueur (qu'elle soit en vente ou non). Refaire une offre remplace la précédente.
drop function if exists public.o1ocards_make_offer(int, int, int, int);
create or replace function public.o1ocards_make_offer(p_type int, p_base text, p_series int, p_number int, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_owner uuid; v_id bigint; v_buyer_name text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then raise exception 'invalid_price'; end if;
  select owner_id into v_owner from public.o1ocards_cards where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number;
  if v_owner is null then raise exception 'card_not_taken'; end if;
  if v_owner = uid then raise exception 'own_card'; end if;

  insert into public.o1ocards_offers (type_id, base_rarity, series, number, buyer_id, seller_id, amount)
  values (p_type, p_base, p_series, p_number, uid, v_owner, p_amount)
  on conflict (type_id, base_rarity, series, number, buyer_id) where status = 'pending'
  do update set amount = excluded.amount, created_at = now()
  returning id into v_id;

  select username into v_buyer_name from public.o1ocards_profiles where id = uid;
  insert into public.o1ocards_notifications (user_id, kind, type_id, card_base, series, number, offer_id, amount, actor_name)
  values (v_owner, 'offer_received', p_type, p_base, p_series, p_number, v_id, p_amount, v_buyer_name);

  return jsonb_build_object('offer_id', v_id);
end $$;

-- L'acheteur retire sa propre offre tant qu'elle est en attente
create or replace function public.o1ocards_cancel_offer(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o public.o1ocards_offers;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into o from public.o1ocards_offers where id = p_id for update;
  if not found or o.status <> 'pending' then raise exception 'offer_unavailable'; end if;
  if o.buyer_id <> uid then raise exception 'not_owner'; end if;
  update public.o1ocards_offers set status = 'cancelled', responded_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Le propriétaire répond à une offre reçue. Les pièces de l'acheteur ne sont débitées que s'il accepte.
-- Toute annonce active sur la carte est retirée (la propriété change) ; une enchère déjà surenchérie bloque l'acceptation.
create or replace function public.o1ocards_respond_offer(p_id bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o public.o1ocards_offers; v_owner uuid; bal bigint; p public.o1ocards_profiles; v_auto boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into o from public.o1ocards_offers where id = p_id for update;
  if not found or o.status <> 'pending' then raise exception 'offer_unavailable'; end if;
  if o.seller_id <> uid then raise exception 'not_owner'; end if;

  if not p_accept then
    update public.o1ocards_offers set status = 'declined', responded_at = now() where id = p_id;
    insert into public.o1ocards_notifications (user_id, kind, type_id, card_base, series, number, offer_id, amount)
    values (o.buyer_id, 'offer_declined', o.type_id, o.base_rarity, o.series, o.number, o.id, o.amount);
    p := public.o1ocards_sync(uid);
    return jsonb_build_object('status', public.o1ocards_status_json(p));
  end if;

  if exists (select 1 from public.o1ocards_album_picks
             where user_id = uid and type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number) then
    raise exception 'card_in_album';   -- une carte placée dans l'album ne peut pas être vendue
  end if;
  perform 1 from public.o1ocards_listings
  where type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number and status = 'active' and kind = 'auction' and bid_count > 0
  for update;
  if found then raise exception 'card_in_auction'; end if;

  select owner_id into v_owner from public.o1ocards_cards
  where type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number for update;
  if v_owner is distinct from uid then
    update public.o1ocards_offers set status = 'cancelled', responded_at = now() where id = p_id;
    raise exception 'not_owner';
  end if;

  perform 1 from public.o1ocards_profiles where id in (uid, o.buyer_id) order by id for update;
  select coins into bal from public.o1ocards_profiles where id = o.buyer_id;
  if bal < o.amount then raise exception 'buyer_insufficient_coins'; end if;

  -- Offre acceptée par un AMI de l'acheteur, pour une carte qui lui manquait (rien dans cet emplacement de son album) : elle va directement dans son album
  v_auto := exists (select 1 from public.o1ocards_friendships f
                     where f.status = 'accepted'
                       and least(f.requester_id, f.addressee_id) = least(uid, o.buyer_id) and greatest(f.requester_id, f.addressee_id) = greatest(uid, o.buyer_id))
            and not public.o1ocards_owns_card_rarity(o.buyer_id, o.type_id, public.o1ocards_rarity_id(o.number, o.series, o.type_id, o.base_rarity));

  update public.o1ocards_profiles set coins = coins - o.amount where id = o.buyer_id;
  update public.o1ocards_profiles set coins = coins + o.amount where id = uid returning * into p;
  update public.o1ocards_cards set owner_id = o.buyer_id, obtained_at = now()
  where type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number;
  if v_auto then perform public.o1ocards_auto_place_album(o.buyer_id, o.type_id, o.base_rarity, o.series, o.number); end if;
  delete from public.o1ocards_favorites where user_id = o.buyer_id and type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number;
  delete from public.o1ocards_album_picks where user_id = o.seller_id and type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number;

  update public.o1ocards_listings set status = 'cancelled', closed_at = now()
  where type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number and status = 'active';

  update public.o1ocards_offers set status = 'accepted', responded_at = now() where id = p_id;
  update public.o1ocards_offers set status = 'cancelled', responded_at = now()
  where type_id = o.type_id and base_rarity = o.base_rarity and series = o.series and number = o.number and status = 'pending' and id <> p_id;

  insert into public.o1ocards_notifications (user_id, kind, type_id, card_base, series, number, offer_id, amount)
  values (o.buyer_id, 'offer_accepted', o.type_id, o.base_rarity, o.series, o.number, o.id, o.amount);

  return jsonb_build_object('status', public.o1ocards_status_json(p));
end $$;

-- Mes offres envoyées et reçues (en cours + 7 derniers jours)
drop function if exists public.o1ocards_my_offers();
create or replace function public.o1ocards_my_offers()
returns table (
  offer_id         bigint,
  card_type        int,
  card_base        text,
  card_series      int,
  card_number      int,
  rarity_id        text,
  role             text,
  counterpart_name text,
  amount           int,
  status           text,
  created_at       timestamptz,
  responded_at     timestamptz
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select o.id, o.type_id, o.base_rarity, o.series, o.number, public.o1ocards_rarity_id(o.number, o.series, o.type_id, o.base_rarity),
         case when o.buyer_id = uid then 'buyer' else 'seller' end,
         p.username, o.amount, o.status, o.created_at, o.responded_at
  from public.o1ocards_offers o
  join public.o1ocards_profiles p on p.id = (case when o.buyer_id = uid then o.seller_id else o.buyer_id end)
  where (o.buyer_id = uid or o.seller_id = uid)
    and (o.status = 'pending' or o.responded_at > now() - interval '7 days')
  order by case when o.status = 'pending' then 0 else 1 end, o.created_at desc
  limit 100;
end $$;

-- ---------- Album ----------
-- Un emplacement par carte (type) ET par rareté : les tranches de raretés du type (si elles contiennent au moins une
-- carte « du milieu », donc 3 séries ou plus) puis Unique, Alpha et Omega. Du plus commun au plus rare. Pour chaque
-- emplacement : l'exemplaire choisi (s'il y en a un) et le nombre d'exemplaires possédés dans cette rareté.
-- Un type secret n'apparaît qu'une fois qu'on en possède une carte.
drop function if exists public.o1ocards_album_view(int);
create or replace function public.o1ocards_album_view(p_category int)
returns table (
  type_id     int,
  type_name   text,
  type_image  text,
  rarity_id   text,
  pick_base   text,
  pick_series int,
  pick_number int,
  owned_count bigint,
  secret      boolean,
  revealed    boolean
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select y.type_id, y.type_name, y.type_image, y.rarity_id, y.pick_base, y.pick_series, y.pick_number, y.owned_count, y.secret, y.revealed
  from (
    with ts as (
      -- un type secret est dévoilé dès qu'on en possède une carte ; avant, il apparaît dans l'album comme une carte mystère
      select t.id, t.name, t.image, t.position, t.secret,
             (not t.secret or exists (select 1 from public.o1ocards_cards k where k.type_id = t.id and k.owner_id = uid)) as revealed
      from public.o1ocards_types t
      where t.category_id = p_category
    ),
    slots as (
      -- une rareté de base a des cartes de SA rareté si une série a des cartes « du milieu » (3 séries ou plus) ou une série à
      -- numéro masqué de 2 cartes ou plus (dont toutes les cartes gardent la rareté de base)
      select ts.id as type_id, c.rarity_id
      from ts cross join lateral public.o1ocards_type_config(ts.id) c
      where ts.revealed and (c.smax >= 3 or (c.smax = 2 and c.numbered < 2))
      union
      select ts.id, r.id from ts join public.o1ocards_rarities r on r.kind = 'unique' where ts.revealed
      union
      -- Alpha et Omega n'existent que sur les séries à numéro visible (au moins une série visible de 2 cartes ou plus)
      select ts.id, r.id from ts join public.o1ocards_rarities r on r.kind in ('alpha', 'omega')
      where ts.revealed and exists (select 1 from public.o1ocards_type_config(ts.id) c where least(c.numbered::bigint, c.smax) >= 2)
    ),
    mine as (
      select c.type_id, public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) as rid
      from public.o1ocards_cards c
      where c.owner_id = uid and c.type_id in (select t2.id from ts t2 where t2.revealed)
    )
    select ts.id as type_id, ts.name as type_name, ts.image as type_image, s.rarity_id, p.base_rarity as pick_base,
           p.series as pick_series, p.number as pick_number,
           (select count(*) from mine m where m.type_id = ts.id and m.rid = s.rarity_id) as owned_count,
           ts.secret, true as revealed, ts.position as o_pos, r.sort_order as o_ord
    from ts
    join slots s on s.type_id = ts.id
    join public.o1ocards_rarities r on r.id = s.rarity_id
    left join public.o1ocards_album_picks p
           on p.user_id = uid and p.type_id = ts.id and p.rarity_id = s.rarity_id
          and public.o1ocards_rarity_id(p.number, p.series, p.type_id, p.base_rarity) = p.rarity_id   -- choix périmé si la carte a changé de rareté
    union all
    -- carte secrète pas encore découverte : une seule ligne, sans nom ni visuel (rien ne fuit par cette fonction)
    select ts.id, null::text, null::text, null::text, null::text, null::int, null::int, 0::bigint, true, false, ts.position, 0
    from ts where not ts.revealed
  ) y
  order by y.secret, y.o_pos, y.type_id, y.o_ord desc;
end $$;

-- =====================================================================================================================
-- AMIS : demandes, liste, collection d'un ami et de ses doubles. Tout passe par des fonctions : la table n'est jamais lisible directement.
-- Une demande est « pending » jusqu'à ce que l'autre l'accepte (« accepted ») ; la refuser ou la retirer la supprime. Un ami voit toute la
-- collection de l'autre, dont ses DOUBLES (cartes qui ne sont pas dans son album alors que l'emplacement est déjà pris) : il peut lui
-- proposer une offre (make_offer) sur un double.
-- =====================================================================================================================
create table if not exists public.o1ocards_friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references public.o1ocards_profiles (id) on delete cascade,
  addressee_id uuid not null references public.o1ocards_profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- une seule relation par paire de joueurs, quel que soit le sens
create unique index if not exists o1ocards_friendships_pair_uq on public.o1ocards_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists o1ocards_friendships_addressee_idx on public.o1ocards_friendships (addressee_id, status);
alter table public.o1ocards_friendships enable row level security;
revoke all on public.o1ocards_friendships from anon, authenticated;

-- Les cartes d'un joueur avec : leur rareté affichée, si elles sont dans son album, si ce sont des DOUBLES, et leur annonce éventuelle.
-- Double = carte hors album dans un emplacement (type, rareté affichée) déjà pris par une autre carte (celle de l'album, ou à défaut la
-- première par série et numéro). Fonction interne : jamais appelable directement.
create or replace function public.o1ocards_owner_cards_view(p_owner uuid)
returns table (type_id int, base_rarity text, series int, number int, rarity_id text, in_album boolean, is_double boolean, listing_id bigint)
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.type_id, c.base_rarity, c.series, c.number, public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) as rid
    from public.o1ocards_cards c where c.owner_id = p_owner
  ),
  j as (
    select m.*,
           (p.series is not null) as in_album,
           exists (select 1 from public.o1ocards_album_picks p2 where p2.user_id = p_owner and p2.type_id = m.type_id and p2.rarity_id = m.rid) as slot_has_pick,
           row_number() over (partition by m.type_id, m.rid order by m.series, m.number) as rn
    from mine m
    left join public.o1ocards_album_picks p
           on p.user_id = p_owner and p.type_id = m.type_id and p.rarity_id = m.rid and p.base_rarity = m.base_rarity and p.series = m.series and p.number = m.number
  )
  select j.type_id, j.base_rarity, j.series, j.number, j.rid, j.in_album,
         (not j.in_album and (j.slot_has_pick or j.rn > 1)) as is_double,
         (select l.id from public.o1ocards_listings l
           where l.type_id = j.type_id and l.base_rarity = j.base_rarity and l.series = j.series and l.number = j.number and l.status = 'active' limit 1)
  from j
$$;
revoke all on function public.o1ocards_owner_cards_view(uuid) from public, anon, authenticated;

-- Recherche d'un joueur par le début de son pseudo (2 caractères au moins, 10 résultats) : seulement id, pseudo et lien avec toi
create or replace function public.o1ocards_friend_search(p_query text)
returns table (user_id uuid, username text, relation text)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); q text := trim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(q) < 2 then return; end if;
  return query
  select p.id, p.username,
         case when f.id is null then 'none'
              when f.status = 'accepted' then 'friend'
              when f.requester_id = uid then 'sent'
              else 'received' end
  from public.o1ocards_profiles p
  left join public.o1ocards_friendships f
         on least(f.requester_id, f.addressee_id) = least(uid, p.id) and greatest(f.requester_id, f.addressee_id) = greatest(uid, p.id)
  where p.id <> uid
    and lower(p.username) like lower(replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_')) || '%' escape '\'
  order by lower(p.username), p.id
  limit 10;
end $$;

-- Demande d'ami. Si l'autre joueur t'avait déjà fait une demande, vous devenez amis tout de suite.
create or replace function public.o1ocards_friend_request(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f public.o1ocards_friendships%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  if p_user is null or p_user = uid then raise exception 'cannot_friend_self'; end if;
  if not exists (select 1 from public.o1ocards_profiles where id = p_user) then raise exception 'user_not_found'; end if;
  select * into f from public.o1ocards_friendships
   where least(requester_id, addressee_id) = least(uid, p_user) and greatest(requester_id, addressee_id) = greatest(uid, p_user);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requester_id = uid then raise exception 'request_pending'; end if;
    update public.o1ocards_friendships set status = 'accepted', responded_at = now() where id = f.id;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;
  if (select count(*) from public.o1ocards_friendships where requester_id = uid or addressee_id = uid) >= 200 then raise exception 'too_many_friends'; end if;
  insert into public.o1ocards_friendships (requester_id, addressee_id) values (uid, p_user);
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

-- Réponse à une demande reçue : accepter, ou refuser (la demande disparaît)
create or replace function public.o1ocards_friend_respond(p_id bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_accept, false) then
    update public.o1ocards_friendships set status = 'accepted', responded_at = now() where id = p_id and addressee_id = uid and status = 'pending';
  else
    delete from public.o1ocards_friendships where id = p_id and addressee_id = uid and status = 'pending';
  end if;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Retirer un ami, ou annuler une demande envoyée
create or replace function public.o1ocards_friend_remove(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from public.o1ocards_friendships
   where least(requester_id, addressee_id) = least(uid, p_user) and greatest(requester_id, addressee_id) = greatest(uid, p_user);
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mes amis et mes demandes : demandes reçues d'abord, puis envoyées, puis amis (avec leur nombre de cartes et de doubles)
create or replace function public.o1ocards_friends_list()
returns table (friendship_id bigint, user_id uuid, username text, relation text, cards bigint, doubles bigint, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select z.fid, z.oid, z.uname, z.rel, z.n, z.d, z.since
  from (
    select f.id as fid, o.id as oid, o.username as uname,
           case when f.status = 'accepted' then 'friend' when f.requester_id = uid then 'sent' else 'received' end as rel,
           coalesce(cv.n, 0)::bigint as n, coalesce(cv.d, 0)::bigint as d, coalesce(f.responded_at, f.created_at) as since
    from public.o1ocards_friendships f
    join public.o1ocards_profiles o on o.id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
    left join lateral (select count(*) as n, count(*) filter (where v.is_double) as d from public.o1ocards_owner_cards_view(o.id) v) cv on f.status = 'accepted'
    where uid in (f.requester_id, f.addressee_id)
  ) z
  order by case z.rel when 'received' then 0 when 'sent' then 1 else 2 end, lower(z.uname), z.oid;
end $$;

-- Les cartes d'un AMI (jamais d'un inconnu ni d'une demande en attente), les plus rares d'abord ; p_doubles = seulement ses doubles
-- i_own = le joueur qui regarde possède déjà une carte de cet emplacement (même type, même rareté affichée) : simple information, une offre reste possible
drop function if exists public.o1ocards_friend_cards(uuid, boolean, int, int);
create or replace function public.o1ocards_friend_cards(p_friend uuid, p_doubles boolean default false, p_limit int default 60, p_offset int default 0)
returns table (card_type int, card_base text, card_series int, card_number int, rarity_id text, is_double boolean, in_album boolean, listing_id bigint, i_own boolean, total bigint, doubles_total bigint)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.o1ocards_friendships f
                  where f.status = 'accepted'
                    and least(f.requester_id, f.addressee_id) = least(uid, p_friend) and greatest(f.requester_id, f.addressee_id) = greatest(uid, p_friend)) then
    raise exception 'not_friends';
  end if;
  return query
  with v as materialized (select * from public.o1ocards_owner_cards_view(p_friend)),
  tot as (
    select count(*) filter (where not coalesce(p_doubles, false) or v.is_double) as total, count(*) filter (where v.is_double) as dbl from v
  )
  select v.type_id, v.base_rarity, v.series, v.number, v.rarity_id, v.is_double, v.in_album, v.listing_id,
         public.o1ocards_owns_card_rarity(uid, v.type_id, v.rarity_id), tot.total, tot.dbl
  from v cross join tot
  where not coalesce(p_doubles, false) or v.is_double
  order by coalesce((select r.sort_order from public.o1ocards_rarities r where r.id = v.rarity_id), 1000), v.type_id, v.series, v.number
  limit least(greatest(coalesce(p_limit, 60), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke all on function public.o1ocards_friend_search(text) from public, anon;
revoke all on function public.o1ocards_friend_request(uuid) from public, anon;
revoke all on function public.o1ocards_friend_respond(bigint, boolean) from public, anon;
revoke all on function public.o1ocards_friend_remove(uuid) from public, anon;
revoke all on function public.o1ocards_friends_list() from public, anon;
revoke all on function public.o1ocards_friend_cards(uuid, boolean, int, int) from public, anon;
grant execute on function public.o1ocards_friend_search(text) to authenticated;
grant execute on function public.o1ocards_friend_request(uuid) to authenticated;
grant execute on function public.o1ocards_friend_respond(bigint, boolean) to authenticated;
grant execute on function public.o1ocards_friend_remove(uuid) to authenticated;
grant execute on function public.o1ocards_friends_list() to authenticated;
grant execute on function public.o1ocards_friend_cards(uuid, boolean, int, int) to authenticated;

-- =====================================================================================================================
-- BOOSTER GOLD : récompense quand TOUS les emplacements d'une carte (type) sont remplis dans l'album (raretés ordinaires de la carte, Unique, Alpha,
-- Omega : exactement les emplacements de album_view). Une seule récompense par carte et par joueur, même si on vide puis remplit l'album.
-- Contenu : 3 Rare, 1 Super Rare, puis une 5e carte tirée au hasard (poids gold_reward_weight_*) parmi : une carte à numéro visible de la carte complétée,
-- une Art Rare, une Alpha, une Omega, une Unique. Les cartes viennent des cartes restantes de la catégorie de la carte complétée ; une carte nouvelle
-- va directement dans l'album. Les raretés Rare, Super Rare et Art Rare sont reconnues par leur NOM (jamais par leur identifiant).
-- =====================================================================================================================
create table if not exists public.o1ocards_gold_rewards (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.o1ocards_profiles (id) on delete cascade,
  type_id    int  not null references public.o1ocards_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen       boolean not null default false,   -- le joueur a vu l'annonce
  opened_at  timestamptz,
  cards      jsonb,
  unique (user_id, type_id)
);
alter table public.o1ocards_gold_rewards enable row level security;
revoke all on public.o1ocards_gold_rewards from anon, authenticated;

-- Id d'une rareté ordinaire d'après son nom (sans accents ni casse) : 'rare', 'super rare', 'art rare'
create or replace function public.o1ocards_rarity_by_name(p_key text)
returns text language sql stable set search_path = public as $$
  select r.id from public.o1ocards_rarities r
  where r.kind = 'range' and regexp_replace(lower(translate(trim(r.name), 'éèêëàâîïôöùûüç', 'eeeeaaiioouuuc')), '\s+', ' ', 'g') = p_key
  order by r.sort_order limit 1
$$;

-- Les emplacements d'une carte dans l'album (mêmes règles que album_view)
create or replace function public.o1ocards_type_album_slots(p_type int)
returns table (rid text)
language sql stable security definer set search_path = public as $$
  select c.rarity_id from public.o1ocards_type_config(p_type) c where c.smax >= 3 or (c.smax = 2 and c.numbered < 2)
  union
  select r.id from public.o1ocards_rarities r where r.kind = 'unique'
  union
  select r.id from public.o1ocards_rarities r
  where r.kind in ('alpha', 'omega') and exists (select 1 from public.o1ocards_type_config(p_type) c where least(c.numbered::bigint, c.smax) >= 2)
$$;

-- Crée la récompense si tous les emplacements de la carte sont remplis dans l'album du joueur (et s'il ne l'a pas déjà eue)
create or replace function public.o1ocards_check_type_reward(p_uid uuid, p_type int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.o1ocards_gold_rewards where user_id = p_uid and type_id = p_type) then return; end if;
  if not exists (select 1 from public.o1ocards_type_album_slots(p_type)) then return; end if;
  if exists (
    select 1 from public.o1ocards_type_album_slots(p_type) sl
    where not exists (
      select 1 from public.o1ocards_album_picks p
      where p.user_id = p_uid and p.type_id = p_type and p.rarity_id = sl.rid
        and public.o1ocards_rarity_id(p.number, p.series, p.type_id, p.base_rarity) = p.rarity_id)
  ) then return; end if;
  insert into public.o1ocards_gold_rewards (user_id, type_id) values (p_uid, p_type) on conflict (user_id, type_id) do nothing;
end $$;

-- Les séries d'une catégorie qui ont encore des cartes, avec ce qui reste : alpha (numéro 1) et omega (numéro m) libres, cartes « du milieu » libres
create or replace function public.o1ocards_gold_pool(p_cat int, p_type int default null)
returns table (type_id int, base text, g int, vis boolean, a_free int, o_free int, mid_free int, avail int)
language sql stable security definer set search_path = public as $$
  select z.type_id, z.base, z.g, z.vis, z.a_free, z.o_free,
         case when z.g = 1 then 0 when z.vis then greatest(z.avail - z.a_free - z.o_free, 0) else z.avail end,
         z.avail
  from (
    select ty.id as type_id, cf.rarity_id as base, g, (g <= cf.numbered) as vis, (g - coalesce(t.taken, 0))::int as avail,
           (case when g > 1 and g <= cf.numbered and a.type_id is null then 1 else 0 end) as a_free,
           (case when g > 1 and g <= cf.numbered and o.type_id is null then 1 else 0 end) as o_free
    from public.o1ocards_types ty
    cross join lateral public.o1ocards_type_config(ty.id) cf
    cross join lateral generate_series(1, cf.smax) g
    left join public.o1ocards_series_taken t on t.type_id = ty.id and t.base_rarity = cf.rarity_id and t.series = g
    left join public.o1ocards_cards a on g > 1 and a.type_id = ty.id and a.base_rarity = cf.rarity_id and a.series = g and a.number = 1
    left join public.o1ocards_cards o on g > 1 and o.type_id = ty.id and o.base_rarity = cf.rarity_id and o.series = g and o.number = g
    where ty.category_id = p_cat and (p_type is null or ty.id = p_type) and g > coalesce(t.taken, 0)
  ) z
$$;

-- Tire UNE carte libre : p_mode = plain (rareté p_rarity, sans Alpha/Omega/Unique), numbered (carte à numéro visible du type p_type), anyplain (n'importe
-- quelle carte ordinaire), alpha, omega, unique. Ne renvoie rien s'il n'y a aucune carte possible.
create or replace function public.o1ocards_gold_pick_card(p_cat int, p_mode text, p_rarity text, p_type int, p_e double precision)
returns table (c_type int, c_base text, c_series int, c_number int)
language plpgsql volatile security definer set search_path = public set jit = off as $$
declare r record; k int; v_num int;
begin
  select s.type_id, s.base, s.g, s.vis, s.mid_free into r
  from (
    select z.*, sum(z.w) over (order by z.type_id, z.base, z.g) as cs, sum(z.w) over () as tw
    from (
      select gp.*,
             (case p_mode when 'plain' then gp.mid_free when 'numbered' then gp.mid_free when 'anyplain' then gp.mid_free
                          when 'alpha' then gp.a_free when 'omega' then gp.o_free when 'unique' then (case when gp.g = 1 then 1 else 0 end) else 0 end)
             * power(gp.g::double precision, p_e) as w
      from public.o1ocards_gold_pool(p_cat, case when p_mode = 'numbered' then p_type end) gp
      where case p_mode when 'plain' then gp.base = p_rarity and gp.g > 1
                        when 'numbered' then gp.vis and gp.g > 2
                        when 'anyplain' then gp.g > 1
                        else true end
    ) z where z.w > 0
  ) s, (select random() as rr) q
  where s.cs > q.rr * s.tw
  order by s.cs limit 1;
  if r.type_id is null then return; end if;

  if p_mode = 'alpha' then v_num := 1;
  elsif p_mode = 'omega' then v_num := r.g;
  elsif p_mode = 'unique' then v_num := 1;
  else
    -- une carte « du milieu » encore libre au hasard : numéros 2..m-1 si la série est à numéro visible (1 et m sont Alpha et Omega), tous sinon
    k := floor(random() * r.mid_free)::int;
    select x into v_num
    from generate_series(case when r.vis then 2 else 1 end, case when r.vis then r.g - 1 else r.g end) x
    where not exists (select 1 from public.o1ocards_cards c where c.type_id = r.type_id and c.base_rarity = r.base and c.series = r.g and c.number = x)
    order by x offset k limit 1;
  end if;
  if v_num is null then return; end if;
  c_type := r.type_id; c_base := r.base; c_series := r.g; c_number := v_num;
  return next;
end $$;

-- Le contenu d'un booster Gold pour la carte p_type : renvoie les cartes tirées (comme un booster), avec album automatique pour les cartes nouvelles
create or replace function public.o1ocards_draw_gold_reward(p_uid uuid, p_type int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cat   int;
  e       double precision := coalesce(public.o1ocards_cfg('rarity_exponent'), 0)::double precision;
  v_rare  text := public.o1ocards_rarity_by_name('rare');
  v_super text := public.o1ocards_rarity_by_name('super rare');
  v_art   text := public.o1ocards_rarity_by_name('art rare');
  res     jsonb := '[]'::jsonb;
  slot    int; mode text; modes text[]; tries int; ok boolean; c record; v_new boolean; rows int;
  opts    text[]; wts double precision[]; tw double precision; r double precision; acc double precision; pick int; i int; n int;
begin
  select t.category_id into v_cat from public.o1ocards_types t where t.id = p_type;
  if v_cat is null then return res; end if;

  for slot in 1 .. 5 loop
    if slot <= 3 then modes := array['plain:' || coalesce(v_rare, ''), 'anyplain'];
    elsif slot = 4 then modes := array['plain:' || coalesce(v_super, ''), 'anyplain'];
    else
      -- 5e carte : une des cinq possibilités au hasard (poids réglables), les autres en repli, puis n'importe quelle carte ordinaire
      opts := array['numbered', case when v_art is null then null else 'plain:' || v_art end, 'alpha', 'omega', 'unique'];
      wts := array[coalesce(public.o1ocards_cfg('gold_reward_weight_numbered'), 1), coalesce(public.o1ocards_cfg('gold_reward_weight_artrare'), 1),
                   coalesce(public.o1ocards_cfg('gold_reward_weight_alpha'), 1), coalesce(public.o1ocards_cfg('gold_reward_weight_omega'), 1),
                   coalesce(public.o1ocards_cfg('gold_reward_weight_unique'), 1)]::double precision[];
      modes := '{}';
      for n in 1 .. 5 loop
        tw := 0;
        for i in 1 .. 5 loop if opts[i] is not null and wts[i] > 0 then tw := tw + wts[i]; end if; end loop;
        exit when tw <= 0;
        r := random() * tw; acc := 0; pick := null;
        for i in 1 .. 5 loop
          if opts[i] is not null and wts[i] > 0 then
            acc := acc + wts[i];
            if r < acc then pick := i; exit; end if;
          end if;
        end loop;
        if pick is null then exit; end if;
        modes := array_append(modes, opts[pick]);
        wts[pick] := 0;
      end loop;
      modes := array_append(modes, 'anyplain'::text);
    end if;

    ok := false;
    foreach mode in array modes loop
      exit when ok;
      tries := 0;
      while tries < 5 and not ok loop
        tries := tries + 1;
        select * into c from public.o1ocards_gold_pick_card(v_cat, split_part(mode, ':', 1), nullif(split_part(mode, ':', 2), ''), p_type, e);
        exit when c.c_type is null;
        v_new := not public.o1ocards_owns_card_rarity(p_uid, c.c_type, public.o1ocards_rarity_id(c.c_number, c.c_series, c.c_type, c.c_base));
        insert into public.o1ocards_cards (type_id, base_rarity, series, number, owner_id) values (c.c_type, c.c_base, c.c_series, c.c_number, p_uid)
        on conflict (type_id, base_rarity, series, number) do nothing;
        get diagnostics rows = row_count;
        if rows = 1 then
          ok := true;
          if v_new then perform public.o1ocards_auto_place_album(p_uid, c.c_type, c.c_base, c.c_series, c.c_number); end if;
          res := res || jsonb_build_array(jsonb_build_object(
            'type_id', c.c_type, 'base_rarity', c.c_base, 'series', c.c_series, 'number', c.c_number,
            'rarity_id', public.o1ocards_rarity_id(c.c_number, c.c_series, c.c_type, c.c_base), 'is_new', v_new));
        end if;
      end loop;
    end loop;
  end loop;
  return res;
end $$;

-- Ouvrir un booster Gold gagné (une seule fois). Les cartes viennent de la catégorie de la carte complétée.
create or replace function public.o1ocards_open_gold_reward(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.o1ocards_profiles; rw public.o1ocards_gold_rewards; v_cat int; res jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  p := public.o1ocards_sync(uid);
  select * into rw from public.o1ocards_gold_rewards where id = p_id and user_id = uid and opened_at is null for update;
  if not found then raise exception 'no_gold_reward'; end if;
  select t.category_id into v_cat from public.o1ocards_types t where t.id = rw.type_id;
  res := public.o1ocards_draw_gold_reward(uid, rw.type_id);
  if jsonb_array_length(res) = 0 then raise exception 'pool_empty'; end if;   -- plus aucune carte à tirer : la récompense reste à ouvrir
  if public.o1ocards_category_taken(v_cat) >= public.o1ocards_category_total(v_cat) then
    update public.o1ocards_categories set closed = true where id = v_cat;
  end if;
  update public.o1ocards_gold_rewards set opened_at = now(), seen = true, cards = res where id = rw.id;
  select * into p from public.o1ocards_profiles where id = uid;
  return jsonb_build_object('cards', res, 'golden', true, 'gold', true, 'type_id', rw.type_id, 'category_id', v_cat, 'status', public.o1ocards_status_json(p));
end $$;

-- Annonce vue (la fenêtre « Carte complétée » ne revient pas)
create or replace function public.o1ocards_ack_gold_rewards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.o1ocards_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.o1ocards_gold_rewards set seen = true where user_id = auth.uid() and not seen;
  p := public.o1ocards_sync(auth.uid());
  return public.o1ocards_status_json(p);
end $$;

-- Cartes déjà complètes avant cette fonction : leurs récompenses sont créées une fois (idempotent)
create or replace function public.o1ocards_gold_rewards_backfill()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; before_n int;
begin
  for r in select distinct user_id, type_id from public.o1ocards_album_picks loop
    select count(*) into before_n from public.o1ocards_gold_rewards where user_id = r.user_id and type_id = r.type_id;
    perform public.o1ocards_check_type_reward(r.user_id, r.type_id);
    if (select count(*) from public.o1ocards_gold_rewards where user_id = r.user_id and type_id = r.type_id) > before_n then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.o1ocards_rarity_by_name(text) from public, anon, authenticated;
revoke all on function public.o1ocards_type_album_slots(int) from public, anon, authenticated;
revoke all on function public.o1ocards_check_type_reward(uuid, int) from public, anon, authenticated;
revoke all on function public.o1ocards_gold_pool(int, int) from public, anon, authenticated;
revoke all on function public.o1ocards_gold_pick_card(int, text, text, int, double precision) from public, anon, authenticated;
revoke all on function public.o1ocards_draw_gold_reward(uuid, int) from public, anon, authenticated;
revoke all on function public.o1ocards_gold_rewards_backfill() from public, anon, authenticated;
revoke all on function public.o1ocards_open_gold_reward(bigint) from public, anon;
revoke all on function public.o1ocards_ack_gold_rewards() from public, anon;
grant execute on function public.o1ocards_open_gold_reward(bigint) to authenticated;
grant execute on function public.o1ocards_ack_gold_rewards() to authenticated;
select public.o1ocards_gold_rewards_backfill();

-- « Voir la collection » (album) : pour chaque type d'une catégorie, le nombre de JOUEURS DISTINCTS qui possèdent au moins une carte de ce
-- type (toutes raretés confondues). Si tu en as 20 et ton ami 3, il y a 2 détenteurs. Une carte revendue à la banque (sans propriétaire)
-- ne compte pas. Seuls des nombres sont renvoyés, jamais de noms de joueurs. Le client ne dévoile un type que s'il a plus d'un détenteur.
create or replace function public.o1ocards_collection_holders(p_category int)
returns table (type_id int, holders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query
  select t.id, count(distinct c.owner_id)
  from public.o1ocards_types t
  left join public.o1ocards_cards c on c.type_id = t.id and c.owner_id is not null
  where t.category_id = p_category
  group by t.id, t.position
  order by t.position, t.id;
end $$;
revoke all on function public.o1ocards_collection_holders(int) from public, anon;
grant execute on function public.o1ocards_collection_holders(int) to authenticated;

-- Mes exemplaires d'un type, éventuellement d'une seule rareté (pour choisir lequel mettre dans l'emplacement).
-- listed : en vente (ne peut pas entrer dans l'album) ; picked : c'est l'exemplaire actuellement dans l'album ;
-- visible : son numéro est visible (sinon il fait partie de la pile des cartes sans numéro).
drop function if exists public.o1ocards_my_type_cards(int, text);
create or replace function public.o1ocards_my_type_cards(p_type int, p_rarity text default null)
returns table (base_rarity text, series int, number int, rarity_id text, listed boolean, picked boolean, visible boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select c.base_rarity, c.series, c.number, public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity),
         exists (select 1 from public.o1ocards_listings l where l.type_id = c.type_id and l.base_rarity = c.base_rarity and l.series = c.series and l.number = c.number and l.status = 'active'),
         exists (select 1 from public.o1ocards_album_picks a where a.user_id = uid and a.type_id = c.type_id and a.base_rarity = c.base_rarity and a.series = c.series and a.number = c.number),
         public.o1ocards_number_visible(c.type_id, c.base_rarity, c.series)
  from public.o1ocards_cards c
  where c.type_id = p_type and c.owner_id = uid
    and (p_rarity is null or public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) = p_rarity)
  order by c.series, c.number, c.base_rarity;
end $$;

-- Choisit (ou change librement) l'exemplaire affiché ; il doit m'appartenir. Il prend l'emplacement de SA rareté.
drop function if exists public.o1ocards_set_album_pick(int, int, int);
create or replace function public.o1ocards_set_album_pick(p_type int, p_base text, p_series int, p_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_rarity text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.o1ocards_cards
    where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number and owner_id = uid
  ) then
    raise exception 'not_owner';
  end if;
  if exists (select 1 from public.o1ocards_listings
             where type_id = p_type and base_rarity = p_base and series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';   -- une carte en vente ne peut pas entrer dans l'album
  end if;
  v_rarity := public.o1ocards_rarity_id(p_number, p_series, p_type, p_base);
  insert into public.o1ocards_album_picks (user_id, type_id, rarity_id, base_rarity, series, number, updated_at)
  values (uid, p_type, v_rarity, p_base, p_series, p_number, now())
  on conflict (user_id, type_id, rarity_id)
  do update set base_rarity = excluded.base_rarity, series = excluded.series, number = excluded.number, updated_at = now();
  perform public.o1ocards_check_type_reward(uid, p_type);   -- la carte est peut-être maintenant complète : booster Gold
  return jsonb_build_object('ok', true, 'rarity_id', v_rarity);
end $$;

-- Vide l'emplacement (type, rareté)
drop function if exists public.o1ocards_clear_album_pick(int);
create or replace function public.o1ocards_clear_album_pick(p_type int, p_rarity text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from public.o1ocards_album_picks where user_id = uid and type_id = p_type and rarity_id = p_rarity;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Cartes à numéro masqué : piles ----------
-- Les cartes dont le numéro n'est pas visible n'ont pas d'identité pour le joueur : elles se rangent en une pile par
-- (type, rareté). Les cartes à numéro visible restent individuelles. Les cartes placées dans l'album ou en vente ne sont
-- pas vendables.
-- Cartes à numéro masqué d'un type et d'une rareté (usage interne) ; sellable = ni dans l'album ni en vente.
drop function if exists public.o1ocards_stack_cards(uuid, int, text);
create or replace function public.o1ocards_stack_cards(p_uid uuid, p_type int, p_rarity text)
returns table (base_rarity text, series int, number int, sellable boolean)
language sql stable security definer set search_path = public as $$
  with s as (select distinct c.base_rarity, c.series from public.o1ocards_cards c where c.owner_id = p_uid and c.type_id = p_type),
       sv as (select s.base_rarity, s.series, not public.o1ocards_number_visible(p_type, s.base_rarity, s.series) as hidden from s)
  select c.base_rarity, c.series, c.number,
         not exists (select 1 from public.o1ocards_album_picks a where a.user_id = p_uid and a.type_id = c.type_id and a.base_rarity = c.base_rarity and a.series = c.series and a.number = c.number)
         and not exists (select 1 from public.o1ocards_listings l where l.type_id = c.type_id and l.base_rarity = c.base_rarity and l.series = c.series and l.number = c.number and l.status = 'active')
  from public.o1ocards_cards c
  join sv on sv.base_rarity = c.base_rarity and sv.series = c.series and sv.hidden
  where c.owner_id = p_uid and c.type_id = p_type
    and public.o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) = p_rarity
$$;

-- Vente rapide de plusieurs cartes d'une pile à la banque, au même prix et aux mêmes règles que la revente d'une carte
-- (refusée si la catégorie est terminée). Tout ou rien ; jamais la carte de l'album ni une carte en vente.
create or replace function public.o1ocards_sell_direct_many(p_type int, p_rarity text, p_count int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_price int := public.o1ocards_cfg('direct_sell_price')::int;
  v_base text[]; v_series int[]; v_number int[]; v_rows int;
  p public.o1ocards_profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.o1ocards_ensure_profile(uid);
  if p_count is null or p_count < 1 or p_count > 10000 then raise exception 'invalid_count'; end if;
  if exists (select 1 from public.o1ocards_types t join public.o1ocards_categories c on c.id = t.category_id
             where t.id = p_type and c.closed) then
    raise exception 'category_closed';
  end if;

  select array_agg(x.base_rarity), array_agg(x.series), array_agg(x.number) into v_base, v_series, v_number
  from (
    select c.base_rarity, c.series, c.number
    from public.o1ocards_cards c
    join (select sc.base_rarity, sc.series, sc.number from public.o1ocards_stack_cards(uid, p_type, p_rarity) sc where sc.sellable) sc
      on sc.base_rarity = c.base_rarity and sc.series = c.series and sc.number = c.number
    where c.type_id = p_type and c.owner_id = uid
    order by c.series desc, c.number desc, c.base_rarity
    limit p_count
    for update of c
  ) x;
  if coalesce(array_length(v_series, 1), 0) < p_count then raise exception 'not_enough_cards'; end if;
  -- verrouillées : on revérifie qu'aucune n'a été mise en vente entre-temps
  if exists (select 1 from public.o1ocards_listings l join unnest(v_base, v_series, v_number) u(b, s, n)
               on l.base_rarity = u.b and l.series = u.s and l.number = u.n where l.type_id = p_type and l.status = 'active') then
    raise exception 'card_listed';
  end if;

  -- Cartes retirées du jeu pour de bon (voir sell_direct) : jamais redonnées par un booster
  update public.o1ocards_cards c set owner_id = null, retired_at = now() from unnest(v_base, v_series, v_number) u(b, s, n)
  where c.type_id = p_type and c.base_rarity = u.b and c.series = u.s and c.number = u.n and c.owner_id = uid;
  get diagnostics v_rows = row_count;
  if v_rows <> p_count then raise exception 'not_enough_cards'; end if;
  delete from public.o1ocards_favorites f using unnest(v_base, v_series, v_number) u(b, s, n)
  where f.type_id = p_type and f.base_rarity = u.b and f.series = u.s and f.number = u.n;
  update public.o1ocards_offers o set status = 'cancelled', responded_at = now() from unnest(v_base, v_series, v_number) u(b, s, n)
  where o.type_id = p_type and o.base_rarity = u.b and o.series = u.s and o.number = u.n and o.status = 'pending';

  update public.o1ocards_profiles set coins = coins + v_price * p_count where id = uid returning * into p;
  return jsonb_build_object('status', public.o1ocards_status_json(p), 'sold', p_count, 'coins', v_price * p_count);
end $$;

-- Met UNE carte d'une pile en vente sur le marché (la plus grande série d'abord) : même règles que list_card
create or replace function public.o1ocards_list_stack_card(p_type int, p_rarity text, p_kind text, p_price int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_base text; v_series int; v_number int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select sc.base_rarity, sc.series, sc.number into v_base, v_series, v_number
  from public.o1ocards_stack_cards(uid, p_type, p_rarity) sc
  where sc.sellable order by sc.series desc, sc.number desc, sc.base_rarity limit 1;
  if v_series is null then raise exception 'not_enough_cards'; end if;
  return public.o1ocards_list_card(p_type, v_base, v_series, v_number, p_kind, p_price);
end $$;

-- Migration : l'ancien album gardait UN choix par carte (type). Chaque choix existant passe dans l'emplacement de la rareté AFFICHÉE
-- de sa carte, puis la clé devient (joueur, type, rareté). Sans effet sur une base déjà migrée ou neuve.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'o1ocards_album_picks' and column_name = 'rarity_id') then
    alter table public.o1ocards_album_picks add column rarity_id text;
    update public.o1ocards_album_picks set rarity_id = public.o1ocards_rarity_id(number, series, type_id, base_rarity);
    alter table public.o1ocards_album_picks alter column rarity_id set not null;
    alter table public.o1ocards_album_picks drop constraint o1ocards_album_picks_pkey;
    alter table public.o1ocards_album_picks add primary key (user_id, type_id, rarity_id);
    alter table public.o1ocards_album_picks add constraint o1ocards_album_picks_rarity_fk
      foreign key (rarity_id) references public.o1ocards_rarities (id) on delete cascade;
  end if;
end $$;

-- Un choix d'album dont la carte n'a plus la rareté de son emplacement (réglages du type modifiés, conversion, Alpha/Omega à
-- numéro masqué...) n'a plus de sens : on le retire. Sans effet ensuite.
delete from public.o1ocards_album_picks p
where public.o1ocards_rarity_id(p.number, p.series, p.type_id, p.base_rarity) is distinct from p.rarity_id;

-- ---------- Notifications ----------
drop function if exists public.o1ocards_notifications_list(int);
create or replace function public.o1ocards_notifications_list(p_limit int default 30)
returns table (
  id           bigint,
  kind         text,
  card_type    int,
  card_base    text,
  card_series  int,
  card_number  int,
  rarity_id    text,
  listing_id   bigint,
  offer_id     bigint,
  amount       int,
  actor_name   text,
  read         boolean,
  created_at   timestamptz,
  unread_total bigint
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select n.id, n.kind, n.type_id, n.card_base, n.series, n.number, public.o1ocards_rarity_id(n.number, n.series, n.type_id, n.card_base),
         n.listing_id, n.offer_id, n.amount, n.actor_name, n.read, n.created_at,
         (select count(*) from public.o1ocards_notifications nn where nn.user_id = uid and not nn.read)
  from public.o1ocards_notifications n
  where n.user_id = uid
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100);
end $$;

create or replace function public.o1ocards_notifications_mark_read(p_ids bigint[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_ids is null then
    update public.o1ocards_notifications set read = true where user_id = uid and not read;
  else
    update public.o1ocards_notifications set read = true where user_id = uid and id = any(p_ids);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Crédite un achat Stripe. Appelée uniquement par la fonction serveur du webhook Stripe (rôle service_role).
-- Idempotente : une même session de paiement ne crédite qu'une fois. Renvoie true si les boosters ont été ajoutés.
create or replace function public.o1ocards_credit_purchase(
  p_session_id text, p_user uuid, p_boosters int, p_amount int, p_currency text, p_payment_intent text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if p_boosters is null or p_boosters < 1 or p_boosters > 1000 then raise exception 'invalid_boosters'; end if;
  perform public.o1ocards_ensure_profile(p_user);
  insert into public.o1ocards_purchases (user_id, stripe_session_id, stripe_payment_intent, boosters, amount_cents, currency)
  values (p_user, p_session_id, p_payment_intent, p_boosters, p_amount, p_currency)
  on conflict (stripe_session_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  update public.o1ocards_profiles set bonus_boosters = bonus_boosters + p_boosters where id = p_user;
  return true;
end $$;

-- ---------- Console admin ----------
-- Chaque fonction admin vérifie le mot de passe (haché en base), limite les essais (5 erreurs par compte et 30 au total
-- en 15 minutes) et n'est utilisable que par le compte admin : le premier compte qui saisit le bon mot de passe y est lié.
-- Pour réinitialiser ce lien : delete from o1ocards_secrets where key = 'admin_user_id';
create or replace function public.o1ocards_admin_guard(p_password text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h text; bound text;
begin
  if uid is null then return 'not_authenticated'; end if;
  delete from public.o1ocards_admin_log where created_at < now() - interval '1 day';
  if (select count(*) from public.o1ocards_admin_log where not ok and user_id = uid and created_at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.o1ocards_admin_log where not ok and created_at > now() - interval '15 minutes') >= 30 then
    return 'admin_locked';
  end if;
  select value into h from public.o1ocards_secrets where key = 'admin_password_hash';
  if h is null then return 'admin_not_set'; end if;
  if p_password is null or extensions.crypt(p_password, h) <> h then
    insert into public.o1ocards_admin_log (user_id, ok) values (uid, false);
    return 'admin_denied';
  end if;
  select value into bound from public.o1ocards_secrets where key = 'admin_user_id';
  if bound is null then
    insert into public.o1ocards_secrets (key, value) values ('admin_user_id', uid::text) on conflict (key) do nothing;
    select value into bound from public.o1ocards_secrets where key = 'admin_user_id';
  end if;
  if bound <> uid::text then
    insert into public.o1ocards_admin_log (user_id, ok) values (uid, false);
    return 'admin_denied';
  end if;
  delete from public.o1ocards_admin_log where user_id = uid and not ok;
  return null;
end $$;

-- Définit le mot de passe admin. À lancer UNE FOIS depuis le SQL Editor (non appelable depuis l'application) :
--   select o1ocards_admin_set_password('ton mot de passe');
create or replace function public.o1ocards_admin_set_password(p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_new, '')) < 8 then raise exception 'password_too_short'; end if;
  insert into public.o1ocards_secrets (key, value)
  values ('admin_password_hash', extensions.crypt(p_new, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.o1ocards_admin_change_password(p_password text, p_new text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(coalesce(p_new, '')) < 8 then raise exception 'password_too_short'; end if;
  update public.o1ocards_secrets set value = extensions.crypt(p_new, extensions.gen_salt('bf')) where key = 'admin_password_hash';
  return jsonb_build_object('ok', true);
end $$;

-- Tout ce que la console affiche
create or replace function public.o1ocards_admin_data(p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  return jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'position', c.position, 'series_count', c.series_count,
        'color', c.color, 'color2', c.color2, 'text_color', c.text_color, 'image', c.image, 'enabled', c.enabled, 'closed', c.closed,
        'taken', public.o1ocards_category_taken(c.id), 'total', public.o1ocards_category_total(c.id)
      ) order by c.position, c.id), '[]'::jsonb) from public.o1ocards_categories c),
    'types', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'category_id', t.category_id, 'name', t.name, 'image', t.image, 'position', t.position,
        'series_count', t.series_count, 'secret', t.secret,
        'taken', coalesce((select sum(s.taken) from public.o1ocards_series_taken s where s.type_id = t.id), 0)
      ) order by t.category_id, t.position, t.id), '[]'::jsonb) from public.o1ocards_types t),
    'type_rarities', (select coalesce(jsonb_agg(jsonb_build_object(
        'type_id', tr.type_id, 'rarity_id', tr.rarity_id, 'max_series', tr.max_series, 'numbered_series', tr.numbered_series,
        'card_style', tr.card_style
      ) order by tr.type_id, tr.max_series), '[]'::jsonb) from public.o1ocards_type_rarities tr),
    'config', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'description', description) order by key), '[]'::jsonb)
               from public.o1ocards_config),
    'rarities', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb) from public.o1ocards_rarities r),
    'legal', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value) order by key), '[]'::jsonb)
              from public.o1ocards_legal),
    'players', (select count(*) from public.o1ocards_profiles),
    'unique_wins', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'email', x.email, 'username', x.username,
        'type_id', x.type_id, 'type_name', x.type_name, 'category_id', x.category_id, 'won_at', x.won_at
      ) order by x.won_at desc), '[]'::jsonb)
      from (
        select w.id, u.email, p.username, w.type_id, t.name as type_name, t.category_id, w.won_at
        from public.o1ocards_unique_wins w
        join auth.users u on u.id = w.user_id
        left join public.o1ocards_profiles p on p.id = w.user_id
        join public.o1ocards_types t on t.id = w.type_id
        order by w.won_at desc
        limit 500
      ) x)
  );
end $$;

-- Une catégorie : nom, position, nombre de séries par défaut de ses types, couleurs. Les raretés se règlent par type
-- (admin_save_type_rarities), plus par catégorie.
drop function if exists public.o1ocards_admin_save_category(text, int, text, int, int, text, text, text, boolean, jsonb);
-- p_image : null = inchangée (aucune à la création), '' = retirer, sinon emoji, adresse https ou image intégrée (comme un type)
drop function if exists public.o1ocards_admin_save_category(text, int, text, int, int, text, text, text, boolean);
create or replace function public.o1ocards_admin_save_category(
  p_password text, p_id int, p_name text, p_position int, p_series_count int,
  p_color text, p_color2 text, p_text_color text, p_enabled boolean, p_image text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password); v_id int; v_image text := coalesce(p_image, '');
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(v_image) > 300000 then raise exception 'image_too_large'; end if;
  if v_image <> '' and char_length(v_image) > 16
     and v_image !~ '^https://' and v_image !~ '^data:image/(png|jpeg|webp|gif|svg\+xml);base64,' then
    raise exception 'invalid_image';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 40 then raise exception 'invalid_name'; end if;
  if p_series_count is null or p_series_count < 1 or p_series_count > 5000 then raise exception 'invalid_series'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' or p_color2 !~ '^#[0-9a-fA-F]{6}$' or p_text_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  if p_id is null then
    insert into public.o1ocards_categories (name, position, series_count, color, color2, text_color, enabled, image)
    values (trim(p_name), coalesce(p_position, 1), p_series_count, p_color, p_color2, p_text_color, coalesce(p_enabled, true), v_image)
    returning id into v_id;
  else
    if exists (select 1 from public.o1ocards_categories where id = p_id and series_count <> p_series_count)
       and public.o1ocards_category_taken(p_id) > 0 then
      raise exception 'series_locked';   -- on ne change pas le nombre de séries une fois des cartes tirées
    end if;
    update public.o1ocards_categories
    set name = trim(p_name), position = coalesce(p_position, position), series_count = p_series_count,
        color = p_color, color2 = p_color2, text_color = p_text_color, enabled = coalesce(p_enabled, enabled),
        image = case when p_image is null then image else v_image end
    where id = p_id;
    if not found then raise exception 'not_found'; end if;
    v_id := p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Terminer (ou rouvrir) une catégorie à la main : la suivante prend le relais
create or replace function public.o1ocards_admin_set_category_closed(p_password text, p_id int, p_closed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  update public.o1ocards_categories set closed = coalesce(p_closed, false) where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.o1ocards_admin_delete_category(p_password text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if exists (select 1 from public.o1ocards_cards c join public.o1ocards_types t on t.id = c.type_id where t.category_id = p_id) then
    raise exception 'category_started';
  end if;
  delete from public.o1ocards_categories where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Supprime une catégorie ET tout ce qui en dépend : types, cartes déjà tirées (et donc retirées aux joueurs
-- qui les possédaient), annonces, enchères, offres, notifications liées, favoris, seuils de rareté, 1/1
-- journalisées. Opération destructive et irréversible : demande de retaper le nom exact de la catégorie en
-- confirmation. Rembourse d'abord les enchérisseurs en tête sur les enchères actives (leurs pièces sont déjà
-- débitées/bloquées), pour qu'aucune pièce ne disparaisse du jeu.
create or replace function public.o1ocards_admin_force_delete_category(p_password text, p_id int, p_confirm_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password); v_name text; v_refunded int;
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  select name into v_name from public.o1ocards_categories where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if trim(coalesce(p_confirm_name, '')) <> v_name then raise exception 'name_mismatch'; end if;

  with refunded as (
    update public.o1ocards_profiles p
    set coins = coins + l.current_bid
    from public.o1ocards_listings l
    where l.type_id in (select id from public.o1ocards_types where category_id = p_id)
      and l.status = 'active' and l.kind = 'auction' and l.current_bidder = p.id
    returning 1
  )
  select count(*) into v_refunded from refunded;

  -- Pas de clé étrangère depuis ces trois tables vers types/categories : suppression explicite nécessaire
  delete from public.o1ocards_listings      where type_id in (select id from public.o1ocards_types where category_id = p_id);
  delete from public.o1ocards_offers        where type_id in (select id from public.o1ocards_types where category_id = p_id);
  delete from public.o1ocards_notifications where type_id in (select id from public.o1ocards_types where category_id = p_id);

  -- Le reste suit par clé étrangère ON DELETE CASCADE : types -> cartes, raretés des types, series_rewards,
  -- unique_wins, favoris
  delete from public.o1ocards_categories where id = p_id;

  return jsonb_build_object('ok', true, 'refunded_bidders', coalesce(v_refunded, 0));
end $$;

-- Type de carte : image = emoji, adresse https:// ou image intégrée (data:image/...)
create or replace function public.o1ocards_admin_save_type(
  p_password text, p_id int, p_category int, p_name text, p_image text, p_position int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password); v_id int; v_image text := coalesce(p_image, '');
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 60 then raise exception 'invalid_name'; end if;
  if char_length(v_image) > 300000 then raise exception 'image_too_large'; end if;
  if v_image <> '' and char_length(v_image) > 16
     and v_image !~ '^https://' and v_image !~ '^data:image/(png|jpeg|webp|gif|svg\+xml);base64,' then
    raise exception 'invalid_image';
  end if;
  if p_id is null then
    if not exists (select 1 from public.o1ocards_categories where id = p_category) then raise exception 'not_found'; end if;
    insert into public.o1ocards_types (category_id, name, image, position)
    values (p_category, trim(p_name), v_image, coalesce(p_position, 1)) returning id into v_id;
  else
    update public.o1ocards_types
    set name = trim(p_name), image = v_image, position = coalesce(p_position, position)
    where id = p_id;
    if not found then raise exception 'not_found'; end if;
    v_id := p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Import en masse de types dans une catégorie : [{"name":"Football","position":1,"image":"⚽"}, ...] (500 max).
-- image : vide, un emoji (16 caractères max), une adresse https:// ou une image intégrée (data:image/png|jpeg|webp|gif ; 300 000
-- caractères max). position vide = à la suite des types existants. secret : booléen facultatif. rarities : tableau facultatif de
-- {rarity_id, max_series, numbered_series, card_style}, mêmes règles que admin_save_type_rarities (absent = réglages par défaut).
-- Tout ou rien : une ligne invalide annule l'import entier ('invalid_import_row:N', N = rang dans le fichier). Un type dont
-- le nom existe déjà dans la catégorie (casse ignorée) est ignoré, pour pouvoir réimporter un fichier sans doublons.
create or replace function public.o1ocards_admin_import_types(p_password text, p_category int, p_types jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  err text := public.o1ocards_admin_guard(p_password);
  x jsonb; i int := 0; v_name text; v_image text; v_pos int; v_created int := 0; v_skipped int := 0; v_id int; v_secret boolean;
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if not exists (select 1 from public.o1ocards_categories where id = p_category) then raise exception 'not_found'; end if;
  if p_types is null or jsonb_typeof(p_types) <> 'array' or jsonb_array_length(p_types) = 0 then raise exception 'invalid_import'; end if;
  if jsonb_array_length(p_types) > 500 then raise exception 'import_too_large'; end if;

  for x in select * from jsonb_array_elements(p_types) loop
    i := i + 1;
    v_name := trim(coalesce(x->>'name', ''));
    v_image := coalesce(x->>'image', '');
    if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'invalid_import_row:%', i; end if;
    if coalesce(x->>'position', '') = '' then v_pos := null;
    elsif (x->>'position') ~ '^[0-9]{1,6}$' then v_pos := (x->>'position')::int;
    else raise exception 'invalid_import_row:%', i;
    end if;
    -- image : vide, https:// (sans espace, 2000 caractères max), image intégrée png/jpeg/webp/gif ou emoji court ; http:, javascript:... refusés
    if v_image <> '' then
      if v_image ~ '^https://' then
        if v_image ~ '\s' or char_length(v_image) > 2000 then raise exception 'invalid_import_row:%', i; end if;
      elsif v_image ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$' then
        if char_length(v_image) > 300000 then raise exception 'invalid_import_row:%', i; end if;
      elsif v_image ~ '^[A-Za-z][A-Za-z0-9+.-]*:' or char_length(v_image) > 16 then
        raise exception 'invalid_import_row:%', i;
      end if;
    end if;
    if x ? 'secret' and jsonb_typeof(x->'secret') not in ('boolean', 'null') then raise exception 'invalid_import_row:%', i; end if;
    v_secret := coalesce((x->>'secret')::boolean, false);
    if x ? 'rarities' and jsonb_typeof(x->'rarities') not in ('array', 'null') then raise exception 'invalid_import_row:%', i; end if;

    if exists (select 1 from public.o1ocards_types where category_id = p_category and lower(name) = lower(v_name)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.o1ocards_types (category_id, name, image, position, secret)
    values (p_category, v_name, v_image,
            coalesce(v_pos, (select coalesce(max(position), 0) + 1 from public.o1ocards_types where category_id = p_category)), v_secret)
    returning id into v_id;
    if jsonb_typeof(x->'rarities') = 'array' and jsonb_array_length(x->'rarities') > 0 then
      begin
        perform public.o1ocards_apply_type_rarities(v_id, x->'rarities', null);
      exception when others then
        raise exception 'invalid_import_row:%', i;   -- une rareté invalide annule tout l'import (tout ou rien)
      end;
    end if;
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created, 'skipped', v_skipped);
end $$;

create or replace function public.o1ocards_admin_delete_type(p_password text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if exists (select 1 from public.o1ocards_cards where type_id = p_id) then raise exception 'type_started'; end if;
  delete from public.o1ocards_types where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.o1ocards_admin_set_config(p_password text, p_key text, p_value numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if p_value is null then raise exception 'invalid_value'; end if;
  update public.o1ocards_config set value = p_value where key = p_key;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.o1ocards_admin_save_rarity(
  p_password text, p_id text, p_name text, p_max_series int, p_color text, p_color2 text, p_text_color text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 30 then raise exception 'invalid_name'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' or p_color2 !~ '^#[0-9a-fA-F]{6}$' or p_text_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  update public.o1ocards_rarities
  set name = trim(p_name), color = p_color, color2 = p_color2, text_color = p_text_color,
      max_series = case when kind = 'range' then p_max_series else max_series end
  where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Ajoute une nouvelle rareté « range » (seul type qu'on peut ajouter : Unique/Alpha/Omega restent uniques par
-- construction). p_max_series est obligatoire (pas de nouveau plafond ouvert : « Commune » reste la seule rareté
-- sans limite). Ajoutée automatiquement aux seuils des catégories qui ont déjà les leurs, pour qu'elle y soit
-- utilisable tout de suite (à ajuster ensuite dans le formulaire de chaque catégorie si besoin).
drop function if exists public.o1ocards_admin_create_rarity(text, text, text, int, text, text, text);
-- p_before (facultatif) : id d'une rareté devant laquelle placer la nouvelle dans l'ordre d'affichage (la plus rare
-- d'abord) ; sinon elle passe en dernier. L'ordre n'influe pas sur les tranches de séries, seulement sur l'affichage.
create or replace function public.o1ocards_admin_create_rarity(
  p_password text, p_id text, p_name text, p_max_series int, p_color text, p_color2 text, p_text_color text,
  p_before text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password); v_id text := lower(trim(coalesce(p_id, ''))); v_sort int;
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if v_id !~ '^[a-z][a-z0-9_]{1,19}$' then raise exception 'invalid_id'; end if;
  if exists (select 1 from public.o1ocards_rarities where id = v_id) then raise exception 'id_taken'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 30 then raise exception 'invalid_name'; end if;
  if p_max_series is null or p_max_series < 1 then raise exception 'invalid_max_series'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' or p_color2 !~ '^#[0-9a-fA-F]{6}$' or p_text_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;

  if p_before is not null then
    select sort_order into v_sort from public.o1ocards_rarities where id = p_before;
    if not found then raise exception 'not_found'; end if;
    update public.o1ocards_rarities set sort_order = sort_order + 1 where sort_order >= v_sort;
  else
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.o1ocards_rarities;
  end if;
  insert into public.o1ocards_rarities (id, name, kind, max_series, sort_order, color, color2, text_color)
  values (v_id, trim(p_name), 'range', p_max_series, v_sort, p_color, p_color2, p_text_color);

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Raretés d'un type (logique « Topps ») : p_rarities = [{"rarity_id":"ultra","max_series":50,"numbered_series":5}, ...].
-- CHAQUE rareté a ses propres séries : max_series = nombre de séries (cartes 1/1 à max/max) ; 0 = la rareté n'existe pas pour ce type
-- (une carte peut n'exister que dans une seule rareté) ; numbered_series : de 0 (rareté non
-- numérotée : numéro jamais visible) à max_series (tous les numéros visibles) = nombre de séries, en partant de la 1re, dont le
-- numéro est visible ; les suivantes sont numérotées en interne, numéro masqué. Une rareté n'apparaît qu'une fois ; les nombres
-- de séries des raretés sont indépendants (pas d'ordre à respecter).
-- Tableau vide : le type retrouve les réglages par défaut (table rarities). null : inchangé. p_secret : type secret (caché aux
-- joueurs tant qu'ils n'en ont aucune carte) ; null : inchangé.
-- Refusé si des cartes déjà tirées ne rentreraient plus dans les nouveaux réglages (rareté retirée ou série réduite).
-- Logique commune (sans mot de passe) : enregistre les raretés d'un type et son statut secret. Appelée par admin_save_type_rarities
-- et par admin_import_types ; elle n'est pas appelable directement (droits retirés plus bas).
create or replace function public.o1ocards_apply_type_rarities(p_type int, p_rarities jsonb, p_secret boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int; v_top int;
begin
  if not exists (select 1 from public.o1ocards_types where id = p_type) then raise exception 'not_found'; end if;

  if p_rarities is not null then
    if jsonb_typeof(p_rarities) <> 'array' then raise exception 'invalid_type_rarities'; end if;
    v_n := jsonb_array_length(p_rarities);
    if v_n > 0 then
      if exists (
        select 1 from jsonb_array_elements(p_rarities) e
        where jsonb_typeof(e) <> 'object' or coalesce(e->>'rarity_id', '') = ''
           or coalesce(e->>'max_series', '') !~ '^[0-9]{1,4}$'
           or coalesce(e->>'numbered_series', '0') !~ '^[0-9]{1,4}$'
           or coalesce(e->>'card_style', 'simple') not in ('simple', 'fullart')
      ) then raise exception 'invalid_type_rarities'; end if;
      if (select count(distinct e->>'rarity_id') from jsonb_array_elements(p_rarities) e) <> v_n then
        raise exception 'invalid_type_rarities';   -- une même rareté deux fois
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_rarities) e
        where not exists (select 1 from public.o1ocards_rarities r where r.id = e->>'rarity_id' and r.kind = 'range')
      ) then raise exception 'invalid_type_rarities'; end if;
      if exists (
        select 1 from jsonb_array_elements(p_rarities) e
        where (e->>'max_series')::int > 5000
           or coalesce((e->>'numbered_series')::int, 0) > (e->>'max_series')::int
      ) then raise exception 'invalid_type_rarities'; end if;
      -- au moins une rareté doit avoir des séries (tout à 0 = un type sans aucune carte)
      if not exists (select 1 from jsonb_array_elements(p_rarities) e where (e->>'max_series')::int >= 1) then
        raise exception 'invalid_type_rarities';
      end if;

      -- les cartes déjà tirées doivent rentrer dans les nouveaux réglages
      if exists (
        select 1 from public.o1ocards_cards c
        where c.type_id = p_type
          and not exists (select 1 from jsonb_array_elements(p_rarities) e
                          where e->>'rarity_id' = c.base_rarity and (e->>'max_series')::int >= c.series and (e->>'max_series')::int >= 1)
      ) then raise exception 'series_locked'; end if;

      delete from public.o1ocards_type_rarities where type_id = p_type;
      insert into public.o1ocards_type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
      select p_type, e->>'rarity_id', (e->>'max_series')::int, coalesce((e->>'numbered_series')::int, 0), coalesce(e->>'card_style', 'simple')
      from jsonb_array_elements(p_rarities) e
      where (e->>'max_series')::int >= 1;   -- une rareté à 0 série n'est pas enregistrée : elle n'existe pas pour ce type
      select max((e->>'max_series')::int) into v_top from jsonb_array_elements(p_rarities) e;
      update public.o1ocards_types set series_count = v_top where id = p_type;
    else
      delete from public.o1ocards_type_rarities where type_id = p_type;
      if exists (
        select 1 from public.o1ocards_cards c
        where c.type_id = p_type
          and not exists (select 1 from public.o1ocards_type_config(p_type) cf where cf.rarity_id = c.base_rarity and cf.smax >= c.series)
      ) then raise exception 'series_locked'; end if;
      update public.o1ocards_types set series_count = null where id = p_type;
    end if;
  end if;

  if p_secret is not null then update public.o1ocards_types set secret = p_secret where id = p_type; end if;
end $$;

create or replace function public.o1ocards_admin_save_type_rarities(
  p_password text, p_type int, p_rarities jsonb default null, p_secret boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  perform public.o1ocards_apply_type_rarities(p_type, p_rarities, p_secret);
  return jsonb_build_object('ok', true);
end $$;

-- Autorisée seulement si aucune carte n'a encore été classée dans cette rareté (sinon leur affichage casserait)
create or replace function public.o1ocards_admin_delete_rarity(p_password text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password); v_kind text;
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  select kind into v_kind from public.o1ocards_rarities where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if v_kind <> 'range' then raise exception 'rarity_protected'; end if;
  if exists (select 1 from public.o1ocards_golden_contents where rarity_id = p_id) then raise exception 'rarity_in_use'; end if;
  if exists (select 1 from public.o1ocards_type_rarities where rarity_id = p_id) then raise exception 'rarity_in_use'; end if;
  if exists (select 1 from public.o1ocards_cards c where c.base_rarity = p_id) then
    raise exception 'rarity_in_use';
  end if;
  delete from public.o1ocards_rarities where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.o1ocards_admin_set_legal(p_password text, p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.o1ocards_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(coalesce(p_value, '')) > 2000 then raise exception 'invalid_value'; end if;
  update public.o1ocards_legal set value = coalesce(p_value, '') where key = p_key;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Droits d'exécution ----------
-- Fonctions internes : jamais appelables depuis l'application
revoke all on function public.o1ocards_ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.o1ocards_sync(uuid) from public, anon, authenticated;
revoke all on function public.o1ocards_settle_due() from public, anon, authenticated;
revoke all on function public.o1ocards_status_json(public.o1ocards_profiles) from public, anon, authenticated;
revoke all on function public.o1ocards_cards_counter() from public, anon, authenticated;
revoke all on function public.o1ocards_draw_rarity(text, int) from public, anon, authenticated;
revoke all on function public.o1ocards_draw_golden(uuid, int) from public, anon, authenticated;
revoke all on function public.o1ocards_owns_card_rarity(uuid, int, text) from public, anon, authenticated;
revoke all on function public.o1ocards_series_rewards_backfill() from public, anon, authenticated;
revoke all on function public.o1ocards_stack_cards(uuid, int, text) from public, anon, authenticated;
revoke all on function public.o1ocards_cards_reward() from public, anon, authenticated;
revoke all on function public.o1ocards_admin_guard(text) from public, anon, authenticated;
-- Réservée au SQL Editor (mot de passe admin initial)
revoke all on function public.o1ocards_admin_set_password(text) from public, anon, authenticated;
-- Réservée à la fonction serveur du webhook Stripe
revoke all on function public.o1ocards_credit_purchase(text, uuid, int, int, text, text) from public, anon, authenticated;
grant execute on function public.o1ocards_credit_purchase(text, uuid, int, int, text, text) to service_role;

-- Fonctions de l'application : joueurs connectés uniquement
revoke all on function public.o1ocards_status()                                          from public, anon;
revoke all on function public.o1ocards_open_booster()                                    from public, anon;
revoke all on function public.o1ocards_open_golden_pack()                                from public, anon;
revoke all on function public.o1ocards_ack_rewards()                                     from public, anon;
revoke all on function public.o1ocards_list_collection(int, int, text, text, int, int)   from public, anon;
revoke all on function public.o1ocards_my_stats(int)                                     from public, anon;
revoke all on function public.o1ocards_draw_odds(int)                                    from public, anon;
revoke all on function public.o1ocards_set_username(text)                                from public, anon;
revoke all on function public.o1ocards_sell_direct(int, text, int, int)                        from public, anon;
revoke all on function public.o1ocards_list_card(int, text, int, int, text, int)               from public, anon;
revoke all on function public.o1ocards_cancel_listing(bigint)                            from public, anon;
revoke all on function public.o1ocards_buy_now(bigint)                                   from public, anon;
revoke all on function public.o1ocards_place_bid(bigint, int)                            from public, anon;
revoke all on function public.o1ocards_market_list(text, text, int, int)                 from public, anon;
revoke all on function public.o1ocards_market_mine()                                     from public, anon;
revoke all on function public.o1ocards_admin_change_password(text, text)                 from public, anon;
revoke all on function public.o1ocards_admin_data(text)                                  from public, anon;
revoke all on function public.o1ocards_admin_save_category(text, int, text, int, int, text, text, text, boolean, text)  from public, anon;
revoke all on function public.o1ocards_admin_set_category_closed(text, int, boolean)     from public, anon;
revoke all on function public.o1ocards_admin_delete_category(text, int)                  from public, anon;
revoke all on function public.o1ocards_admin_force_delete_category(text, int, text)      from public, anon;
revoke all on function public.o1ocards_admin_save_type(text, int, int, text, text, int)  from public, anon;
revoke all on function public.o1ocards_admin_import_types(text, int, jsonb)          from public, anon;
revoke all on function public.o1ocards_admin_delete_type(text, int)                      from public, anon;
revoke all on function public.o1ocards_admin_set_config(text, text, numeric)             from public, anon;
revoke all on function public.o1ocards_admin_save_rarity(text, text, text, int, text, text, text) from public, anon;
revoke all on function public.o1ocards_admin_create_rarity(text, text, text, int, text, text, text, text) from public, anon;
revoke all on function public.o1ocards_admin_save_type_rarities(text, int, jsonb, boolean)             from public, anon;
revoke all on function public.o1ocards_apply_type_rarities(int, jsonb, boolean)                           from public, anon, authenticated;
revoke all on function public.o1ocards_admin_delete_rarity(text, text)                                from public, anon;
revoke all on function public.o1ocards_admin_set_legal(text, text, text)                 from public, anon;
revoke all on function public.o1ocards_album_view(int)                                   from public, anon;
revoke all on function public.o1ocards_sell_direct_many(int, text, int)                   from public, anon;
revoke all on function public.o1ocards_list_stack_card(int, text, text, int)              from public, anon;
revoke all on function public.o1ocards_my_type_cards(int, text)                          from public, anon;
revoke all on function public.o1ocards_set_album_pick(int, text, int, int)                     from public, anon;
revoke all on function public.o1ocards_clear_album_pick(int, text)                       from public, anon;
revoke all on function public.o1ocards_toggle_favorite(int, text, int, int)                    from public, anon;
revoke all on function public.o1ocards_list_favorites()                                  from public, anon;
revoke all on function public.o1ocards_make_offer(int, text, int, int, int)                    from public, anon;
revoke all on function public.o1ocards_cancel_offer(bigint)                              from public, anon;
revoke all on function public.o1ocards_respond_offer(bigint, boolean)                    from public, anon;
revoke all on function public.o1ocards_my_offers()                                       from public, anon;
revoke all on function public.o1ocards_notifications_list(int)                           from public, anon;
revoke all on function public.o1ocards_notifications_mark_read(bigint[])                 from public, anon;

grant execute on function public.o1ocards_status()                                          to authenticated;
grant execute on function public.o1ocards_open_booster()                                    to authenticated;
grant execute on function public.o1ocards_open_golden_pack()                                to authenticated;
grant execute on function public.o1ocards_ack_rewards()                                     to authenticated;
grant execute on function public.o1ocards_list_collection(int, int, text, text, int, int)   to authenticated;
grant execute on function public.o1ocards_my_stats(int)                                     to authenticated;
grant execute on function public.o1ocards_draw_odds(int)                                    to authenticated;
grant execute on function public.o1ocards_set_username(text)                                to authenticated;
grant execute on function public.o1ocards_sell_direct(int, text, int, int)                        to authenticated;
grant execute on function public.o1ocards_list_card(int, text, int, int, text, int)               to authenticated;
grant execute on function public.o1ocards_cancel_listing(bigint)                            to authenticated;
grant execute on function public.o1ocards_buy_now(bigint)                                   to authenticated;
grant execute on function public.o1ocards_place_bid(bigint, int)                            to authenticated;
grant execute on function public.o1ocards_market_list(text, text, int, int)                 to authenticated;
grant execute on function public.o1ocards_market_mine()                                     to authenticated;
grant execute on function public.o1ocards_admin_change_password(text, text)                 to authenticated;
grant execute on function public.o1ocards_admin_data(text)                                  to authenticated;
grant execute on function public.o1ocards_admin_save_category(text, int, text, int, int, text, text, text, boolean, text)  to authenticated;
grant execute on function public.o1ocards_admin_set_category_closed(text, int, boolean)     to authenticated;
grant execute on function public.o1ocards_admin_delete_category(text, int)                  to authenticated;
grant execute on function public.o1ocards_admin_force_delete_category(text, int, text)      to authenticated;
grant execute on function public.o1ocards_admin_save_type(text, int, int, text, text, int)  to authenticated;
grant execute on function public.o1ocards_admin_import_types(text, int, jsonb)          to authenticated;
grant execute on function public.o1ocards_admin_delete_type(text, int)                      to authenticated;
grant execute on function public.o1ocards_admin_set_config(text, text, numeric)             to authenticated;
grant execute on function public.o1ocards_admin_save_rarity(text, text, text, int, text, text, text) to authenticated;
grant execute on function public.o1ocards_admin_create_rarity(text, text, text, int, text, text, text, text) to authenticated;
grant execute on function public.o1ocards_admin_save_type_rarities(text, int, jsonb, boolean)             to authenticated;
grant execute on function public.o1ocards_admin_delete_rarity(text, text)                                to authenticated;
grant execute on function public.o1ocards_admin_set_legal(text, text, text)                 to authenticated;
grant execute on function public.o1ocards_album_view(int)                                   to authenticated;
grant execute on function public.o1ocards_sell_direct_many(int, text, int)                   to authenticated;
grant execute on function public.o1ocards_list_stack_card(int, text, text, int)              to authenticated;
grant execute on function public.o1ocards_my_type_cards(int, text)                          to authenticated;
grant execute on function public.o1ocards_set_album_pick(int, text, int, int)                     to authenticated;
grant execute on function public.o1ocards_clear_album_pick(int, text)                       to authenticated;
grant execute on function public.o1ocards_toggle_favorite(int, text, int, int)                    to authenticated;
grant execute on function public.o1ocards_list_favorites()                                  to authenticated;
grant execute on function public.o1ocards_make_offer(int, text, int, int, int)                    to authenticated;
grant execute on function public.o1ocards_cancel_offer(bigint)                              to authenticated;
grant execute on function public.o1ocards_respond_offer(bigint, boolean)                    to authenticated;
grant execute on function public.o1ocards_my_offers()                                       to authenticated;
grant execute on function public.o1ocards_notifications_list(int)                           to authenticated;
grant execute on function public.o1ocards_notifications_mark_read(bigint[])                 to authenticated;
