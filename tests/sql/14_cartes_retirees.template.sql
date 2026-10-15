\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name in ('Mini', 'Mini2');
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'rarity_exponent');
select value as min_serie_avant from public.{{P}}config where key = 'series_reward_min_size' \gset
update public.{{P}}config set value = 3 where key = 'series_reward_min_size';
update public.{{P}}profiles set boosters = 100, bonus_boosters = 0, coins = 0;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :A;

-- « Mini » : 3 séries (M1 et M3 : réglage par défaut ; M2 : numéros jamais visibles)
select (public.{{P}}admin_save_category('thomarie', null, 'Mini', 90, 3, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'M1', '1', 1) ->> 'id')::int as m1 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'M2', '2', 2) ->> 'id')::int as m2 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'M3', '3', 3) ->> 'id')::int as m3 \gset
select (public.{{P}}admin_save_type_rarities('thomarie', :m2, '[{"rarity_id":"common","max_series":3,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as m2_regle;

\echo '=== vente rapide d''une carte : elle est RETIRÉE du jeu (ligne gardée sans propriétaire), pas rendue aux boosters'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:m1, 1, 1, :A);
insert into public.{{P}}favorites (user_id, type_id, base_rarity, series, number) values (:B, :m1, public.{{P}}default_base_rarity(:m1, 1), 1, 1);
insert into public.{{P}}offers (type_id, base_rarity, series, number, buyer_id, seller_id, amount) values (:m1, public.{{P}}default_base_rarity(:m1, 1), 1, 1, :B, :A, 3);
select coalesce((select taken from public.{{P}}series_taken where type_id = :m1 and base_rarity = public.{{P}}default_base_rarity(:m1, 1) and series = 1), 0) + 1 as compteur_avant \gset
select coins as coins_avant from public.{{P}}profiles where id = :A \gset
select public.{{P}}sell_direct(:m1, public.{{P}}default_base_rarity(:m1, 1), 1, 1) ->> 'status' is not null as vendue;
select owner_id is null as sans_proprietaire, retired_at is not null as date_de_retrait from public.{{P}}cards where type_id = :m1 and series = 1 and number = 1;
select base_rarity as base_vendue from public.{{P}}cards where type_id = :m1 and series = 1 and number = 1 \gset
select (select taken from public.{{P}}series_taken where type_id = :m1 and base_rarity = :'base_vendue' and series = 1) = :compteur_avant as compteur_de_serie_inchange;
select (select coins from public.{{P}}profiles where id = :A) - :coins_avant = public.{{P}}cfg('direct_sell_price')::int as pieces_creditees;
select (select count(*) from public.{{P}}favorites where type_id = :m1 and series = 1 and number = 1) as favoris_restants,
       (select status from public.{{P}}offers where type_id = :m1 and series = 1 and number = 1) as offre_en_attente_devenue;
select (select count(*) from public.{{P}}list_collection(:cat, null, null, 'series', 60, 0)) as tuiles_dans_ma_collection,
       (select (r->>'owned')::int from jsonb_array_elements(public.{{P}}my_stats(:cat)->'categories') r where (r->>'id')::int = :cat) as cartes_a_moi,
       public.{{P}}category_taken(:cat) as cartes_tirees_de_la_categorie;
select pg_temp.try(format('select public.{{P}}sell_direct(%1$s, public.{{P}}default_base_rarity(%1$s, 1), 1, 1)', :m1));                  -- not_owner : elle n'existe plus pour personne
select pg_temp.try(format('select public.{{P}}list_card(%1$s, public.{{P}}default_base_rarity(%1$s, 1), 1, 1, ''buy_now'', 5)', :m1));    -- not_owner
set request.jwt.claim.sub = :B;
select pg_temp.try(format('select public.{{P}}make_offer(%1$s, public.{{P}}default_base_rarity(%1$s, 1), 1, 1, 2)', :m1));                -- offre sur une carte sans propriétaire
set request.jwt.claim.sub = :A;

\echo '=== elle ne peut plus être tirée : aucun tirage de rareté Unique ne redonne CETTE 1/1 (les 1/1 des autres raretés et des autres types sortent toujours)'
create temp table du as select (d).o_type as t, (d).o_base as b from (select public.{{P}}draw_rarity('unique', :cat) as d from generate_series(1, 200) offset 0) q;
select count(*) filter (where t = :m1 and b = :'base_vendue') as tirages_de_la_unique_retiree,
       count(*) filter (where t = :m1 and b <> :'base_vendue') > 0 as les_1_1_des_autres_raretes_du_meme_type_sortent_toujours,
       count(*) filter (where t in (:m2, :m3)) > 0 as les_autres_types_sortent_toujours from du;

\echo '=== vente rapide en lot : des cartes sans numéro (M2) retirées, la dernière gardée ; plus aucune carte M2 n''est tirable'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:m2, 2, 1, :A), (:m2, 2, 2, :A), (:m2, 3, 1, :A), (:m2, 3, 2, :A), (:m2, 3, 3, :A);
select (public.{{P}}sell_direct_many(:m2, 'common', 4) ->> 'sold')::int as vendues_en_lot;
select count(*) filter (where owner_id is null and retired_at is not null) as retirees, count(*) filter (where owner_id = :A) as gardees, count(*) as lignes_conservees from public.{{P}}cards where type_id = :m2;
select string_agg(series || ':' || taken, ' ' order by series) as compteurs_m2_inchanges from public.{{P}}series_taken where type_id = :m2;
create temp table dc as select (d).o_type as t from (select public.{{P}}draw_rarity('common', :cat) as d from generate_series(1, 120) offset 0) q;
select count(*) filter (where t = :m2) as tirages_m2_common_alors_que_toutes_sont_prises_ou_retirees from dc;
-- (M1 et M3 n'ont aucune carte Commune dans une catégorie de 3 séries : toutes les leurs sont Ultra Rare ; on vérifie donc avec l'Ultra Rare)
create temp table dun as select (d).o_type as t from (select public.{{P}}draw_rarity('ultra', :cat) as d from generate_series(1, 120) offset 0) q;
select count(*) filter (where t in (:m1, :m3)) > 0 as les_autres_types_sortent_toujours, count(*) filter (where t = :m2) as m2_jamais_en_ultra from dun;
delete from public.{{P}}cards where type_id = :m2;

