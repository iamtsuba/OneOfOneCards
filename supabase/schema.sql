-- =====================================================================
-- OneOfOne Pack : schéma Supabase (toutes les tables commencent par opennumber_)
-- À coller en entier dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- =====================================================================

-- ---------- Configuration du jeu (modifiable à tout moment) ----------
create table if not exists public.opennumber_config (
  key         text primary key,
  value       numeric not null,
  description text
);

insert into public.opennumber_config (key, value, description) values
  ('max_series',        1413, 'Taille maximale de série : cartes 1/1 jusqu''à N/N'),
  ('cards_per_booster', 5,    'Nombre de cartes par booster'),
  ('start_boosters',    10,   'Boosters offerts à la création du profil'),
  ('regen_minutes',     10,   'Délai entre deux recharges (minutes)'),
  ('regen_amount',      10,   'Boosters gagnés à chaque recharge'),
  ('max_boosters',      50,   'Plafond de boosters en stock'),
  ('rarity_exponent',   1,    'Poids d''une carte = taille_de_série ^ exposant. 1 = rareté proportionnelle (1/1 quasi introuvable), 0 = tirage uniforme sur toutes les cartes')
on conflict (key) do nothing;

-- ---------- Raretés (seuils et couleurs modifiables) ----------
-- kind : unique (1/1), alpha (1/10, 1/100...), omega (10/10, 100/100...),
--        range (selon la taille de série : max_series = taille maximale incluse, null = toutes les autres)
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

-- ---------- Profils et collections ----------
create table if not exists public.opennumber_profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text not null,
  boosters            int  not null default 0,
  boosters_updated_at timestamptz not null default now(),
  boosters_opened     int  not null default 0,
  created_at          timestamptz not null default now()
);

-- Une ligne par carte possédée (la carte est identifiée par série + numéro)
create table if not exists public.opennumber_collection (
  user_id           uuid not null references auth.users (id) on delete cascade,
  series            int  not null check (series >= 1),
  number            int  not null check (number >= 1 and number <= series),
  quantity          int  not null default 1,
  first_obtained_at timestamptz not null default now(),
  last_obtained_at  timestamptz not null default now(),
  primary key (user_id, series, number)
);

create index if not exists opennumber_collection_recent_idx
  on public.opennumber_collection (user_id, last_obtained_at desc);

-- ---------- Sécurité : lecture seule depuis le navigateur ----------
alter table public.opennumber_config     enable row level security;
alter table public.opennumber_rarities   enable row level security;
alter table public.opennumber_profiles   enable row level security;
alter table public.opennumber_collection enable row level security;

drop policy if exists opennumber_config_read on public.opennumber_config;
create policy opennumber_config_read on public.opennumber_config
  for select to anon, authenticated using (true);

drop policy if exists opennumber_rarities_read on public.opennumber_rarities;
create policy opennumber_rarities_read on public.opennumber_rarities
  for select to anon, authenticated using (true);

drop policy if exists opennumber_profiles_read_own on public.opennumber_profiles;
create policy opennumber_profiles_read_own on public.opennumber_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists opennumber_collection_read_own on public.opennumber_collection;
create policy opennumber_collection_read_own on public.opennumber_collection
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on
  public.opennumber_config, public.opennumber_rarities,
  public.opennumber_profiles, public.opennumber_collection
from anon, authenticated;

-- ---------- Fonctions utilitaires ----------
create or replace function public.opennumber_cfg(p_key text)
returns numeric language sql stable set search_path = public as $$
  select value from public.opennumber_config where key = p_key
$$;

create or replace function public.opennumber_is_pow10(m int)
returns boolean language sql immutable as $$
  select m >= 10 and power(10::numeric, round(log(m::numeric))) = m::numeric
$$;

create or replace function public.opennumber_range_rarity(m int)
returns text language sql stable set search_path = public as $$
  select id from public.opennumber_rarities
  where kind = 'range' and (max_series is null or m <= max_series)
  order by max_series nulls last
  limit 1
$$;

-- Rareté d'une carte n/m. Priorité : Unique > Alpha > Omega > rareté par taille de série
create or replace function public.opennumber_rarity_id(n int, m int)
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  if m = 1 then
    select id into v from public.opennumber_rarities where kind = 'unique' limit 1;
  elsif n = 1 and public.opennumber_is_pow10(m) then
    select id into v from public.opennumber_rarities where kind = 'alpha' limit 1;
  elsif n = m and public.opennumber_is_pow10(m) then
    select id into v from public.opennumber_rarities where kind = 'omega' limit 1;
  end if;
  return coalesce(v, public.opennumber_range_rarity(m));
