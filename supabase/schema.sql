-- =====================================================================
-- OneOfOne Pack : schéma Supabase (toutes les tables commencent par opennumber_)
-- À coller en entier dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Structure : catégories de boosters (Années 80, Années 90...) > types de cartes > séries numérotées.
-- Première exécution de cette version : les cartes, le marché et les pièces de l'ancienne structure sont
-- remis à zéro. Les comptes, les boosters et les achats sont conservés.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Migration depuis l'ancienne structure (cartes sans catégorie ni type) ----------
do $$
begin
  if to_regclass('public.opennumber_collection') is not null then
    drop table public.opennumber_collection;
  end if;
  if to_regclass('public.opennumber_cards') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'opennumber_cards' and column_name = 'type_id') then
    drop table if exists public.opennumber_bids;
    drop table if exists public.opennumber_listings;
    drop table if exists public.opennumber_series_taken;
    drop table public.opennumber_cards;
    if to_regclass('public.opennumber_profiles') is not null then
      update public.opennumber_profiles set coins = 0;
    end if;
    if to_regclass('public.opennumber_config') is not null then
      update public.opennumber_config set value = 2 where key = 'cgv_version' and value < 2;
    end if;
  end if;
end $$;

-- Anciennes fonctions remplacées
drop function if exists public.opennumber_series_owned(int);
drop function if exists public.opennumber_is_pow10(int);
drop function if exists public.opennumber_list_collection(text, text, int, int);
drop function if exists public.opennumber_series_state(int);
drop function if exists public.opennumber_my_stats();
drop function if exists public.opennumber_sell_direct(int, int);
drop function if exists public.opennumber_list_card(int, int, text, int);
drop function if exists public.opennumber_draw_rarity(text);
drop function if exists public.opennumber_market_list(text, text, int, int);
drop function if exists public.opennumber_market_mine();

-- ---------- Configuration du jeu (modifiable à tout moment) ----------
create table if not exists public.opennumber_config (
  key         text primary key,
  value       numeric not null,
  description text
);

insert into public.opennumber_config (key, value, description) values
  ('cards_per_booster',      5,    'Nombre de cartes par booster'),
  ('start_boosters',         10,   'Boosters offerts à la création du profil'),
  ('start_coins',            0,    'Pièces offertes à la création du profil'),
  ('regen_minutes',          10,   'Délai entre deux recharges (minutes)'),
  ('regen_amount',           10,   'Boosters gagnés à chaque recharge'),
  ('max_boosters',           10,   'Plafond de boosters en stock'),
  ('rarity_exponent',        0,    'Poids d''une carte = taille_de_série ^ exposant. 0 = chaque carte disponible a la même chance (recommandé), 1 = les petites séries sont très difficiles à obtenir'),
  ('direct_sell_price',      1,    'Pièces reçues pour une revente directe (la carte retourne dans les boosters)'),
  ('auction_minutes',        60,   'Durée d''une enchère (minutes)'),
  ('auction_start_price',    1,    'Prix de départ d''une enchère (pièces)'),
  ('auction_min_increment',  1,    'Surenchère minimale (pièces)'),
  ('auction_extend_seconds', 60,   'Si une mise arrive dans les X dernières secondes, le compteur repart à X secondes'),
  ('golden_booster_chance',  0.00000001, 'Chance qu''un booster soit doré (0.00000001 = 0,000001 %). Contenu dans opennumber_golden_contents'),
  ('shop_enabled',           0,    'Boutique Stripe : 1 = visible dans l''application, 0 = masquée (à passer à 1 une fois Stripe configuré)'),
  ('stripe_pack_boosters',   10,   'Boosters bonus ajoutés par achat'),
  ('stripe_pack_price_cents', 99,  'Prix d''un pack en centimes d''euro (99 = 0,99 EUR)'),
  ('cgv_version',            2,    'Version des conditions générales de vente. À incrémenter à chaque modification du texte : les joueurs doivent alors ré-accepter avant de payer')
on conflict (key) do nothing;
-- Le nombre de séries se règle maintenant par catégorie (console admin)
delete from public.opennumber_config where key = 'max_series';

-- ---------- Raretés (noms, couleurs, seuils modifiables) ----------
-- kind : unique  = la carte 1/1
--        alpha   = toutes les cartes numérotées 1/ (1/2, 1/3 ... 1/1413)
--        omega   = toutes les dernières cartes d'une série (2/2, 3/3 ... 1413/1413)
--        range   = les autres cartes, selon la taille de série (max_series = taille maximale incluse, null = toutes les autres)
-- sort_order : 1 = la plus rare
create table if not exists public.opennumber_rarities (
  id         text primary key,
  name       text not null,
  kind       text not null check (kind in ('unique', 'alpha', 'omega', 'range')),
  max_series int,
  sort_order int not null,
  color      text not null,
  color2     text not null,
  text_color text not null
);

insert into public.opennumber_rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
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
  if coalesce((select value from public.opennumber_config where key = 'rarity_model_version'), 0) < 2 then
    update public.opennumber_config set value = 0,
      description = 'Poids d''une carte = taille_de_série ^ exposant. 0 = chaque carte disponible a la même chance (recommandé), 1 = les petites séries sont très difficiles à obtenir'
    where key = 'rarity_exponent' and value = 1;
    update public.opennumber_rarities set max_series = 35 where id = 'ultra' and kind = 'range' and max_series = 10;
    insert into public.opennumber_config (key, value, description)
    values ('rarity_model_version', 2, 'Version du modèle de rareté (ne pas modifier : marqueur de migration)')
    on conflict (key) do update set value = 2;
  end if;
end $$;

-- Contenu d'un booster doré : une ligne par rareté, avec le nombre de cartes tirées dans cette rareté
create table if not exists public.opennumber_golden_contents (
  rarity_id text primary key references public.opennumber_rarities (id) on delete cascade,
  quantity  int not null default 1 check (quantity >= 1)
);
insert into public.opennumber_golden_contents (rarity_id, quantity) values
  ('alpha', 1), ('omega', 1), ('ultra', 1), ('super', 1), ('rare', 1)
on conflict (rarity_id) do nothing;

-- ---------- Profils ----------
create table if not exists public.opennumber_profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text not null,
  boosters            int  not null default 0,
  boosters_updated_at timestamptz not null default now(),
  boosters_opened     int  not null default 0,
  created_at          timestamptz not null default now()
);
alter table public.opennumber_profiles add column if not exists coins bigint not null default 0;
-- Boosters achetés : hors plafond de recharge, consommés après le stock gratuit
alter table public.opennumber_profiles add column if not exists bonus_boosters int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opennumber_profiles_coins_check') then
    alter table public.opennumber_profiles add constraint opennumber_profiles_coins_check check (coins >= 0);
  end if;
end $$;

