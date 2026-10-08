\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
-- Profils des trois joueurs de test, créés comme dans l'application (au premier appel d'une fonction)
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
delete from public.{{P}}cards; delete from public.{{P}}bids; delete from public.{{P}}listings;
update public.{{P}}categories set closed = false, series_count = 500;
update public.{{P}}config set value = 0 where key in ('golden_booster_chance','rarity_exponent');
update public.{{P}}config set value = 100000 where key = 'max_boosters';
update public.{{P}}profiles set boosters = 100000 where id = :A;
set request.jwt.claim.sub = :A;

\echo '=== 1. chances au départ (exposant 0, Ultra <= 35) : calcul serveur'
select r->>'id' as rarete, r->>'remaining' as restantes, r->>'total' as total,
       round((r->>'share')::numeric * 100, 4) as pct_par_carte, round((r->>'per_booster')::numeric * 100, 3) as pct_par_booster,
       case when (r->>'per_booster')::float > 0 then round(1 / (r->>'per_booster')::numeric) end as un_booster_sur
from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r;
select 'somme des parts = 1', round(sum((r->>'share')::numeric), 6), 'cartes restantes', sum((r->>'remaining')::bigint), 'pool_left', (public.{{P}}draw_odds()->>'pool_left')
from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r;
select 'catégorie / exposant / cartes par booster', public.{{P}}draw_odds()->>'category_id', public.{{P}}draw_odds()->>'exponent', public.{{P}}draw_odds()->>'cards_per_booster';
select 'booster doré', public.{{P}}draw_odds()->'golden' as dore;

\echo '=== 2. 600 vrais boosters (3 000 cartes) : fréquences observées / attendues'
create temp table shares as select r->>'id' id, (r->>'share')::float p from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r;
\timing on
select count(*) from (select public.{{P}}open_booster() from generate_series(1, 600)) x;
\timing off
create temp table obs as select public.{{P}}rarity_id(number, series, type_id) id, count(*) n from public.{{P}}cards group by 1;
select s.id, coalesce(o.n,0) as observees, round((s.p * 3000)::numeric, 1) as attendues,
       round(((coalesce(o.n,0) - s.p * 3000) / nullif(sqrt(3000 * s.p * (1 - s.p)), 0))::numeric, 2) as ecart_en_sigmas
from shares s left join obs o using (id) order by s.p;

\echo '=== 3. après les tirages : le pool restant et les chances évoluent'
select r->>'id' as rarete, r->>'remaining' as restantes, round((r->>'share')::numeric * 100, 4) as pct_par_carte
from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r;
select 'cartes restantes + tirées = total', (select sum((r->>'remaining')::bigint) from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r) + (select count(*) from public.{{P}}cards) as somme;

\echo '=== 4. catégorie 2 explicitement, toutes catégories terminées'
select 'catégorie 2', public.{{P}}draw_odds(2)->>'category_id', public.{{P}}draw_odds(2)->>'pool_left';
update public.{{P}}categories set closed = true;
select 'plus de catégorie active', public.{{P}}draw_odds()->>'category_id' is null as sans_categorie, public.{{P}}draw_odds()->'by_rarity' as lignes;
update public.{{P}}categories set closed = false;

\echo '=== 5. exposant 1 (ancien réglage) pour comparaison : Ultra et Unique'
update public.{{P}}config set value = 1 where key = 'rarity_exponent';
select r->>'id' as rarete, round((r->>'share')::numeric * 100, 6) as pct_par_carte from jsonb_array_elements(public.{{P}}draw_odds()->'by_rarity') r where r->>'id' in ('unique','ultra','rare');
update public.{{P}}config set value = 0 where key = 'rarity_exponent';

\echo '=== 6. droits'
reset role;
set role authenticated; set request.jwt.claim.sub = :A;
select 'joueur connecté peut lire les chances', jsonb_array_length(public.{{P}}draw_odds()->'by_rarity') as lignes;
reset role; set role anon;
do $$ begin perform public.{{P}}draw_odds(); raise notice 'anon: autorisé (anormal)'; exception when others then raise notice 'anon refusé: %', sqlerrm; end $$;
reset role;
