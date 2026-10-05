-- =====================================================================
-- OneOfOne Pack : schéma Supabase (toutes les tables commencent par opennumber_)
-- À coller en entier dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Migre automatiquement l'ancienne version (collection avec doublons) vers
-- le modèle "une carte = un seul propriétaire".
-- =====================================================================

-- Anciennes fonctions remplacées
drop function if exists public.opennumber_series_owned(int);
drop function if exists public.opennumber_list_collection(text, text, int, int);
drop function if exists public.opennumber_is_pow10(int);

-- ---------- Configuration du jeu (modifiable à tout moment) ----------
create table if not exists public.opennumber_config (
  key         text primary key,
  value       numeric not null,
  description text
);

insert into public.opennumber_config (key, value, description) values
  ('max_series',             1413, 'Taille maximale de série : cartes 1/1 jusqu''à N/N'),
  ('cards_per_booster',      5,    'Nombre de cartes par booster'),
  ('start_boosters',         10,   'Boosters offerts à la création du profil'),
  ('start_coins',            0,    'Pièces offertes à la création du profil'),
  ('regen_minutes',          10,   'Délai entre deux recharges (minutes)'),
  ('regen_amount',           10,   'Boosters gagnés à chaque recharge'),
  ('max_boosters',           10,   'Plafond de boosters en stock'),
  ('rarity_exponent',        1,    'Poids d''une carte = taille_de_série ^ exposant. 1 = rareté proportionnelle, 0 = chaque carte disponible a la même chance'),
  ('direct_sell_price',      1,    'Pièces reçues pour une revente directe (la carte retourne dans les boosters)'),
  ('auction_minutes',        60,   'Durée d''une enchère (minutes)'),
  ('auction_start_price',    1,    'Prix de départ d''une enchère (pièces)'),
  ('auction_min_increment',  1,    'Surenchère minimale (pièces)'),
  ('auction_extend_seconds', 60,   'Si une mise arrive dans les X dernières secondes, le compteur repart à X secondes'),
  ('golden_booster_chance',  0.00000001, 'Chance qu''un booster soit doré (0.00000001 = 0,000001 %). Contenu dans opennumber_golden_contents')
on conflict (key) do nothing;

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
  ('ultra',  'Ultra Rare', 'range',  10,   4, '#f43f5e', '#9f1239', '#ffffff'),
  ('super',  'Super Rare', 'range',  100,  5, '#3b82f6', '#1e3a8a', '#ffffff'),
  ('rare',   'Rare',       'range',  250,  6, '#10b981', '#065f46', '#ffffff'),
  ('common', 'Commune',    'range',  null, 7, '#f3efe6', '#cfc8b8', '#3a3630')
on conflict (id) do nothing;

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
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opennumber_profiles_coins_check') then
    alter table public.opennumber_profiles add constraint opennumber_profiles_coins_check check (coins >= 0);
  end if;
end $$;

-- ---------- Cartes : chaque carte n'existe qu'en UN exemplaire ----------
-- Une ligne = une carte déjà tirée et son propriétaire. Une carte absente de la table est encore dans les boosters.
create table if not exists public.opennumber_cards (
  series      int  not null check (series >= 1),
  number      int  not null check (number >= 1 and number <= series),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  obtained_at timestamptz not null default now(),
  primary key (series, number)
);
create index if not exists opennumber_cards_owner_idx on public.opennumber_cards (owner_id, series, number);

-- Compteur de cartes déjà tirées par série (pour un tirage rapide)
create table if not exists public.opennumber_series_taken (
  series int primary key,
  taken  int not null default 0
);

create or replace function public.opennumber_cards_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opennumber_series_taken (series, taken) values (new.series, 1)
    on conflict (series) do update set taken = opennumber_series_taken.taken + 1;
    return new;
  elsif tg_op = 'DELETE' then
    update public.opennumber_series_taken set taken = greatest(taken - 1, 0) where series = old.series;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists opennumber_cards_counter_trg on public.opennumber_cards;
create trigger opennumber_cards_counter_trg
  after insert or delete on public.opennumber_cards
  for each row execute function public.opennumber_cards_counter();

-- Migration depuis l'ancienne table de collection (doublons possibles) :
-- la carte reste au premier joueur qui l'a obtenue.
do $$
begin
  if to_regclass('public.opennumber_collection') is not null then
    insert into public.opennumber_cards (series, number, owner_id, obtained_at)
    select distinct on (series, number) series, number, user_id, first_obtained_at
    from public.opennumber_collection
    order by series, number, first_obtained_at asc
    on conflict (series, number) do nothing;
    drop table public.opennumber_collection;
  end if;