-- ---------- Catalogue : catégories de boosters et types de cartes ----------
-- Une seule catégorie est ouvrable à la fois : la première (par position) qui est activée et pas terminée.
-- Quand toutes ses cartes sont tirées, elle est marquée « closed » et la suivante prend le relais.
create table if not exists public.opennumber_categories (
  id           int generated always as identity primary key,
  name         text not null,
  position     int  not null default 1,
  series_count int  not null default 500 check (series_count between 1 and 5000),  -- séries de 1/1 à N/N pour chaque type
  color        text not null,   -- couleur principale (fond des cartes et du booster)
  color2       text not null,   -- couleur plus soutenue
  text_color   text not null,
  enabled      boolean not null default true,
  closed       boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Un type de carte : chaque type a sa propre numérotation de 1/1 à N/N.
-- image : un emoji, une adresse https:// ou une image intégrée (data:image/...)
create table if not exists public.opennumber_types (
  id          int generated always as identity primary key,
  category_id int  not null references public.opennumber_categories (id) on delete cascade,
  name        text not null,
  image       text not null default '',
  position    int  not null default 1
);
create index if not exists opennumber_types_category_idx on public.opennumber_types (category_id, position);

-- Catalogue de départ (seulement si aucune catégorie n'existe) : modifiable ensuite dans la console admin
do $$
declare c int;
begin
  if not exists (select 1 from public.opennumber_categories) then
    insert into public.opennumber_categories (name, position, series_count, color, color2, text_color)
    values ('Années 80', 1, 500, '#ffc88a', '#f29a45', '#3d1f00') returning id into c;
    insert into public.opennumber_types (category_id, name, image, position) values
      (c, 'Magnétoscope VHS', '📼', 1), (c, 'Baladeur cassette', '🎧', 2), (c, 'Téléviseur cathodique', '📺', 3),
      (c, 'Console de jeux', '🎮', 4), (c, 'Caméscope', '📹', 5), (c, 'Téléphone à cadran', '☎️', 6),
      (c, 'Fax', '📠', 7), (c, 'Disquette', '💾', 8);

    insert into public.opennumber_categories (name, position, series_count, color, color2, text_color)
    values ('Années 90', 2, 500, '#a8d8ff', '#5fb0f0', '#05304f') returning id into c;
    insert into public.opennumber_types (category_id, name, image, position) values
      (c, 'Console de jeux 32 bits', '🎮', 1), (c, 'Console portable', '🕹️', 2), (c, 'Animal électronique de poche', '🐣', 3),
      (c, 'TV cathodique grand écran', '📺', 4), (c, 'Discman / lecteur CD portable', '💿', 5), (c, 'Téléphone portable à antenne', '📱', 6),
      (c, 'Appareil photo jetable', '📷', 7), (c, 'Lecteur DVD', '🎥', 8);
  end if;
end $$;

-- ---------- Cartes : chaque carte n'existe qu'en UN exemplaire ----------
-- Une ligne = une carte déjà tirée et son propriétaire. Une carte absente de la table est encore dans les boosters.
create table if not exists public.opennumber_cards (
  type_id     int  not null references public.opennumber_types (id) on delete cascade,
  series      int  not null check (series >= 1),
  number      int  not null check (number >= 1 and number <= series),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  obtained_at timestamptz not null default now(),
  primary key (type_id, series, number)
);
create index if not exists opennumber_cards_owner_idx on public.opennumber_cards (owner_id, type_id, series, number);

-- Compteur de cartes déjà tirées par type et par série (pour un tirage rapide)
create table if not exists public.opennumber_series_taken (
  type_id int not null references public.opennumber_types (id) on delete cascade,
  series  int not null,
  taken   int not null default 0,
  primary key (type_id, series)
);

create or replace function public.opennumber_cards_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opennumber_series_taken (type_id, series, taken) values (new.type_id, new.series, 1)
    on conflict (type_id, series) do update set taken = opennumber_series_taken.taken + 1;
    return new;
  elsif tg_op = 'DELETE' then
    update public.opennumber_series_taken set taken = greatest(taken - 1, 0)
    where type_id = old.type_id and series = old.series;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists opennumber_cards_counter_trg on public.opennumber_cards;
create trigger opennumber_cards_counter_trg
  after insert or delete on public.opennumber_cards
  for each row execute function public.opennumber_cards_counter();

-- Recalcul des compteurs (sûr à relancer)
insert into public.opennumber_series_taken (type_id, series, taken)
select type_id, series, count(*) from public.opennumber_cards group by type_id, series
on conflict (type_id, series) do update set taken = excluded.taken;
update public.opennumber_series_taken t set taken = 0
where not exists (select 1 from public.opennumber_cards c where c.type_id = t.type_id and c.series = t.series);

-- ---------- Marché ----------
create table if not exists public.opennumber_listings (
  id             bigint generated always as identity primary key,
  type_id        int  not null,
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
create unique index if not exists opennumber_listings_one_active on public.opennumber_listings (type_id, series, number) where status = 'active';
create index if not exists opennumber_listings_due_idx on public.opennumber_listings (ends_at) where status = 'active' and kind = 'auction';
create index if not exists opennumber_listings_seller_idx on public.opennumber_listings (seller_id);
create index if not exists opennumber_listings_bidder_idx on public.opennumber_listings (current_bidder) where status = 'active';

create table if not exists public.opennumber_bids (
  id         bigint generated always as identity primary key,
  listing_id bigint not null references public.opennumber_listings (id) on delete cascade,
  bidder_id  uuid   not null references auth.users (id) on delete cascade,
  amount     int    not null,
  created_at timestamptz not null default now()
);
create index if not exists opennumber_bids_bidder_idx on public.opennumber_bids (bidder_id, listing_id);

-- Informations légales du vendeur et textes de consentement (affichés dans les conditions de vente).
-- À compléter avant de vendre pour de vrai : voir README.
create table if not exists public.opennumber_legal (
  key   text primary key,
  value text not null default ''
);
insert into public.opennumber_legal (key, value) values
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
create table if not exists public.opennumber_consents (
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
create index if not exists opennumber_consents_user_idx on public.opennumber_consents (user_id, created_at desc);
create index if not exists opennumber_consents_session_idx on public.opennumber_consents (stripe_session_id);

-- Achats Stripe (un enregistrement par session de paiement : empêche de créditer deux fois)
create table if not exists public.opennumber_purchases (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  boosters              int  not null,
  amount_cents          int,
  currency              text,
  created_at            timestamptz not null default now()
);
create index if not exists opennumber_purchases_user_idx on public.opennumber_purchases (user_id, created_at desc);

-- ---------- Console admin : secrets et journal des tentatives ----------
-- Le mot de passe admin n'est jamais écrit en clair : seul son hachage (bcrypt) est stocké ici.
create table if not exists public.opennumber_secrets (
  key   text primary key,
  value text not null
);
create table if not exists public.opennumber_admin_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists opennumber_admin_log_idx on public.opennumber_admin_log (created_at);

-- ---------- Sécurité : tout passe par les fonctions ci-dessous ----------
alter table public.opennumber_config       enable row level security;
alter table public.opennumber_rarities     enable row level security;
alter table public.opennumber_profiles     enable row level security;
alter table public.opennumber_categories   enable row level security;
alter table public.opennumber_types        enable row level security;
alter table public.opennumber_cards        enable row level security;
alter table public.opennumber_series_taken enable row level security;
alter table public.opennumber_listings     enable row level security;
alter table public.opennumber_bids         enable row level security;
alter table public.opennumber_golden_contents enable row level security;
alter table public.opennumber_purchases    enable row level security;
alter table public.opennumber_legal        enable row level security;
alter table public.opennumber_consents     enable row level security;
alter table public.opennumber_secrets      enable row level security;
alter table public.opennumber_admin_log    enable row level security;

drop policy if exists opennumber_legal_read on public.opennumber_legal;
create policy opennumber_legal_read on public.opennumber_legal
  for select to anon, authenticated using (true);

drop policy if exists opennumber_consents_read_own on public.opennumber_consents;
create policy opennumber_consents_read_own on public.opennumber_consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists opennumber_purchases_read_own on public.opennumber_purchases;
create policy opennumber_purchases_read_own on public.opennumber_purchases
  for select to authenticated using (user_id = auth.uid());

drop policy if exists opennumber_config_read on public.opennumber_config;
create policy opennumber_config_read on public.opennumber_config
  for select to anon, authenticated using (true);

drop policy if exists opennumber_rarities_read on public.opennumber_rarities;
create policy opennumber_rarities_read on public.opennumber_rarities
  for select to anon, authenticated using (true);

drop policy if exists opennumber_categories_read on public.opennumber_categories;
create policy opennumber_categories_read on public.opennumber_categories
  for select to anon, authenticated using (true);

drop policy if exists opennumber_types_read on public.opennumber_types;
create policy opennumber_types_read on public.opennumber_types
  for select to anon, authenticated using (true);

drop policy if exists opennumber_profiles_read_own on public.opennumber_profiles;
create policy opennumber_profiles_read_own on public.opennumber_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists opennumber_cards_read_own on public.opennumber_cards;
create policy opennumber_cards_read_own on public.opennumber_cards
  for select to authenticated using (owner_id = auth.uid());

revoke insert, update, delete on public.opennumber_config, public.opennumber_rarities, public.opennumber_profiles,
  public.opennumber_categories, public.opennumber_types, public.opennumber_cards from anon, authenticated;
revoke all on public.opennumber_series_taken, public.opennumber_listings, public.opennumber_bids, public.opennumber_golden_contents,
  public.opennumber_secrets, public.opennumber_admin_log from anon, authenticated;
revoke insert, update, delete on public.opennumber_purchases, public.opennumber_legal, public.opennumber_consents from anon, authenticated;

-- ---------- Fonctions utilitaires ----------
create or replace function public.opennumber_cfg(p_key text)
returns numeric language sql stable set search_path = public as $$
  select value from public.opennumber_config where key = p_key
$$;

create or replace function public.opennumber_range_rarity(m int)
returns text language sql stable set search_path = public as $$
  select id from public.opennumber_rarities
  where kind = 'range' and (max_series is null or m <= max_series)
  order by max_series nulls last
  limit 1
$$;

-- Rareté de la carte n/m. Priorité : Unique (1/1) > Alpha (1/m) > Omega (m/m) > rareté par taille de série
create or replace function public.opennumber_rarity_id(n int, m int)
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  if m = 1 then
    select id into v from public.opennumber_rarities where kind = 'unique' limit 1;
  elsif n = 1 then
    select id into v from public.opennumber_rarities where kind = 'alpha' limit 1;
  elsif n = m then
    select id into v from public.opennumber_rarities where kind = 'omega' limit 1;
  end if;
  return coalesce(v, public.opennumber_range_rarity(m));
end $$;

-- Catégorie actuellement ouvrable : la première activée et non terminée
create or replace function public.opennumber_active_category()
returns int language sql stable set search_path = public as $$
  select id from public.opennumber_categories where enabled and not closed order by position, id limit 1
$$;

-- Nombre total de cartes d'une catégorie (tous types) et nombre déjà tirées
create or replace function public.opennumber_category_total(p_category int)
returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(c.series_count::bigint * (c.series_count + 1) / 2), 0)
  from public.opennumber_categories c
  join public.opennumber_types t on t.category_id = c.id
  where c.id = p_category
$$;

create or replace function public.opennumber_category_taken(p_category int)
returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(s.taken), 0)::bigint
  from public.opennumber_series_taken s
  join public.opennumber_types t on t.id = s.type_id
  where t.category_id = p_category
$$;

-- Tire au hasard une carte encore disponible d'une rareté donnée dans une catégorie (booster doré).
-- Même pondération que les boosters normaux : poids d'une carte = taille de série ^ exposant.
create or replace function public.opennumber_draw_rarity(
  p_rarity text, p_category int, out o_type int, out o_series int, out o_number int
)
language plpgsql security definer set search_path = public as $$
declare
  rar      public.opennumber_rarities;
  n_series int;
  e        double precision := public.opennumber_cfg('rarity_exponent')::double precision;
  lo       int := 1;
  hi       int;
  ts       int[];
  ms       int[];
  av       int[];
  ws       double precision[];
  total    double precision := 0;
  x        double precision;
  acc      double precision := 0;
  i        int;
  pick     int := 1;
  k        int;
begin
  select * into rar from public.opennumber_rarities where id = p_rarity;
  if not found then return; end if;
  select series_count into n_series from public.opennumber_categories where id = p_category;
  if n_series is null then return; end if;

  if rar.kind = 'range' then
    select coalesce(max(max_series), 0) + 1 into lo
    from public.opennumber_rarities
    where kind = 'range' and max_series is not null and max_series < coalesce(rar.max_series, 2147483647);
    hi := least(coalesce(rar.max_series, n_series), n_series);
  end if;

  -- Cartes encore disponibles de cette rareté : (type, série) avec le nombre de cartes restantes
  select array_agg(q.type_id order by q.type_id, q.m), array_agg(q.m order by q.type_id, q.m),
         array_agg(q.avail order by q.type_id, q.m),
         array_agg(q.avail * power(q.m::double precision, e) order by q.type_id, q.m)
  into ts, ms, av, ws
  from (
    select ty.id as type_id, g as m,
      case
        when rar.kind = 'unique' then
          case when g = 1 and not exists (select 1 from public.opennumber_cards c where c.type_id = ty.id and c.series = 1 and c.number = 1) then 1 else 0 end
        when rar.kind = 'alpha' then
          case when g > 1 and not exists (select 1 from public.opennumber_cards c where c.type_id = ty.id and c.series = g and c.number = 1) then 1 else 0 end
        when rar.kind = 'omega' then
          case when g > 1 and not exists (select 1 from public.opennumber_cards c where c.type_id = ty.id and c.series = g and c.number = g) then 1 else 0 end
        else
          case when g >= greatest(lo, 2) and g <= hi
               then greatest(g - 2 - (select count(*)::int from public.opennumber_cards c where c.type_id = ty.id and c.series = g and c.number between 2 and g - 1), 0)
               else 0 end
      end as avail
    from public.opennumber_types ty
    cross join generate_series(1, n_series) g
    where ty.category_id = p_category
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
  o_series := ms[pick];

  if rar.kind in ('unique', 'alpha') then
    o_number := 1;
  elsif rar.kind = 'omega' then
    o_number := o_series;
  else
    k := floor(random() * av[pick])::int;
    select y into o_number
    from generate_series(2, o_series - 1) y
    where not exists (select 1 from public.opennumber_cards c where c.type_id = o_type and c.series = o_series and c.number = y)
    order by y
    offset k limit 1;
  end if;
end $$;

create or replace function public.opennumber_ensure_profile(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.opennumber_profiles (id, username, boosters, coins)
  select a.id,
         left(coalesce(nullif(trim(a.raw_user_meta_data ->> 'username'), ''),
                       nullif(split_part(a.email, '@', 1), ''), 'joueur'), 24),
         public.opennumber_cfg('start_boosters')::int,
         coalesce(public.opennumber_cfg('start_coins'), 0)::bigint
  from auth.users a
  where a.id = p_uid
  on conflict (id) do nothing;
end $$;

-- ---------- Recharge des boosters (calculée à la demande) ----------
create or replace function public.opennumber_sync(p_uid uuid)
returns public.opennumber_profiles
language plpgsql security definer set search_path = public as $$
declare
  p       public.opennumber_profiles;
  v_max   int := public.opennumber_cfg('max_boosters')::int;
  v_min   int := greatest(public.opennumber_cfg('regen_minutes')::int, 1);
  v_amt   int := public.opennumber_cfg('regen_amount')::int;
  v_ticks int;
  v_new   int;
begin
  perform public.opennumber_ensure_profile(p_uid);
  select * into p from public.opennumber_profiles where id = p_uid for update;
  if not found then raise exception 'profile_not_found'; end if;

  if p.boosters >= v_max then
    update public.opennumber_profiles set boosters_updated_at = now()
    where id = p_uid returning * into p;
  else
    v_ticks := floor(extract(epoch from (now() - p.boosters_updated_at)) / (v_min * 60))::int;
    if v_ticks > 0 then
      v_new := least(v_max, p.boosters + v_ticks * v_amt);
      update public.opennumber_profiles
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
create or replace function public.opennumber_settle_due()
returns void language plpgsql security definer set search_path = public as $$
declare r public.opennumber_listings;
begin
  for r in
    select * from public.opennumber_listings
    where status = 'active' and kind = 'auction' and ends_at <= now()
    order by id
    for update skip locked
  loop
    if r.current_bidder is null then
      update public.opennumber_listings set status = 'expired', closed_at = now() where id = r.id;
    else
      update public.opennumber_profiles set coins = coins + r.current_bid where id = r.seller_id;
      update public.opennumber_cards set owner_id = r.current_bidder, obtained_at = now()
      where type_id = r.type_id and series = r.series and number = r.number;
      update public.opennumber_listings
      set status = 'sold', buyer_id = r.current_bidder, final_price = r.current_bid, closed_at = now()
      where id = r.id;
    end if;
  end loop;
end $$;

create or replace function public.opennumber_status_json(p public.opennumber_profiles)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_max    int := public.opennumber_cfg('max_boosters')::int;
  v_min    int := greatest(public.opennumber_cfg('regen_minutes')::int, 1);
  v_cat    int := public.opennumber_active_category();
  v_taken  bigint := 0;
  v_total  bigint := 0;
  v_locked bigint;
  v_next   jsonb;
  v_closed jsonb;
begin
  if v_cat is not null then
    v_taken := public.opennumber_category_taken(v_cat);
    v_total := public.opennumber_category_total(v_cat);
  end if;
  select coalesce(sum(current_bid), 0) into v_locked
  from public.opennumber_listings where current_bidder = p.id and status = 'active';
  select jsonb_build_object('id', c.id, 'name', c.name) into v_next
  from public.opennumber_categories c
  where c.enabled and not c.closed and c.id is distinct from v_cat
  order by c.position, c.id limit 1;
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into v_closed
  from public.opennumber_categories where closed;
  return jsonb_build_object(
    'username',            p.username,
    'boosters',            p.boosters,
    'bonus_boosters',      p.bonus_boosters,
    'shop_enabled',        coalesce(public.opennumber_cfg('shop_enabled'), 0) = 1,
    'pack_boosters',       public.opennumber_cfg('stripe_pack_boosters')::int,
    'pack_price_cents',    public.opennumber_cfg('stripe_pack_price_cents')::int,
    'cgv_version',         coalesce(public.opennumber_cfg('cgv_version'), 1)::int,
    'max_boosters',        v_max,
    'regen_minutes',       v_min,
    'regen_amount',        public.opennumber_cfg('regen_amount')::int,
    'boosters_opened',     p.boosters_opened,
    'next_refill_at',      case when p.boosters >= v_max then null
                                else p.boosters_updated_at + v_min * interval '1 minute' end,
    'coins',               p.coins,
    'coins_locked',        v_locked,
    'active_category_id',  v_cat,
    'next_category',       v_next,
    'closed_categories',   v_closed,
    'cards_taken',         v_taken,
    'total_cards',         v_total,
    'direct_sell_price',   public.opennumber_cfg('direct_sell_price')::int,
    'auction_minutes',     public.opennumber_cfg('auction_minutes')::int,
    'auction_start_price', public.opennumber_cfg('auction_start_price')::int,
    'server_now',          now()
  );
end $$;

-- ---------- Fonctions appelées par l'application ----------
create or replace function public.opennumber_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.opennumber_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  p := public.opennumber_sync(auth.uid());
  return public.opennumber_status_json(p);
end $$;

-- Ouvre un booster de la catégorie en cours. Chaque carte tirée n'existait pas encore : elle devient
-- la seule de son espèce, et elle est à toi. Quand la catégorie est épuisée, la suivante prend le relais.
create or replace function public.opennumber_open_booster()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  p         public.opennumber_profiles;
  v_max     int;
  was_full  boolean;
  use_bonus boolean;
  v_cat     int;
  n_series  int;
  n_cards   int;
  e         double precision;
  w         double precision;
  r         double precision;
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
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  p := public.opennumber_sync(uid);
  if p.boosters <= 0 and p.bonus_boosters <= 0 then raise exception 'no_boosters'; end if;
  use_bonus := p.boosters <= 0;   -- le stock gratuit est utilisé en premier : la recharge repart plus vite

  v_max    := public.opennumber_cfg('max_boosters')::int;
  was_full := p.boosters >= v_max;
  n_cards  := public.opennumber_cfg('cards_per_booster')::int;
  e        := public.opennumber_cfg('rarity_exponent')::double precision;

  <<category_loop>>
  loop
    v_cat := public.opennumber_active_category();
    if v_cat is null then raise exception 'pool_empty'; end if;
    select series_count into n_series from public.opennumber_categories where id = v_cat;
    got := 0; tries := 0; exhausted := false; res := '[]'::jsonb; v_golden := false;

    -- Booster doré : chance très faible, contenu défini dans opennumber_golden_contents
    if random() < coalesce(public.opennumber_cfg('golden_booster_chance'), 0)::double precision then
      v_golden := true;
      for gc in select rarity_id, quantity from public.opennumber_golden_contents order by rarity_id loop
        for q in 1 .. gc.quantity loop
          t2 := 0;
          while t2 < 10 loop
            t2 := t2 + 1;
            select d2.o_type, d2.o_series, d2.o_number into tid, m, num
            from public.opennumber_draw_rarity(gc.rarity_id, v_cat) d2;
            exit when tid is null;
            insert into public.opennumber_cards (type_id, series, number, owner_id) values (tid, m, num, uid)
            on conflict (type_id, series, number) do nothing;
            get diagnostics rows = row_count;
            if rows = 1 then
              got := got + 1;
              res := res || jsonb_build_array(jsonb_build_object(
                'type_id', tid, 'series', m, 'number', num, 'rarity_id', public.opennumber_rarity_id(num, m)
              ));
              exit;
            end if;
          end loop;
        end loop;
      end loop;
      if got = 0 then v_golden := false; end if;   -- contenu doré indisponible : booster normal
    end if;

    while not v_golden and got < n_cards and tries < n_cards * 25 loop
      tries := tries + 1;

      -- Poids d'une série = cartes encore disponibles x poids d'une carte (taille ^ exposant)
      select sum((g - coalesce(t.taken, 0)) * power(g::double precision, e)) into w
      from public.opennumber_types ty
      cross join generate_series(1, n_series) g
      left join public.opennumber_series_taken t on t.type_id = ty.id and t.series = g
      where ty.category_id = v_cat;
      if w is null or w <= 0 then exhausted := true; exit; end if;

      r := random() * w;
      select z.type_id, z.g into tid, m
      from (
        select ty.id as type_id, g,
               sum((g - coalesce(t.taken, 0)) * power(g::double precision, e)) over (order by ty.id, g) as cs
        from public.opennumber_types ty
        cross join generate_series(1, n_series) g
        left join public.opennumber_series_taken t on t.type_id = ty.id and t.series = g
        where ty.category_id = v_cat
      ) z
      where z.cs > r
      order by z.cs, z.type_id, z.g
      limit 1;
      continue when tid is null;

      select m - coalesce((select taken from public.opennumber_series_taken where type_id = tid and series = m), 0) into avail;
      continue when avail <= 0;

      -- Une des cartes encore disponibles de ce type et de cette série, au hasard
      k := floor(random() * avail)::int;
      select x into num
      from generate_series(1, m) x
      where not exists (select 1 from public.opennumber_cards c where c.type_id = tid and c.series = m and c.number = x)
      order by x
      offset k limit 1;
      continue when num is null;

      insert into public.opennumber_cards (type_id, series, number, owner_id) values (tid, m, num, uid)
      on conflict (type_id, series, number) do nothing;
      get diagnostics rows = row_count;
      continue when rows = 0;               -- quelqu'un d'autre vient de la tirer : on retente

      got := got + 1;
      res := res || jsonb_build_array(jsonb_build_object(
        'type_id', tid, 'series', m, 'number', num, 'rarity_id', public.opennumber_rarity_id(num, m)
      ));
    end loop;

    exit category_loop when got > 0;
    if exhausted then
      update public.opennumber_categories set closed = true where id = v_cat;   -- catégorie terminée : on passe à la suivante
      continue category_loop;
    end if;
    raise exception 'try_again';
  end loop category_loop;

  -- Catégorie complètement tirée : elle se ferme, la suivante s'ouvre pour le prochain booster
  if public.opennumber_category_taken(v_cat) >= public.opennumber_category_total(v_cat) then
    update public.opennumber_categories set closed = true where id = v_cat;
  end if;

  update public.opennumber_profiles
  set boosters            = boosters - case when use_bonus then 0 else 1 end,
      bonus_boosters      = bonus_boosters - case when use_bonus then 1 else 0 end,
      boosters_opened     = boosters_opened + 1,
      boosters_updated_at = case when was_full and not use_bonus then now() else boosters_updated_at end
  where id = uid returning * into p;

  return jsonb_build_object('cards', res, 'golden', v_golden, 'category_id', v_cat, 'status', public.opennumber_status_json(p));
end $$;

-- Mes cartes (filtres catégorie / type / rareté, tri, pagination)
create or replace function public.opennumber_list_collection(
  p_category int  default null,
  p_type     int  default null,
  p_rarity   text default null,
  p_sort     text default 'series',
  p_limit    int  default 60,
  p_offset   int  default 0
)
returns table (
  card_type    int,
  card_series  int,
  card_number  int,
  rarity_id    text,
  obtained_at  timestamptz,
  listing_id   bigint,
  listing_kind text,
  total        bigint
)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  return query
  select x.type_id, x.series, x.number, x.rid, x.obtained_at, l.id, l.kind, count(*) over ()
  from (
    select c.type_id, c.series, c.number, c.obtained_at, ty.position as tpos,
           public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_cards c
    join public.opennumber_types ty on ty.id = c.type_id
    where c.owner_id = uid
      and (p_category is null or ty.category_id = p_category)
      and (p_type is null or c.type_id = p_type)
  ) x
  left join public.opennumber_rarities r on r.id = x.rid
  left join public.opennumber_listings l
         on l.type_id = x.type_id and l.series = x.series and l.number = x.number and l.status = 'active'
  where p_rarity is null or x.rid = p_rarity
  order by
    case when p_sort = 'rarity' then r.sort_order end asc nulls last,
    case when p_sort = 'recent' then x.obtained_at end desc,
    x.tpos, x.type_id, x.series asc, x.number asc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end $$;

-- État d'une série d'un type : mes cartes (avec l'annonce éventuelle) et celles prises par d'autres joueurs
create or replace function public.opennumber_type_state(p_type int, p_series int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_mine jsonb; v_taken jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  select coalesce(jsonb_object_agg(c.number::text, coalesce(l.id, 0)), '{}'::jsonb) into v_mine
  from public.opennumber_cards c
  left join public.opennumber_listings l
         on l.type_id = c.type_id and l.series = c.series and l.number = c.number and l.status = 'active'
  where c.type_id = p_type and c.series = p_series and c.owner_id = uid;
  select coalesce(jsonb_agg(c.number order by c.number), '[]'::jsonb) into v_taken
  from public.opennumber_cards c
  where c.type_id = p_type and c.series = p_series and c.owner_id <> uid;
  return jsonb_build_object('mine', v_mine, 'taken', v_taken);
end $$;

-- Statistiques de collection : par catégorie, par type et par rareté (pour la catégorie demandée)
create or replace function public.opennumber_my_stats(p_category int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  v_cat     int  := coalesce(p_category, public.opennumber_active_category(), (select min(id) from public.opennumber_categories));
  n_series  int;
  n_types   int;
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
  perform public.opennumber_settle_due();

  select series_count into n_series from public.opennumber_categories where id = v_cat;
  select count(*) into n_types from public.opennumber_types where category_id = v_cat;
  n_series := coalesce(n_series, 1);

  select id into v_unique from public.opennumber_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.opennumber_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.opennumber_rarities where kind = 'omega'  limit 1;

  -- Totaux par rareté pour UN type, multipliés par le nombre de types de la catégorie
  with s as (
    select g as m, public.opennumber_range_rarity(g) as rid from generate_series(1, n_series) g
  ),
  totals as (
    select rid as id, sum(m - case when m = 1 then 1 else 2 end)::bigint as n from s group by rid
    union all select v_unique, 1::bigint where v_unique is not null
    union all select v_alpha,  count(*)::bigint from s where m > 1 and v_alpha is not null
    union all select v_omega,  count(*)::bigint from s where m > 1 and v_omega is not null
  ),
  tot as (select id, sum(n)::bigint * n_types as n from totals group by id),
  own as (
    select public.opennumber_rarity_id(c.number, c.series) as id, count(*)::bigint as n
    from public.opennumber_cards c
    join public.opennumber_types ty on ty.id = c.type_id
    where c.owner_id = uid and ty.category_id = v_cat
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'owned', coalesce(own.n, 0), 'total', coalesce(tot.n, 0)
         ) order by r.sort_order)
  into by_rarity
  from public.opennumber_rarities r
  left join tot on tot.id = r.id
  left join own on own.id = r.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'total', public.opennumber_category_total(c.id),
           'taken', public.opennumber_category_taken(c.id),
           'owned', (select count(*) from public.opennumber_cards k join public.opennumber_types ty on ty.id = k.type_id
                     where k.owner_id = uid and ty.category_id = c.id)
         ) order by c.position, c.id), '[]'::jsonb)
  into v_cats
  from public.opennumber_categories c;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ty.id,
           'category_id', ty.category_id,
           'total', c.series_count::bigint * (c.series_count + 1) / 2,
           'owned', (select count(*) from public.opennumber_cards k where k.owner_id = uid and k.type_id = ty.id)
         ) order by ty.category_id, ty.position, ty.id), '[]'::jsonb)
  into v_types
  from public.opennumber_types ty
  join public.opennumber_categories c on c.id = ty.category_id;

  select count(*), count(distinct (type_id, series)) into v_owned, v_started
  from public.opennumber_cards where owner_id = uid;

  select jsonb_build_object('type_id', q.type_id, 'series', q.series, 'number', q.number, 'rarity_id', q.rid)
  into v_rarest
  from (
    select c.type_id, c.series, c.number, public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_cards c where c.owner_id = uid
  ) q
  left join public.opennumber_rarities r on r.id = q.rid
  order by r.sort_order asc nulls last, q.series asc, q.number asc, q.type_id
  limit 1;

  return jsonb_build_object(
    'category_id',    v_cat,
    'total_cards',    public.opennumber_category_total(v_cat),
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
create or replace function public.opennumber_draw_odds(p_category int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cat     int := coalesce(p_category, public.opennumber_active_category());
  n_series  int;
  e         double precision := public.opennumber_cfg('rarity_exponent')::double precision;
  n_cards   int := public.opennumber_cfg('cards_per_booster')::int;
  v_unique  text;
  v_alpha   text;
  v_omega   text;
  v_rows    jsonb;
  v_golden  jsonb;
begin
  select series_count into n_series from public.opennumber_categories where id = v_cat;
  if v_cat is null or n_series is null then
    return jsonb_build_object('category_id', null, 'by_rarity', '[]'::jsonb);
  end if;
  select id into v_unique from public.opennumber_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.opennumber_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.opennumber_rarities where kind = 'omega'  limit 1;

  with s as (
    select ty.id as type_id, g as m, (g - coalesce(t.taken, 0)) as avail,
           case when g > 1 and exists (select 1 from public.opennumber_cards c where c.type_id = ty.id and c.series = g and c.number = 1) then 1 else 0 end as a_taken,
           case when g > 1 and exists (select 1 from public.opennumber_cards c where c.type_id = ty.id and c.series = g and c.number = g) then 1 else 0 end as o_taken
    from public.opennumber_types ty
    cross join generate_series(1, n_series) g
    left join public.opennumber_series_taken t on t.type_id = ty.id and t.series = g
    where ty.category_id = v_cat
  ),
  parts as (
    select v_unique as id, greatest(avail, 0)::bigint as remaining, 1::bigint as total, greatest(avail, 0)::double precision as w
      from s where m = 1 and v_unique is not null
    union all
    select v_alpha, (1 - a_taken)::bigint, 1::bigint, (1 - a_taken) * power(m::double precision, e)
      from s where m > 1 and v_alpha is not null
    union all
    select v_omega, (1 - o_taken)::bigint, 1::bigint, (1 - o_taken) * power(m::double precision, e)
      from s where m > 1 and v_omega is not null
    union all
    select public.opennumber_range_rarity(m),
           greatest(avail - 2 + a_taken + o_taken, 0)::bigint, (m - 2)::bigint,
           greatest(avail - 2 + a_taken + o_taken, 0) * power(m::double precision, e)
      from s where m > 1
  ),
  agg as (
    select id, sum(remaining)::bigint as remaining, sum(total)::bigint as total, sum(w) as w from parts group by id
  ),
  tot as (select sum(w) as w, sum(remaining) as remaining from agg)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'remaining', coalesce(a.remaining, 0),
           'total', coalesce(a.total, 0),
           'share', case when tot.w > 0 then coalesce(a.w, 0) / tot.w else 0 end,
           'per_booster', case when tot.w > 0 then 1 - power(1 - coalesce(a.w, 0) / tot.w, n_cards) else 0 end
         ) order by r.sort_order), '[]'::jsonb)
  into v_rows
  from public.opennumber_rarities r
  left join agg a on a.id = r.id
  cross join tot;

  select jsonb_build_object(
           'chance', coalesce(public.opennumber_cfg('golden_booster_chance'), 0),
           'contents', coalesce((select jsonb_agg(jsonb_build_object('rarity_id', rarity_id, 'quantity', quantity) order by rarity_id)
                                 from public.opennumber_golden_contents), '[]'::jsonb))
  into v_golden;

  return jsonb_build_object(
    'category_id',       v_cat,
    'exponent',          e,
    'cards_per_booster', n_cards,
    'pool_left',         public.opennumber_category_total(v_cat) - public.opennumber_category_taken(v_cat),
    'by_rarity',         v_rows,
    'golden',            v_golden
  );
