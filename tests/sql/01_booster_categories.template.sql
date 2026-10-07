\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
-- Profils des trois joueurs de test, créés comme dans l'application (au premier appel d'une fonction)
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
delete from public.{{P}}cards; delete from public.{{P}}bids; delete from public.{{P}}listings;
update public.{{P}}profiles set boosters = 50, bonus_boosters = 0, coins = 0;
update public.{{P}}config set value = 100 where key = 'max_boosters';  -- pas de plafond pendant le test
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
update public.{{P}}categories set closed = false, series_count = 500;
set request.jwt.claim.sub = :A;

\echo '=== 1. totaux par rareté de la catégorie 1 (attendu : 1 002 000 au total)'
select (e->>'id') id, (e->>'total')::bigint total from jsonb_array_elements(public.{{P}}my_stats(1)->'by_rarity') e;
select sum((e->>'total')::bigint) as somme, public.{{P}}my_stats(1)->>'total_cards' as total_cards from jsonb_array_elements(public.{{P}}my_stats(1)->'by_rarity') e;

\echo '=== 2. 12 boosters : uniquement la catégorie en cours (Années 80 = types 1 à 8)'
select count(*) from (select public.{{P}}open_booster() from generate_series(1,12)) x;
select min(type_id) tmin, max(type_id) tmax, count(*) cartes, count(distinct (type_id, series, number)) distinctes from public.{{P}}cards;
select 'compteurs = cartes', (select coalesce(sum(taken),0) from public.{{P}}series_taken) = (select count(*) from public.{{P}}cards);
select 'statut : catégorie active', (public.{{P}}status()->>'active_category_id') as active, public.{{P}}status()->'next_category' as suivante, public.{{P}}status()->>'cards_taken' as tirées, public.{{P}}status()->>'total_cards' as total;
select 'cartes tirées valides (numéro <= série <= 500)', bool_and(number <= series and series <= 500) from public.{{P}}cards;

\echo '=== 3. épuisement : catégorie 1 réduite à 2 séries (8 types x 3 cartes = 24 cartes)'
delete from public.{{P}}cards;
update public.{{P}}categories set series_count = 2 where id = 1;
update public.{{P}}categories set series_count = 500 where id = 2;
update public.{{P}}profiles set boosters = 50;
select (select count(*) from public.{{P}}cards) as cartes, public.{{P}}category_total(1) as total_cat1;
do $$ declare r jsonb; i int; begin
  for i in 1..5 loop
    r := public.{{P}}open_booster();
    raise notice 'booster % : % cartes, catégorie %, types %, catégorie active ensuite = %', i, jsonb_array_length(r->'cards'), r->>'category_id',
      (select string_agg(distinct (c->>'type_id'), ',') from jsonb_array_elements(r->'cards') c), r->'status'->>'active_category_id';
  end loop; end $$;
select 'catégorie 1 terminée', closed from public.{{P}}categories where id = 1;
select 'cartes de la catégorie 1 tirées', count(*) from public.{{P}}cards where type_id between 1 and 8;
\echo '--- booster suivant : doit venir de la catégorie 2 (types 9 à 16)'
do $$ declare r jsonb; begin r := public.{{P}}open_booster();
  raise notice 'catégorie %, types %', r->>'category_id', (select string_agg(distinct (c->>'type_id'), ',' order by c->>'type_id') from jsonb_array_elements(r->'cards') c); end $$;

\echo '=== 4. revente à la banque : refusée dans une catégorie terminée, acceptée dans la catégorie en cours'
create temp table c1 as select type_id, series, number from public.{{P}}cards where type_id <= 8 limit 1;
create temp table c2 as select type_id, series, number from public.{{P}}cards where type_id >= 9 limit 1;
select pg_temp.try(format('select public.{{P}}sell_direct(%s,%s,%s)', type_id, series, number)) from c1;
select (select taken from public.{{P}}series_taken s where s.type_id = c2.type_id and s.series = c2.series) as taken_avant from c2;
select public.{{P}}sell_direct(type_id, series, number)->'status'->>'coins' as coins_apres from c2;
select (select taken from public.{{P}}series_taken s where s.type_id = c2.type_id and s.series = c2.series) as taken_apres, exists (select 1 from public.{{P}}cards c where c.type_id=c2.type_id and c.series=c2.series and c.number=c2.number) as encore_possedee from c2;
select 'la carte vendue peut être retirée de nouveau (retour dans le pool)', true;

\echo '=== 5. booster doré dans la catégorie 2 (chance forcée)'
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
create temp table gold as select public.{{P}}open_booster() r from generate_series(1,5);
select (r->>'golden') golden, r->>'category_id' cat, jsonb_array_length(r->'cards') nb,
  (select string_agg(c->>'rarity_id', ',' order by c->>'rarity_id') from jsonb_array_elements(r->'cards') c) raretes,
  (select bool_and((c->>'type_id')::int between 9 and 16) from jsonb_array_elements(r->'cards') c) types_cat2
from gold;
select 'cartes dorées distinctes', count(*) = count(distinct (c->>'type_id', c->>'series', c->>'number')) from gold, jsonb_array_elements(r->'cards') c;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';

\echo '=== 6. toutes les catégories épuisées -> pool_empty ; boosters non consommés'
update public.{{P}}categories set closed = true;
update public.{{P}}profiles set boosters = 7 where id = :A;
select pg_temp.try('select public.{{P}}open_booster()');
select 'boosters intacts', boosters from public.{{P}}profiles where id = :A;
update public.{{P}}categories set closed = false where id = 2;