end $$;

-- Recalcul des compteurs (sûr à relancer)
insert into public.opennumber_series_taken (series, taken)
select series, count(*) from public.opennumber_cards group by series
on conflict (series) do update set taken = excluded.taken;
update public.opennumber_series_taken t set taken = 0
where not exists (select 1 from public.opennumber_cards c where c.series = t.series);

-- ---------- Marché ----------
create table if not exists public.opennumber_listings (
  id             bigint generated always as identity primary key,
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
create unique index if not exists opennumber_listings_one_active on public.opennumber_listings (series, number) where status = 'active';
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

-- ---------- Sécurité : tout passe par les fonctions ci-dessous ----------
alter table public.opennumber_config       enable row level security;
alter table public.opennumber_rarities     enable row level security;
alter table public.opennumber_profiles     enable row level security;
alter table public.opennumber_cards        enable row level security;
alter table public.opennumber_series_taken enable row level security;
alter table public.opennumber_listings     enable row level security;
alter table public.opennumber_bids         enable row level security;
alter table public.opennumber_golden_contents enable row level security;

drop policy if exists opennumber_config_read on public.opennumber_config;
create policy opennumber_config_read on public.opennumber_config
  for select to anon, authenticated using (true);

drop policy if exists opennumber_rarities_read on public.opennumber_rarities;
create policy opennumber_rarities_read on public.opennumber_rarities
  for select to anon, authenticated using (true);

drop policy if exists opennumber_profiles_read_own on public.opennumber_profiles;
create policy opennumber_profiles_read_own on public.opennumber_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists opennumber_cards_read_own on public.opennumber_cards;
create policy opennumber_cards_read_own on public.opennumber_cards
  for select to authenticated using (owner_id = auth.uid());

revoke insert, update, delete on public.opennumber_config, public.opennumber_rarities, public.opennumber_profiles, public.opennumber_cards from anon, authenticated;
revoke all on public.opennumber_series_taken, public.opennumber_listings, public.opennumber_bids, public.opennumber_golden_contents from anon, authenticated;

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

-- Tire au hasard une carte encore disponible d'une rareté donnée (utilisé par le booster doré).
-- Même pondération que les boosters normaux : poids d'une carte = taille de série ^ exposant.
create or replace function public.opennumber_draw_rarity(p_rarity text, out o_series int, out o_number int)
language plpgsql security definer set search_path = public as $$
declare
  rar      public.opennumber_rarities;
  n_series int := public.opennumber_cfg('max_series')::int;
  e        double precision := public.opennumber_cfg('rarity_exponent')::double precision;
  lo       int := 1;
  hi       int;
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

  if rar.kind = 'range' then
    select coalesce(max(max_series), 0) + 1 into lo
    from public.opennumber_rarities
    where kind = 'range' and max_series is not null and max_series < coalesce(rar.max_series, 2147483647);
    hi := least(coalesce(rar.max_series, n_series), n_series);
  end if;

  -- Séries qui contiennent encore au moins une carte disponible de cette rareté
  select array_agg(q.m order by q.m), array_agg(q.avail order by q.m), array_agg(q.avail * power(q.m::double precision, e) order by q.m)
  into ms, av, ws
  from (
    select g as m,
      case
        when rar.kind = 'unique' then
          case when g = 1 and not exists (select 1 from public.opennumber_cards c where c.series = 1 and c.number = 1) then 1 else 0 end
        when rar.kind = 'alpha' then
          case when g > 1 and not exists (select 1 from public.opennumber_cards c where c.series = g and c.number = 1) then 1 else 0 end
        when rar.kind = 'omega' then
          case when g > 1 and not exists (select 1 from public.opennumber_cards c where c.series = g and c.number = g) then 1 else 0 end
        else
          case when g >= greatest(lo, 2) and g <= hi
               then greatest(g - 2 - (select count(*)::int from public.opennumber_cards c where c.series = g and c.number between 2 and g - 1), 0)
               else 0 end
      end as avail
    from generate_series(1, n_series) g
  ) q
  where q.avail > 0;

  if ms is null then return; end if;
  for i in 1 .. array_length(ws, 1) loop total := total + ws[i]; end loop;
  if total <= 0 then return; end if;

  x := random() * total;
  for i in 1 .. array_length(ws, 1) loop
    pick := i;
    acc := acc + ws[i];
    exit when acc > x;
  end loop;
  o_series := ms[pick];

  if rar.kind in ('unique', 'alpha') then
    o_number := 1;
  elsif rar.kind = 'omega' then
    o_number := o_series;
  else
    k := floor(random() * av[pick])::int;
    select y into o_number
    from generate_series(2, o_series - 1) y
    where not exists (select 1 from public.opennumber_cards c where c.series = o_series and c.number = y)
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
      where series = r.series and number = r.number;
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
  n_series int := public.opennumber_cfg('max_series')::int;
  v_taken  bigint;
  v_locked bigint;
begin
  select coalesce(sum(taken), 0) into v_taken from public.opennumber_series_taken;
  select coalesce(sum(current_bid), 0) into v_locked
  from public.opennumber_listings where current_bidder = p.id and status = 'active';
  return jsonb_build_object(
    'username',            p.username,
    'boosters',            p.boosters,
    'max_boosters',        v_max,
    'regen_minutes',       v_min,
    'regen_amount',        public.opennumber_cfg('regen_amount')::int,
    'boosters_opened',     p.boosters_opened,
    'next_refill_at',      case when p.boosters >= v_max then null
                                else p.boosters_updated_at + v_min * interval '1 minute' end,
    'coins',               p.coins,
    'coins_locked',        v_locked,
    'cards_taken',         v_taken,
    'total_cards',         n_series::bigint * (n_series + 1) / 2,
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

-- Ouvre un booster. Chaque carte tirée n'existait pas encore : elle devient la seule de son espèce, et elle est à toi.
create or replace function public.opennumber_open_booster()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid      uuid := auth.uid();
  p        public.opennumber_profiles;
  v_max    int;
  was_full boolean;
  n_series int;
  n_cards  int;
  e        double precision;
  w        double precision;
  r        double precision;
  m        int;
  avail    int;
  k        int;
  num      int;
  got      int := 0;
  tries    int := 0;
  rows     int;
  res      jsonb := '[]'::jsonb;
  v_golden boolean := false;
  gc       record;
  q        int;
  s2       int;
  n2       int;
  t2       int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  p := public.opennumber_sync(uid);
  if p.boosters <= 0 then raise exception 'no_boosters'; end if;

  v_max    := public.opennumber_cfg('max_boosters')::int;
  was_full := p.boosters >= v_max;
  n_series := public.opennumber_cfg('max_series')::int;
  n_cards  := public.opennumber_cfg('cards_per_booster')::int;
  e        := public.opennumber_cfg('rarity_exponent')::double precision;

  -- Booster doré : chance très faible, contenu défini dans opennumber_golden_contents
  if random() < coalesce(public.opennumber_cfg('golden_booster_chance'), 0)::double precision then
    v_golden := true;
    for gc in select rarity_id, quantity from public.opennumber_golden_contents order by rarity_id loop
      for q in 1 .. gc.quantity loop
        t2 := 0;
        while t2 < 10 loop
          t2 := t2 + 1;
          select d.o_series, d.o_number into s2, n2 from public.opennumber_draw_rarity(gc.rarity_id) d;
          exit when s2 is null;
          insert into public.opennumber_cards (series, number, owner_id) values (s2, n2, uid)
          on conflict (series, number) do nothing;
          get diagnostics rows = row_count;
          if rows = 1 then
            got := got + 1;
            res := res || jsonb_build_array(jsonb_build_object(
              'series', s2, 'number', n2, 'rarity_id', public.opennumber_rarity_id(n2, s2)
            ));
            exit;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  while not v_golden and got < n_cards and tries < n_cards * 25 loop
    tries := tries + 1;

    -- Poids d'une série = cartes encore disponibles x poids d'une carte (taille ^ exposant)
    select sum((g - coalesce(t.taken, 0)) * power(g::double precision, e)) into w
    from generate_series(1, n_series) g
    left join public.opennumber_series_taken t on t.series = g;
    exit when w is null or w <= 0;          -- plus aucune carte disponible

    r := random() * w;
    select q.g into m
    from (
      select g, sum((g - coalesce(t.taken, 0)) * power(g::double precision, e)) over (order by g) as cs
      from generate_series(1, n_series) g
      left join public.opennumber_series_taken t on t.series = g
    ) q
    where q.cs > r
    order by q.g
    limit 1;
    continue when m is null;

    select m - coalesce((select taken from public.opennumber_series_taken where series = m), 0) into avail;
    continue when avail <= 0;

    -- Une des cartes encore disponibles de la série, au hasard
    k := floor(random() * avail)::int;
    select x into num
    from generate_series(1, m) x
    where not exists (select 1 from public.opennumber_cards c where c.series = m and c.number = x)
    order by x
    offset k limit 1;
    continue when num is null;

    insert into public.opennumber_cards (series, number, owner_id) values (m, num, uid)
    on conflict (series, number) do nothing;
    get diagnostics rows = row_count;
    continue when rows = 0;                 -- quelqu'un d'autre vient de la tirer : on retente

    got := got + 1;
    res := res || jsonb_build_array(jsonb_build_object(
      'series', m, 'number', num, 'rarity_id', public.opennumber_rarity_id(num, m)
    ));
  end loop;

  if got = 0 then raise exception 'pool_empty'; end if;   -- annule aussi la consommation du booster

  update public.opennumber_profiles
  set boosters            = boosters - 1,
      boosters_opened     = boosters_opened + 1,
      boosters_updated_at = case when was_full then now() else boosters_updated_at end
  where id = uid returning * into p;

  return jsonb_build_object('cards', res, 'golden', v_golden, 'status', public.opennumber_status_json(p));
end $$;

-- Mes cartes (filtre rareté, tri, pagination)
create or replace function public.opennumber_list_collection(
  p_rarity text default null,
  p_sort   text default 'series',
  p_limit  int  default 60,
  p_offset int  default 0
)
returns table (
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
  select x.series, x.number, x.rid, x.obtained_at, l.id, l.kind, count(*) over ()
  from (
    select c.series, c.number, c.obtained_at,
           public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_cards c
    where c.owner_id = uid
  ) x
  left join public.opennumber_rarities r on r.id = x.rid
  left join public.opennumber_listings l
         on l.series = x.series and l.number = x.number and l.status = 'active'
  where p_rarity is null or x.rid = p_rarity
  order by
    case when p_sort = 'rarity' then r.sort_order end asc nulls last,
    case when p_sort = 'recent' then x.obtained_at end desc,
    x.series asc, x.number asc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end $$;

-- État d'une série : mes cartes (avec l'annonce éventuelle) et celles prises par d'autres joueurs
create or replace function public.opennumber_series_state(p_series int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_mine jsonb; v_taken jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();
  select coalesce(jsonb_object_agg(c.number::text, coalesce(l.id, 0)), '{}'::jsonb) into v_mine
  from public.opennumber_cards c
  left join public.opennumber_listings l on l.series = c.series and l.number = c.number and l.status = 'active'
  where c.series = p_series and c.owner_id = uid;
  select coalesce(jsonb_agg(c.number order by c.number), '[]'::jsonb) into v_taken
  from public.opennumber_cards c
  where c.series = p_series and c.owner_id <> uid;
  return jsonb_build_object('mine', v_mine, 'taken', v_taken);
end $$;

-- Statistiques de collection
create or replace function public.opennumber_my_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid      uuid := auth.uid();
  n_series int  := public.opennumber_cfg('max_series')::int;
  v_unique text;
  v_alpha  text;
  v_omega  text;
  by_rarity jsonb;
  v_owned  bigint;
  v_started bigint;
  v_rarest jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.opennumber_settle_due();

  select id into v_unique from public.opennumber_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.opennumber_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.opennumber_rarities where kind = 'omega'  limit 1;

  with s as (
    select g as m, public.opennumber_range_rarity(g) as rid from generate_series(1, n_series) g
  ),
  totals as (
    select rid as id, sum(m - case when m = 1 then 1 else 2 end)::bigint as n from s group by rid
    union all select v_unique, 1::bigint where v_unique is not null
    union all select v_alpha,  count(*)::bigint from s where m > 1 and v_alpha is not null
    union all select v_omega,  count(*)::bigint from s where m > 1 and v_omega is not null
  ),
  tot as (select id, sum(n)::bigint as n from totals group by id),
  own as (
    select public.opennumber_rarity_id(c.number, c.series) as id, count(*)::bigint as n
    from public.opennumber_cards c
    where c.owner_id = uid
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'owned', coalesce(own.n, 0), 'total', coalesce(tot.n, 0)
         ) order by r.sort_order)
  into by_rarity
  from public.opennumber_rarities r
  left join tot on tot.id = r.id
  left join own on own.id = r.id;

  select count(*), count(distinct series) into v_owned, v_started
  from public.opennumber_cards where owner_id = uid;

  select jsonb_build_object('series', q.series, 'number', q.number, 'rarity_id', q.rid)
  into v_rarest
  from (
    select c.series, c.number, public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_cards c where c.owner_id = uid
  ) q
  left join public.opennumber_rarities r on r.id = q.rid
  order by r.sort_order asc nulls last, q.series asc, q.number asc
  limit 1;

  return jsonb_build_object(
    'max_series',     n_series,
    'total_cards',    n_series::bigint * (n_series + 1) / 2,
    'unique_owned',   v_owned,
    'series_started', v_started,
    'by_rarity',      coalesce(by_rarity, '[]'::jsonb),
    'rarest',         v_rarest
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

-- Revente directe : la carte retourne dans les boosters, tu reçois des pièces
create or replace function public.opennumber_sell_direct(p_series int, p_number int)
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
  where series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.opennumber_listings
             where series = p_series and number = p_number and status = 'active') then
    raise exception 'card_listed';
  end if;
  delete from public.opennumber_cards where series = p_series and number = p_number;
  update public.opennumber_profiles set coins = coins + v_price where id = uid returning * into p;
  return jsonb_build_object('status', public.opennumber_status_json(p));
end $$;

-- Mise en vente : achat direct (prix libre) ou enchère (durée et prix de départ fixés dans la config)
create or replace function public.opennumber_list_card(p_series int, p_number int, p_kind text, p_price int default null)
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
  where series = p_series and number = p_number for update;
  if v_owner is distinct from uid then raise exception 'not_owner'; end if;
  if exists (select 1 from public.opennumber_listings
             where series = p_series and number = p_number and status = 'active') then
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

  insert into public.opennumber_listings (series, number, seller_id, kind, price, ends_at)
  values (p_series, p_number, uid, p_kind, v_price, v_end)
  returning id into v_id;
  return jsonb_build_object('listing_id', v_id);
end $$;

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
  where series = l.series and number = l.number and owner_id = l.seller_id;
  if not found then raise exception 'listing_unavailable'; end if;
  update public.opennumber_listings
  set status = 'sold', buyer_id = uid, final_price = l.price, closed_at = now() where id = l.id;
  return jsonb_build_object('status', public.opennumber_status_json(p));
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
  select l.id, l.series, l.number, public.opennumber_rarity_id(l.number, l.series), p.username, l.kind,
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
  select l.id, l.series, l.number, public.opennumber_rarity_id(l.number, l.series), l.kind,
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

-- ---------- Droits d'exécution ----------
revoke all on function public.opennumber_ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.opennumber_sync(uuid) from public, anon, authenticated;
revoke all on function public.opennumber_settle_due() from public, anon, authenticated;
revoke all on function public.opennumber_status_json(public.opennumber_profiles) from public, anon, authenticated;
revoke all on function public.opennumber_cards_counter() from public, anon, authenticated;
revoke all on function public.opennumber_draw_rarity(text) from public, anon, authenticated;

revoke all on function public.opennumber_status()                                 from public, anon;
revoke all on function public.opennumber_open_booster()                           from public, anon;
revoke all on function public.opennumber_list_collection(text, text, int, int)    from public, anon;
revoke all on function public.opennumber_series_state(int)                        from public, anon;
revoke all on function public.opennumber_my_stats()                               from public, anon;
revoke all on function public.opennumber_set_username(text)                       from public, anon;
revoke all on function public.opennumber_sell_direct(int, int)                    from public, anon;
revoke all on function public.opennumber_list_card(int, int, text, int)           from public, anon;
revoke all on function public.opennumber_cancel_listing(bigint)                   from public, anon;
revoke all on function public.opennumber_buy_now(bigint)                          from public, anon;
revoke all on function public.opennumber_place_bid(bigint, int)                   from public, anon;
revoke all on function public.opennumber_market_list(text, text, int, int)        from public, anon;
revoke all on function public.opennumber_market_mine()                            from public, anon;

grant execute on function public.opennumber_status()                              to authenticated;
grant execute on function public.opennumber_open_booster()                        to authenticated;
grant execute on function public.opennumber_list_collection(text, text, int, int) to authenticated;
grant execute on function public.opennumber_series_state(int)                     to authenticated;
grant execute on function public.opennumber_my_stats()                            to authenticated;
grant execute on function public.opennumber_set_username(text)                    to authenticated;
grant execute on function public.opennumber_sell_direct(int, int)                 to authenticated;
grant execute on function public.opennumber_list_card(int, int, text, int)        to authenticated;
grant execute on function public.opennumber_cancel_listing(bigint)                to authenticated;
grant execute on function public.opennumber_buy_now(bigint)                       to authenticated;
grant execute on function public.opennumber_place_bid(bigint, int)                to authenticated;
grant execute on function public.opennumber_market_list(text, text, int, int)     to authenticated;
grant execute on function public.opennumber_market_mine()                         to authenticated;