end $$;

create or replace function public.opennumber_set_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_username, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) < 2 or char_length(v) > 24 then raise exception 'invalid_username'; end if;
  perform public.opennumber_ensure_profile(auth.uid());
  update public.opennumber_profiles set username = v where id = auth.uid();
  return v;
end $$;

-- ---------- Marché ----------

-- Revente directe : la carte retourne dans les boosters, tu reçois des pièces.
-- Refusée pour une catégorie terminée : la progression est définitive.
create or replace function public.opennumber_sell_direct(p_type int, p_series int, p_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_price int  := public.opennumber_cfg('direct_sell_price')::int;
  p       public.opennumber_profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_ensure_profile(uid);
  select owner_id into v_owner from public.opennumber_cards
  where type_id = p_type and series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.opennumber_listings
             where type_id = p_type and series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';
  end if;
  if exists (select 1 from public.opennumber_types t join public.opennumber_categories c on c.id = t.category_id
             where t.id = p_type and c.closed) then
    raise exception 'category_closed';
  end if;
  delete from public.opennumber_cards where type_id = p_type and series = p_series and number = p_number;
  update public.opennumber_profiles set coins = coins + v_price where id = uid returning * into p;
  return jsonb_build_object('status', public.opennumber_status_json(p));
end $$;

-- Mise en vente : achat direct (prix libre) ou enchère (durée et prix de départ fixés dans la config)
create or replace function public.opennumber_list_card(p_type int, p_series int, p_number int, p_kind text, p_price int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_price int;
  v_end   timestamptz;
  v_id    bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_ensure_profile(uid);
  select owner_id into v_owner from public.opennumber_cards
  where type_id = p_type and series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.opennumber_listings
             where type_id = p_type and series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';
  end if;

  if p_kind = 'buy_now' then
    if p_price is null or p_price < 1 or p_price > 100000000 then raise exception 'invalid_price'; end if;
    v_price := p_price;
  elsif p_kind = 'auction' then
    v_price := public.opennumber_cfg('auction_start_price')::int;
    v_end   := now() + public.opennumber_cfg('auction_minutes')::int * interval '1 minute';
  else
    raise exception 'invalid_kind';
  end if;

  insert into public.opennumber_listings (type_id, series, number, seller_id, kind, price, ends_at)
  values (p_type, p_series, p_number, uid, p_kind, v_price, v_end)
  returning id into v_id;
  return jsonb_build_object('listing_id', v_id);
end $$;

create or replace function public.opennumber_buy_now(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l public.opennumber_listings; p public.opennumber_profiles; bal bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_ensure_profile(uid);
  select * into l from public.opennumber_listings where id = p_id for update;
  if not found or l.status <> 'active' then raise exception 'listing_unavailable'; end if;
  if l.kind <> 'buy_now' then raise exception 'invalid_kind'; end if;
  if l.seller_id = uid then raise exception 'own_listing'; end if;

  perform 1 from public.opennumber_profiles where id in (uid, l.seller_id) order by id for update;
  select coins into bal from public.opennumber_profiles where id = uid;
  if bal < l.price then raise exception 'insufficient_coins'; end if;

  update public.opennumber_profiles set coins = coins - l.price where id = uid returning * into p;
  update public.opennumber_profiles set coins = coins + l.price where id = l.seller_id;
  update public.opennumber_cards set owner_id = uid, obtained_at = now()
  where type_id = l.type_id and series = l.series and number = l.number and owner_id = l.seller_id;
  if not found then raise exception 'listing_unavailable'; end if;
  update public.opennumber_listings
  set status = 'sold', buyer_id = uid, final_price = l.price, closed_at = now() where id = l.id;
  return jsonb_build_object('status', public.opennumber_status_json(p));
end $$;

-- Annulation d'une annonce (impossible si une enchère a reçu des offres)
create or replace function public.opennumber_cancel_listing(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l public.opennumber_listings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  select * into l from public.opennumber_listings where id = p_id for update;
  if not found or l.status <> 'active' then raise exception 'listing_unavailable'; end if;
  if l.seller_id <> uid then raise exception 'not_owner'; end if;
  if l.kind = 'auction' and l.bid_count > 0 then raise exception 'has_bids'; end if;
  update public.opennumber_listings set status = 'cancelled', closed_at = now() where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

-- Enchère : la mise est bloquée tant que tu es en tête, et rendue si quelqu'un te dépasse.
-- Une mise dans la dernière minute remet le compteur à 1 minute.
create or replace function public.opennumber_place_bid(p_id bigint, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid      uuid := auth.uid();
  l        public.opennumber_listings;
  p        public.opennumber_profiles;
  inc      int := public.opennumber_cfg('auction_min_increment')::int;
  ext      int := public.opennumber_cfg('auction_extend_seconds')::int;
  min_next int;
  bal      bigint;
  need     bigint;
  new_end  timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_ensure_profile(uid);
  select * into l from public.opennumber_listings where id = p_id for update;
  if not found or l.status <> 'active' then return jsonb_build_object('error', 'auction_ended'); end if;
  if l.kind <> 'auction' then raise exception 'invalid_kind'; end if;
  if l.ends_at <= now() then
    perform public.opennumber_settle_due();
    return jsonb_build_object('error', 'auction_ended');
  end if;
  if l.seller_id = uid then raise exception 'own_listing'; end if;

  min_next := case when l.current_bid is null then l.price else l.current_bid + inc end;
  if p_amount is null or p_amount < min_next then
    raise exception 'bid_too_low:%', min_next;
  end if;

  perform 1 from public.opennumber_profiles
  where id in (uid, coalesce(l.current_bidder, uid)) order by id for update;
  select coins into bal from public.opennumber_profiles where id = uid;
  need := p_amount - case when l.current_bidder = uid then l.current_bid else 0 end;
  if bal < need then raise exception 'insufficient_coins'; end if;

  if l.current_bidder is not null and l.current_bidder <> uid then
    update public.opennumber_profiles set coins = coins + l.current_bid where id = l.current_bidder;
  end if;
  update public.opennumber_profiles set coins = coins - need where id = uid returning * into p;

  new_end := case when l.ends_at - now() <= ext * interval '1 second'
                  then now() + ext * interval '1 second' else l.ends_at end;
  update public.opennumber_listings
  set current_bid = p_amount, current_bidder = uid, bid_count = bid_count + 1, ends_at = new_end
  where id = l.id;
  insert into public.opennumber_bids (listing_id, bidder_id, amount) values (l.id, uid, p_amount);

  return jsonb_build_object('status', public.opennumber_status_json(p), 'ends_at', new_end);
end $$;

-- Annonces en cours
create or replace function public.opennumber_market_list(
  p_kind   text default null,
  p_sort   text default 'ending',
  p_limit  int  default 40,
  p_offset int  default 0
)
returns table (
  listing_id  bigint,
  card_type   int,
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
declare uid uuid := auth.uid(); inc int := public.opennumber_cfg('auction_min_increment')::int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  return query
  select l.id, l.type_id, l.series, l.number, public.opennumber_rarity_id(l.number, l.series), p.username, l.kind,
         case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end,
         l.current_bid, l.bid_count, l.ends_at,
         case when l.kind = 'auction'
              then (case when l.current_bid is null then l.price else l.current_bid + inc end) end,
         l.seller_id = uid, l.current_bidder = uid, count(*) over (), now()
  from public.opennumber_listings l
  join public.opennumber_profiles p on p.id = l.seller_id
  left join public.opennumber_rarities r on r.id = public.opennumber_rarity_id(l.number, l.series)
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
create or replace function public.opennumber_market_mine()
returns table (
  listing_id  bigint,
  card_type   int,
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
declare uid uuid := auth.uid(); inc int := public.opennumber_cfg('auction_min_increment')::int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  return query
  select l.id, l.type_id, l.series, l.number, public.opennumber_rarity_id(l.number, l.series), l.kind,
         case when l.kind = 'auction' then coalesce(l.current_bid, l.price) else l.price end,
         l.current_bid, l.bid_count, l.ends_at, l.status, l.final_price, l.closed_at,
         case when l.seller_id = uid then 'seller' when l.buyer_id = uid then 'buyer' else 'bidder' end,
         (select max(b.amount)::int from public.opennumber_bids b where b.listing_id = l.id and b.bidder_id = uid),
         (l.status = 'active' and l.current_bidder = uid),
         case when l.kind = 'auction'
              then (case when l.current_bid is null then l.price else l.current_bid + inc end) end,
         p.username, now()
  from public.opennumber_listings l
  join public.opennumber_profiles p on p.id = l.seller_id
  where (l.seller_id = uid or l.buyer_id = uid
         or exists (select 1 from public.opennumber_bids b where b.listing_id = l.id and b.bidder_id = uid))
    and (l.status = 'active' or l.closed_at > now() - interval '7 days')
  order by case when l.status = 'active' then 0 else 1 end,
           l.ends_at asc nulls last, l.closed_at desc nulls last, l.id desc
  limit 100;
end $$;

-- Crédite un achat Stripe. Appelée uniquement par la fonction serveur "opennumber-stripe-webhook" (rôle service_role).
-- Idempotente : une même session de paiement ne crédite qu'une fois. Renvoie true si les boosters ont été ajoutés.
create or replace function public.opennumber_credit_purchase(
  p_session_id text, p_user uuid, p_boosters int, p_amount int, p_currency text, p_payment_intent text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if p_boosters is null or p_boosters < 1 or p_boosters > 1000 then raise exception 'invalid_boosters'; end if;
  perform public.opennumber_ensure_profile(p_user);
  insert into public.opennumber_purchases (user_id, stripe_session_id, stripe_payment_intent, boosters, amount_cents, currency)
  values (p_user, p_session_id, p_payment_intent, p_boosters, p_amount, p_currency)
  on conflict (stripe_session_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  update public.opennumber_profiles set bonus_boosters = bonus_boosters + p_boosters where id = p_user;
  return true;
end $$;

-- ---------- Console admin ----------
-- Chaque fonction admin vérifie le mot de passe (haché en base), limite les essais (5 erreurs par compte et 30 au total
-- en 15 minutes) et n'est utilisable que par le compte admin : le premier compte qui saisit le bon mot de passe y est lié.
-- Pour réinitialiser ce lien : delete from opennumber_secrets where key = 'admin_user_id';
create or replace function public.opennumber_admin_guard(p_password text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h text; bound text;
begin
  if uid is null then return 'not_authenticated'; end if;
  delete from public.opennumber_admin_log where created_at < now() - interval '1 day';
  if (select count(*) from public.opennumber_admin_log where not ok and user_id = uid and created_at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.opennumber_admin_log where not ok and created_at > now() - interval '15 minutes') >= 30 then
    return 'admin_locked';
  end if;
  select value into h from public.opennumber_secrets where key = 'admin_password_hash';
  if h is null then return 'admin_not_set'; end if;
  if p_password is null or extensions.crypt(p_password, h) <> h then
    insert into public.opennumber_admin_log (user_id, ok) values (uid, false);
    return 'admin_denied';
  end if;
  select value into bound from public.opennumber_secrets where key = 'admin_user_id';
  if bound is null then
    insert into public.opennumber_secrets (key, value) values ('admin_user_id', uid::text) on conflict (key) do nothing;
    select value into bound from public.opennumber_secrets where key = 'admin_user_id';
  end if;
  if bound <> uid::text then
    insert into public.opennumber_admin_log (user_id, ok) values (uid, false);
    return 'admin_denied';
  end if;
  delete from public.opennumber_admin_log where user_id = uid and not ok;
  return null;
end $$;

-- Définit le mot de passe admin. À lancer UNE FOIS depuis le SQL Editor (non appelable depuis l'application) :
--   select opennumber_admin_set_password('ton mot de passe');
create or replace function public.opennumber_admin_set_password(p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_new, '')) < 8 then raise exception 'password_too_short'; end if;
  insert into public.opennumber_secrets (key, value)
  values ('admin_password_hash', extensions.crypt(p_new, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.opennumber_admin_change_password(p_password text, p_new text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(coalesce(p_new, '')) < 8 then raise exception 'password_too_short'; end if;
  update public.opennumber_secrets set value = extensions.crypt(p_new, extensions.gen_salt('bf')) where key = 'admin_password_hash';
  return jsonb_build_object('ok', true);
end $$;

-- Tout ce que la console affiche
create or replace function public.opennumber_admin_data(p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  return jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'position', c.position, 'series_count', c.series_count,
        'color', c.color, 'color2', c.color2, 'text_color', c.text_color, 'enabled', c.enabled, 'closed', c.closed,
        'taken', public.opennumber_category_taken(c.id), 'total', public.opennumber_category_total(c.id)
      ) order by c.position, c.id), '[]'::jsonb) from public.opennumber_categories c),
    'types', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'category_id', t.category_id, 'name', t.name, 'image', t.image, 'position', t.position,
        'taken', coalesce((select sum(s.taken) from public.opennumber_series_taken s where s.type_id = t.id), 0)
      ) order by t.category_id, t.position, t.id), '[]'::jsonb) from public.opennumber_types t),
    'config', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'description', description) order by key), '[]'::jsonb)
               from public.opennumber_config),
    'rarities', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb) from public.opennumber_rarities r),
    'legal', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value) order by key), '[]'::jsonb)
              from public.opennumber_legal),
    'players', (select count(*) from public.opennumber_profiles)
  );