\echo '=== récompense de série : une série dont une carte est retirée n''est jamais « complète »'
-- témoin : A possède les 3 cartes de la série 3 de M3 -> récompense (déclencheur) ; on la retire pour tester le rattrapage
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:m3, 3, 1, :A), (:m3, 3, 2, :A), (:m3, 3, 3, :A);
select count(*) as recompense_donnee_a_l_insertion from public.{{P}}series_rewards where type_id = :m3 and series = 3;
delete from public.{{P}}series_rewards where type_id = :m3 and series = 3;
select golden_packs as packs_avant from public.{{P}}profiles where id = :A \gset
select public.{{P}}series_rewards_backfill() as rattrapage_serie_complete;
select (select golden_packs from public.{{P}}profiles where id = :A) - :packs_avant as pack_donne_par_le_rattrapage;
-- puis une carte de la série est vendue (retirée) : le déclencheur ne récompense pas, le rattrapage non plus
delete from public.{{P}}series_rewards where type_id = :m3 and series = 3;
select golden_packs as packs_avant from public.{{P}}profiles where id = :A \gset
select public.{{P}}sell_direct(:m3, public.{{P}}default_base_rarity(:m3, 3), 3, 2) ->> 'status' is not null as vendue_de_la_serie_3;
select count(*) as recompense_apres_la_vente from public.{{P}}series_rewards where type_id = :m3 and series = 3;
select public.{{P}}series_rewards_backfill() as rattrapage_avec_une_carte_retiree;
select count(*) as recompense_apres_rattrapage, (select golden_packs from public.{{P}}profiles where id = :A) - :packs_avant as packs_en_plus from public.{{P}}series_rewards where type_id = :m3 and series = 3;

\echo '=== un vrai booster ne peut jamais redonner une carte retirée (catégorie de 3 cartes seulement)'
select (public.{{P}}admin_save_category('thomarie', null, 'Mini2', 0, 2, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat2 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat2, 'X', 'x', 1) ->> 'id')::int as tx \gset
-- une seule rareté sur 2 séries : 3 cartes en tout (1/1, 1/2, 2/2)
select (public.{{P}}admin_save_type_rarities('thomarie', :tx, '[{"rarity_id":"common","max_series":2,"numbered_series":2}]'::jsonb) ->> 'ok')::bool as x_a_3_cartes;
update public.{{P}}categories set enabled = false where id not in (:cat2);
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:tx, 1, 1, :A);
select public.{{P}}sell_direct(:tx, public.{{P}}default_base_rarity(:tx, 1), 1, 1) ->> 'status' is not null as unique_de_x_vendue;
set request.jwt.claim.sub = :B;
select pg_temp.try('select public.{{P}}open_booster()');           -- il ne reste que 2 cartes : jamais 3
select pg_temp.try('select public.{{P}}open_booster()');           -- plus rien à tirer
select count(*) as cartes_tirees_par_b, count(*) filter (where series = 1 and number = 1) as la_carte_retiree_parmi_elles from public.{{P}}cards where type_id = :tx and owner_id = :B;
select owner_id is null as toujours_retiree from public.{{P}}cards where type_id = :tx and series = 1 and number = 1;
set request.jwt.claim.sub = :A;

update public.{{P}}categories set enabled = true where id <> :cat2;
delete from public.{{P}}categories where id in (:cat, :cat2);
update public.{{P}}config set value = :min_serie_avant where key = 'series_reward_min_size';
update public.{{P}}profiles set coins = 0;