end $$;

-- ---------- Recharge des boosters (calculée à la demande, sans tâche planifiée) ----------
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
  -- Le profil est créé à la première connexion
  insert into public.opennumber_profiles (id, username, boosters)
  select a.id,
         left(coalesce(nullif(trim(a.raw_user_meta_data ->> 'username'), ''),
                       nullif(split_part(a.email, '@', 1), ''), 'joueur'), 24),
         public.opennumber_cfg('start_boosters')::int
  from auth.users a
  where a.id = p_uid
  on conflict (id) do nothing;

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

create or replace function public.opennumber_status_json(p public.opennumber_profiles)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_max int := public.opennumber_cfg('max_boosters')::int;
  v_min int := greatest(public.opennumber_cfg('regen_minutes')::int, 1);
begin
  return jsonb_build_object(
    'username',        p.username,
    'boosters',        p.boosters,
    'max_boosters',    v_max,
    'regen_minutes',   v_min,
    'regen_amount',    public.opennumber_cfg('regen_amount')::int,
    'boosters_opened', p.boosters_opened,
    'next_refill_at',  case when p.boosters >= v_max then null
                            else p.boosters_updated_at + v_min * interval '1 minute' end,
    'server_now',      now()
  );
end $$;

-- ---------- Fonctions appelées par l'application ----------
create or replace function public.opennumber_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.opennumber_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  p := public.opennumber_sync(auth.uid());
  return public.opennumber_status_json(p);
end $$;

-- Ouvre un booster : tirage entièrement côté serveur
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
  num      int;
  i        int;
  res      jsonb := '[]'::jsonb;
  ins      boolean;
  qty      int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  p := public.opennumber_sync(uid);
  if p.boosters <= 0 then raise exception 'no_boosters'; end if;

  v_max    := public.opennumber_cfg('max_boosters')::int;
  was_full := p.boosters >= v_max;

  update public.opennumber_profiles
  set boosters            = boosters - 1,
      boosters_opened     = boosters_opened + 1,
      boosters_updated_at = case when was_full then now() else boosters_updated_at end
  where id = uid returning * into p;

  n_series := public.opennumber_cfg('max_series')::int;
  n_cards  := public.opennumber_cfg('cards_per_booster')::int;
  e        := public.opennumber_cfg('rarity_exponent')::double precision;

  -- Poids d'une série de taille g : g cartes x poids g^e = g^(e+1)
  select sum(power(g::double precision, e + 1)) into w from generate_series(1, n_series) g;

  for i in 1 .. n_cards loop
    r := random() * w;
    select t.g into m
    from (
      select g, sum(power(g::double precision, e + 1)) over (order by g) as cs
      from generate_series(1, n_series) g
    ) t
    where t.cs >= r
    order by t.g
    limit 1;
    m   := coalesce(m, n_series);
    num := 1 + floor(random() * m)::int;

    insert into public.opennumber_collection as c (user_id, series, number)
    values (uid, m, num)
    on conflict (user_id, series, number)
    do update set quantity = c.quantity + 1, last_obtained_at = now()
    returning (xmax = 0), c.quantity into ins, qty;

    res := res || jsonb_build_array(jsonb_build_object(
      'series',    m,
      'number',    num,
      'rarity_id', public.opennumber_rarity_id(num, m),
      'is_new',    ins,
      'quantity',  qty
    ));
  end loop;

  return jsonb_build_object('cards', res, 'status', public.opennumber_status_json(p));
end $$;

-- Liste paginée de la collection (filtre rareté, tri)
create or replace function public.opennumber_list_collection(
  p_rarity text default null,
  p_sort   text default 'series',
  p_limit  int  default 60,
  p_offset int  default 0
)
returns table (
  card_series      int,
  card_number      int,
  quantity         int,
  rarity_id        text,
  last_obtained_at timestamptz,
  total            bigint
)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  select x.series, x.number, x.quantity, x.rid, x.last_obtained_at, count(*) over ()
  from (
    select c.series, c.number, c.quantity, c.last_obtained_at,
           public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_collection c
    where c.user_id = uid
  ) x
  left join public.opennumber_rarities r on r.id = x.rid
  where p_rarity is null or x.rid = p_rarity
  order by
    case when p_sort = 'rarity'   then r.sort_order end asc nulls last,
    case when p_sort = 'recent'   then x.last_obtained_at end desc,
    case when p_sort = 'quantity' then x.quantity end desc,
    x.series asc, x.number asc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end $$;