end $$;

create or replace function public.opennumber_admin_save_category(
  p_password text, p_id int, p_name text, p_position int, p_series_count int,
  p_color text, p_color2 text, p_text_color text, p_enabled boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password); v_id int;
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 40 then raise exception 'invalid_name'; end if;
  if p_series_count is null or p_series_count < 1 or p_series_count > 5000 then raise exception 'invalid_series'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' or p_color2 !~ '^#[0-9a-fA-F]{6}$' or p_text_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  if p_id is null then
    insert into public.opennumber_categories (name, position, series_count, color, color2, text_color, enabled)
    values (trim(p_name), coalesce(p_position, 1), p_series_count, p_color, p_color2, p_text_color, coalesce(p_enabled, true))
    returning id into v_id;
  else
    if exists (select 1 from public.opennumber_categories where id = p_id and series_count <> p_series_count)
       and public.opennumber_category_taken(p_id) > 0 then
      raise exception 'series_locked';   -- on ne change pas le nombre de séries une fois des cartes tirées
    end if;
    update public.opennumber_categories
    set name = trim(p_name), position = coalesce(p_position, position), series_count = p_series_count,
        color = p_color, color2 = p_color2, text_color = p_text_color, enabled = coalesce(p_enabled, enabled)
    where id = p_id;
    if not found then raise exception 'not_found'; end if;
    v_id := p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Terminer (ou rouvrir) une catégorie à la main : la suivante prend le relais
