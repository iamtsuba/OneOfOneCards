\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name = 'Test Topps';
delete from public.{{P}}rarities where id in ('legende', 'peu_commune');
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

\echo '=== nouvelles raretés, placées dans l''ordre d''affichage (Légende avant Ultra Rare, Peu commune avant Commune)'
select (public.{{P}}admin_create_rarity('thomarie', 'legende', 'Légende', 20, '#f5c542', '#b8860b', '#3d2a00', 'ultra') ->> 'ok')::bool as legende_creee;
select (public.{{P}}admin_create_rarity('thomarie', 'peu_commune', 'Peu commune', 400, '#cbd5e1', '#64748b', '#0f172a', 'common') ->> 'ok')::bool as peu_commune_creee;
select string_agg(id, ' < ' order by sort_order) as ordre_des_raretes_a_seuil from public.{{P}}rarities where kind = 'range';

\echo '=== catégorie « Test Topps » : un type complet, un type secret (Légende seulement), un type sans réglage propre'
select (public.{{P}}admin_save_category('thomarie', null, 'Test Topps', 97, 500, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Eau', '💧', 1) ->> 'id')::int as ta \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Iny', '🤫', 2) ->> 'id')::int as tb \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Peau', '🐱', 3) ->> 'id')::int as tc \gset
select (public.{{P}}admin_save_type_rarities('thomarie', :ta,
  '[{"rarity_id":"legende","max_series":20,"numbered_series":10},{"rarity_id":"ultra","max_series":100,"numbered_series":1},
    {"rarity_id":"super","max_series":200,"numbered_series":1},{"rarity_id":"rare","max_series":300,"numbered_series":1},
    {"rarity_id":"peu_commune","max_series":400,"numbered_series":1},{"rarity_id":"common","max_series":500,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as raretes_du_type_a;
select (public.{{P}}admin_save_type_rarities('thomarie', :tb,
  '[{"rarity_id":"legende","max_series":100,"numbered_series":10}]'::jsonb, true) ->> 'ok')::bool as type_secret_b;

\echo '--- tranches du type A (lo..hi, numéros visibles) et nombre de séries de chaque type'
select rarity_id, lo, hi, numbered from public.{{P}}type_bands(:ta) order by lo;
select public.{{P}}type_series_count(:ta) as series_a, public.{{P}}type_series_count(:tb) as series_b_secret, public.{{P}}type_series_count(:tc) as series_c_categorie;

\echo '--- rareté selon la taille de série, propre à chaque type'
select m, public.{{P}}type_range_rarity(m, :ta) as type_a, public.{{P}}type_range_rarity(m, :tb) as type_b_legende_seule
from unnest(array[5, 20, 21, 100, 101, 250, 350, 450]) m;

\echo '--- numéros visibles : Légende 1..10 visibles, 11..20 masqués ; 1re série de chaque tranche visible ; Commune jamais'
select m, public.{{P}}number_visible(m, :ta) as visible_a, public.{{P}}number_visible(m, :tb) as visible_b, public.{{P}}number_visible(m, :tc) as visible_c_sans_reglage
from unnest(array[1, 10, 11, 20, 21, 22, 101, 102, 401, 402, 500]) m;
-- Unique / Alpha / Omega restent universels
select public.{{P}}rarity_id(1, 1, :ta) as unique_1_1, public.{{P}}rarity_id(1, 7, :ta) as alpha_1_7, public.{{P}}rarity_id(7, 7, :ta) as omega_7_7, public.{{P}}rarity_id(3, 7, :ta) as milieu_serie_7;

\echo '=== totaux par type : A 500 séries, B (secret) 100 séries, C 500 séries (catégorie)'
select public.{{P}}category_total(:cat) = (500::bigint*501/2) + (100::bigint*101/2) + (500::bigint*501/2) as total_categorie_par_type;
select (select sum((r->>'total')::bigint) from jsonb_array_elements(public.{{P}}my_stats(:cat)->'by_rarity') r) = public.{{P}}category_total(:cat) as somme_des_raretes_egale_total;
select (t->>'total')::bigint as total_type_b from jsonb_array_elements(public.{{P}}my_stats(:cat)->'types') t where (t->>'id')::int = :tb;

\echo '=== validations : tranches non croissantes, doublon, rareté inconnue ou non « à seuil », numéros en trop, non entier'
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":50},{"rarity_id":"super","max_series":50}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":50},{"rarity_id":"ultra","max_series":80}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"inconnue","max_series":50}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"unique","max_series":50}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":50,"numbered_series":51}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":"50.5"}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''mauvais'', %s, ''[]''::jsonb)', :ta));
select count(*) as tranches_du_type_a_inchangees from public.{{P}}type_rarities where type_id = :ta;

\echo '=== le type secret est caché dans la vitrine tant qu''on n''en possède aucune carte'
select string_agg(type_name, ', ' order by type_id) as vitrine_sans_le_secret from public.{{P}}album_view(:cat);
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:tb, 50, 7, :A);
select string_agg(type_name, ', ' order by type_id) as vitrine_avec_le_secret from public.{{P}}album_view(:cat);
delete from public.{{P}}cards where type_id = :tb;