-- Cartes possédées dans une série : {"numéro": quantité}
create or replace function public.opennumber_series_owned(p_series int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(number::text, quantity), '{}'::jsonb)
  from public.opennumber_collection
  where user_id = auth.uid() and series = p_series
$$;

-- Statistiques de collection
create or replace function public.opennumber_my_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid      uuid := auth.uid();
  n_series int  := public.opennumber_cfg('max_series')::int;
  v_unique text;
  v_alpha  text;
  v_omega  text;
  by_rarity jsonb;
  v_owned  bigint;
  v_copies bigint;
  v_started bigint;
  v_rarest jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select id into v_unique from public.opennumber_rarities where kind = 'unique' limit 1;
  select id into v_alpha  from public.opennumber_rarities where kind = 'alpha'  limit 1;
  select id into v_omega  from public.opennumber_rarities where kind = 'omega'  limit 1;

  with s as (
    select g as m,
           public.opennumber_is_pow10(g) as p,
           public.opennumber_range_rarity(g) as rid
    from generate_series(1, n_series) g
  ),
  totals as (
    select rid as id,
           sum(m - case when m = 1 then 1 when p then 2 else 0 end)::bigint as n
    from s group by rid
    union all select v_unique, 1::bigint where v_unique is not null
    union all select v_alpha,  count(*)::bigint from s where p and v_alpha is not null
    union all select v_omega,  count(*)::bigint from s where p and v_omega is not null
  ),
  tot as (select id, sum(n)::bigint as n from totals group by id),
  own as (
    select public.opennumber_rarity_id(c.number, c.series) as id, count(*)::bigint as n
    from public.opennumber_collection c
    where c.user_id = uid
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'owned', coalesce(own.n, 0), 'total', coalesce(tot.n, 0)
         ) order by r.sort_order)
  into by_rarity
  from public.opennumber_rarities r
  left join tot on tot.id = r.id
  left join own on own.id = r.id;

  select count(*), coalesce(sum(quantity), 0), count(distinct series)
  into v_owned, v_copies, v_started
  from public.opennumber_collection where user_id = uid;

  select jsonb_build_object('series', q.series, 'number', q.number, 'rarity_id', q.rid)
  into v_rarest
  from (
    select c.series, c.number, public.opennumber_rarity_id(c.number, c.series) as rid
    from public.opennumber_collection c where c.user_id = uid
  ) q
  left join public.opennumber_rarities r on r.id = q.rid
  order by r.sort_order asc nulls last, q.series asc, q.number asc
  limit 1;

  return jsonb_build_object(
    'max_series',     n_series,
    'total_cards',    n_series::bigint * (n_series + 1) / 2,
    'unique_owned',   v_owned,
    'total_copies',   v_copies,
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
  perform public.opennumber_sync(auth.uid());
  update public.opennumber_profiles set username = v where id = auth.uid();
  return v;
end $$;

-- ---------- Droits d'exécution ----------
revoke all on function public.opennumber_sync(uuid) from public, anon, authenticated;
revoke all on function public.opennumber_status_json(public.opennumber_profiles) from public, anon, authenticated;

revoke all on function public.opennumber_status()                               from public, anon;
revoke all on function public.opennumber_open_booster()                         from public, anon;
revoke all on function public.opennumber_list_collection(text, text, int, int)  from public, anon;
revoke all on function public.opennumber_series_owned(int)                      from public, anon;
revoke all on function public.opennumber_my_stats()                             from public, anon;
revoke all on function public.opennumber_set_username(text)                     from public, anon;

grant execute on function public.opennumber_status()                               to authenticated;
grant execute on function public.opennumber_open_booster()                         to authenticated;
grant execute on function public.opennumber_list_collection(text, text, int, int)  to authenticated;
grant execute on function public.opennumber_series_owned(int)                      to authenticated;
grant execute on function public.opennumber_my_stats()                             to authenticated;
grant execute on function public.opennumber_set_username(text)                     to authenticated;