create or replace function public.opennumber_admin_set_category_closed(p_password text, p_id int, p_closed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  update public.opennumber_categories set closed = coalesce(p_closed, false) where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.opennumber_admin_delete_category(p_password text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if exists (select 1 from public.opennumber_cards c join public.opennumber_types t on t.id = c.type_id where t.category_id = p_id) then
    raise exception 'category_started';
  end if;
  delete from public.opennumber_categories where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Type de carte : image = emoji, adresse https:// ou image intégrée (data:image/...)
create or replace function public.opennumber_admin_save_type(
  p_password text, p_id int, p_category int, p_name text, p_image text, p_position int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password); v_id int; v_image text := coalesce(p_image, '');
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 60 then raise exception 'invalid_name'; end if;
  if char_length(v_image) > 300000 then raise exception 'image_too_large'; end if;
  if v_image <> '' and char_length(v_image) > 16
     and v_image !~ '^https://' and v_image !~ '^data:image/(png|jpeg|webp|gif|svg\+xml);base64,' then
    raise exception 'invalid_image';
  end if;
  if p_id is null then
    if not exists (select 1 from public.opennumber_categories where id = p_category) then raise exception 'not_found'; end if;
    insert into public.opennumber_types (category_id, name, image, position)
    values (p_category, trim(p_name), v_image, coalesce(p_position, 1)) returning id into v_id;
  else
    update public.opennumber_types
    set name = trim(p_name), image = v_image, position = coalesce(p_position, position)
    where id = p_id;
    if not found then raise exception 'not_found'; end if;
    v_id := p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.opennumber_admin_delete_type(p_password text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if exists (select 1 from public.opennumber_cards where type_id = p_id) then raise exception 'type_started'; end if;
  delete from public.opennumber_types where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.opennumber_admin_set_config(p_password text, p_key text, p_value numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if p_value is null then raise exception 'invalid_value'; end if;
  update public.opennumber_config set value = p_value where key = p_key;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.opennumber_admin_save_rarity(
  p_password text, p_id text, p_name text, p_max_series int, p_color text, p_color2 text, p_text_color text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(p_name) > 30 then raise exception 'invalid_name'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' or p_color2 !~ '^#[0-9a-fA-F]{6}$' or p_text_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  update public.opennumber_rarities
  set name = trim(p_name), color = p_color, color2 = p_color2, text_color = p_text_color,
      max_series = case when kind = 'range' then p_max_series else max_series end
  where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.opennumber_admin_set_legal(p_password text, p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text := public.opennumber_admin_guard(p_password);
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  if char_length(coalesce(p_value, '')) > 2000 then raise exception 'invalid_value'; end if;
  update public.opennumber_legal set value = coalesce(p_value, '') where key = p_key;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Droits d'exécution ----------
-- Fonctions internes : jamais appelables depuis l'application
revoke all on function public.opennumber_ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.opennumber_sync(uuid) from public, anon, authenticated;
revoke all on function public.opennumber_settle_due() from public, anon, authenticated;
revoke all on function public.opennumber_status_json(public.opennumber_profiles) from public, anon, authenticated;
revoke all on function public.opennumber_cards_counter() from public, anon, authenticated;
revoke all on function public.opennumber_draw_rarity(text, int) from public, anon, authenticated;
revoke all on function public.opennumber_admin_guard(text) from public, anon, authenticated;
-- Réservée au SQL Editor (mot de passe admin initial)
revoke all on function public.opennumber_admin_set_password(text) from public, anon, authenticated;
-- Réservée à la fonction serveur du webhook Stripe
revoke all on function public.opennumber_credit_purchase(text, uuid, int, int, text, text) from public, anon, authenticated;
grant execute on function public.opennumber_credit_purchase(text, uuid, int, int, text, text) to service_role;

-- Fonctions de l'application : joueurs connectés uniquement
revoke all on function public.opennumber_status()                                          from public, anon;
revoke all on function public.opennumber_open_booster()                                    from public, anon;
revoke all on function public.opennumber_list_collection(int, int, text, text, int, int)   from public, anon;
revoke all on function public.opennumber_type_state(int, int)                              from public, anon;
revoke all on function public.opennumber_my_stats(int)                                     from public, anon;
revoke all on function public.opennumber_draw_odds(int)                                    from public, anon;
revoke all on function public.opennumber_set_username(text)                                from public, anon;
revoke all on function public.opennumber_sell_direct(int, int, int)                        from public, anon;
revoke all on function public.opennumber_list_card(int, int, int, text, int)               from public, anon;
revoke all on function public.opennumber_cancel_listing(bigint)                            from public, anon;
revoke all on function public.opennumber_buy_now(bigint)                                   from public, anon;
revoke all on function public.opennumber_place_bid(bigint, int)                            from public, anon;
revoke all on function public.opennumber_market_list(text, text, int, int)                 from public, anon;
revoke all on function public.opennumber_market_mine()                                     from public, anon;
revoke all on function public.opennumber_admin_change_password(text, text)                 from public, anon;
revoke all on function public.opennumber_admin_data(text)                                  from public, anon;
revoke all on function public.opennumber_admin_save_category(text, int, text, int, int, text, text, text, boolean) from public, anon;
revoke all on function public.opennumber_admin_set_category_closed(text, int, boolean)     from public, anon;
revoke all on function public.opennumber_admin_delete_category(text, int)                  from public, anon;
revoke all on function public.opennumber_admin_save_type(text, int, int, text, text, int)  from public, anon;
revoke all on function public.opennumber_admin_delete_type(text, int)                      from public, anon;
revoke all on function public.opennumber_admin_set_config(text, text, numeric)             from public, anon;
revoke all on function public.opennumber_admin_save_rarity(text, text, text, int, text, text, text) from public, anon;
revoke all on function public.opennumber_admin_set_legal(text, text, text)                 from public, anon;

grant execute on function public.opennumber_status()                                          to authenticated;
grant execute on function public.opennumber_open_booster()                                    to authenticated;
grant execute on function public.opennumber_list_collection(int, int, text, text, int, int)   to authenticated;
grant execute on function public.opennumber_type_state(int, int)                              to authenticated;
grant execute on function public.opennumber_my_stats(int)                                     to authenticated;
grant execute on function public.opennumber_draw_odds(int)                                    to authenticated;
grant execute on function public.opennumber_set_username(text)                                to authenticated;
grant execute on function public.opennumber_sell_direct(int, int, int)                        to authenticated;
grant execute on function public.opennumber_list_card(int, int, int, text, int)               to authenticated;
grant execute on function public.opennumber_cancel_listing(bigint)                            to authenticated;
grant execute on function public.opennumber_buy_now(bigint)                                   to authenticated;
grant execute on function public.opennumber_place_bid(bigint, int)                            to authenticated;
grant execute on function public.opennumber_market_list(text, text, int, int)                 to authenticated;
grant execute on function public.opennumber_market_mine()                                     to authenticated;
grant execute on function public.opennumber_admin_change_password(text, text)                 to authenticated;
grant execute on function public.opennumber_admin_data(text)                                  to authenticated;
grant execute on function public.opennumber_admin_save_category(text, int, text, int, int, text, text, text, boolean) to authenticated;
grant execute on function public.opennumber_admin_set_category_closed(text, int, boolean)     to authenticated;
grant execute on function public.opennumber_admin_delete_category(text, int)                  to authenticated;
grant execute on function public.opennumber_admin_save_type(text, int, int, text, text, int)  to authenticated;
grant execute on function public.opennumber_admin_delete_type(text, int)                      to authenticated;
grant execute on function public.opennumber_admin_set_config(text, text, numeric)             to authenticated;
grant execute on function public.opennumber_admin_save_rarity(text, text, text, int, text, text, text) to authenticated;
grant execute on function public.opennumber_admin_set_legal(text, text, text)                 to authenticated;