\echo '=== tirage doré par rareté : chaque tirage est indépendant et respecte les tranches de chaque type'
-- (une fonction appelée dans un FROM avec des arguments constants n'est évaluée qu'une fois : le tirage est donc dans la liste de sélection)
create temp table dr_legende as select (d).o_type as t, (d).o_series as s from (select public.{{P}}draw_rarity('legende', :cat) as d from generate_series(1, 400) offset 0) q;
select count(*) filter (where t is not null) as tirages,
       count(*) filter (where t = :ta) > 0 as type_a_tire, count(*) filter (where t = :tb) > 0 as type_b_tire, count(*) filter (where t = :tc) > 0 as type_c_tire,
       count(*) filter (where (t = :ta and s > 20) or (t = :tc and s > 20) or (t = :tb and s > 100) or s < 2) as hors_tranche,
       count(distinct s) > 10 as series_variees
from dr_legende;
create temp table dr_ultra as select (d).o_type as t, (d).o_series as s from (select public.{{P}}draw_rarity('ultra', :cat) as d from generate_series(1, 300) offset 0) q;
select count(*) filter (where t = :tb) as ultra_du_type_b_sans_ultra_rare,
       count(*) filter (where t = :ta and s between 21 and 100) > 0 as ultra_type_a_dans_sa_tranche,
       count(*) filter (where t = :ta and (s < 21 or s > 100)) as ultra_type_a_hors_tranche,
       count(*) filter (where t = :tc and (s < 21 or s > 35)) as ultra_type_c_hors_seuils_categorie
from dr_ultra;

\echo '=== vrais boosters : chaque type a son propre nombre de séries (A 30, B 100, C 60) et ses propres raretés'
select (public.{{P}}admin_save_type_rarities('thomarie', :ta, '[{"rarity_id":"common","max_series":30,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as a_30_series;
update public.{{P}}types set series_count = 60 where id = :tc;   -- C : 60 séries, sans raretés propres (seuils de la catégorie)
-- Régression évitée : « le reste » (Commune) reste la dernière tranche même si le type a moins de séries que les autres seuils
select public.{{P}}type_range_rarity(50, :tc) as c_serie_50_super_comme_avant, public.{{P}}type_range_rarity(60, :tc) as c_serie_60_super_comme_avant,
       (select string_agg(rarity_id || ' ' || lo || '-' || hi, ', ' order by lo) from public.{{P}}type_bands(:tc)) as bandes_de_c_a_60_series;
update public.{{P}}categories set enabled = false where id <> :cat;
update public.{{P}}profiles set boosters = 60, bonus_boosters = 0 where id = :A;
update public.{{P}}config set value = 100 where key = 'max_boosters';
delete from public.{{P}}cards where type_id in (:ta, :tb, :tc);
select count(public.{{P}}open_booster()) as boosters_ouverts from generate_series(1, 40);
select count(*) as cartes_tirees,
       count(*) filter (where type_id = :ta) > 0 as type_a_tire, count(*) filter (where type_id = :tb) > 0 as type_b_tire, count(*) filter (where type_id = :tc) > 0 as type_c_tire,
       count(*) filter (where (type_id = :ta and series > 30) or (type_id = :tb and series > 100) or (type_id = :tc and series > 60)) as hors_de_leurs_series,
       count(*) filter (where type_id = :tb and public.{{P}}rarity_id(number, series, type_id) not in ('legende', 'unique', 'alpha', 'omega')) as type_b_hors_raretes_autorisees,
       count(*) filter (where type_id = :ta and public.{{P}}rarity_id(number, series, type_id) not in ('common', 'unique', 'alpha', 'omega')) as type_a_hors_raretes_autorisees
from public.{{P}}cards c where type_id in (:ta, :tb, :tc);
update public.{{P}}categories set enabled = true where id <> :cat;
delete from public.{{P}}cards where type_id in (:ta, :tb, :tc);
update public.{{P}}types set series_count = null where id = :tc;

\echo '=== chances de tirage : les parts se somment à 100 % ; retour aux seuils de la catégorie (tableau vide)'
select round(sum((r->>'share')::numeric), 6) as somme_des_parts from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r;
select (public.{{P}}admin_save_type_rarities('thomarie', :ta, '[]'::jsonb) ->> 'ok')::bool as type_a_revenu_a_la_categorie;
select public.{{P}}type_series_count(:ta) as series_a_apres, (select series_count from public.{{P}}types where id = :ta) is null as colonne_remise_a_null,
       public.{{P}}number_visible(15, :ta) as visible_apres;

\echo '=== séries déjà tirées : impossible de réduire le nombre de séries sous une carte existante'
select (public.{{P}}admin_save_type_rarities('thomarie', :ta, '[{"rarity_id":"legende","max_series":100,"numbered_series":5}]'::jsonb) ->> 'ok')::bool as type_a_reduit_a_100;
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:ta, 300, 5, :A);
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"legende","max_series":100}]''::jsonb)', :ta));
delete from public.{{P}}cards where type_id = :ta;

\echo '=== admin_data expose raretés par type, nombre de séries et secret ; suppression d''une rareté utilisée refusée'
select (public.{{P}}admin_data('thomarie')->'types') @> jsonb_build_array(jsonb_build_object('id', :tb, 'secret', true, 'series_count', 100)) as types_exposent_secret_et_series;
select jsonb_array_length(public.{{P}}admin_data('thomarie')->'type_rarities') >= 2 as raretes_par_type_exposees;
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''legende'')');   -- utilisée par les types A et B : refusée
-- Nettoyage direct (les cartes d'autres tests sont classées « Légende » par les seuils de leur catégorie : la fonction admin refuserait)
delete from public.{{P}}rarities where id in ('legende', 'peu_commune');
select count(*) as tranches_restantes_apres_nettoyage from public.{{P}}type_rarities where rarity_id in ('legende', 'peu_commune');

delete from public.{{P}}categories where id = :cat;
