\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name = 'Test Topps';
delete from public.{{P}}rarities where id in ('legende', 'peu_commune');
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'golden_unique_chance');
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

\echo '=== création d''une rareté : identifiant invalide, déjà pris, seuil obligatoire'
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''LEGENDE-1'', ''Légende'', 20, ''#f5c542'', ''#b8860b'', ''#3d2a00'')');
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''ultra'', ''Doublon'', 20, ''#f5c542'', ''#b8860b'', ''#3d2a00'')');
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''legende'', ''Légende'', null, ''#f5c542'', ''#b8860b'', ''#3d2a00'')');

\echo '=== nouvelles raretés, placées dans l''ordre d''affichage (Légende avant Ultra Rare, Peu commune avant Commune)'
select (public.{{P}}admin_create_rarity('thomarie', 'legende', 'Légende', 20, '#f5c542', '#b8860b', '#3d2a00', 'ultra') ->> 'ok')::bool as legende_creee;
select (public.{{P}}admin_create_rarity('thomarie', 'peu_commune', 'Peu commune', 400, '#cbd5e1', '#64748b', '#0f172a', 'common') ->> 'ok')::bool as peu_commune_creee;
select string_agg(id, ' < ' order by sort_order) as ordre_des_raretes_a_seuil from public.{{P}}rarities where kind = 'range';

\echo '=== catégorie « Test Topps » : A (6 raretés aux séries indépendantes), B secret (Légende seule), C sans réglage propre'
select (public.{{P}}admin_save_category('thomarie', null, 'Test Topps', 97, 500, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Eau', '💧', 1) ->> 'id')::int as ta \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Iny', '🤫', 2) ->> 'id')::int as tb \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Chat Peau', '🐱', 3) ->> 'id')::int as tc \gset
-- Chaque rareté a SES séries, de 1/1 à N/N : Légende 1..20, Ultra Rare 1..100, Super Rare 1..200, ... (pas de tranches qui se suivent)
select (public.{{P}}admin_save_type_rarities('thomarie', :ta,
  '[{"rarity_id":"legende","max_series":20,"numbered_series":10},{"rarity_id":"ultra","max_series":100,"numbered_series":5},
    {"rarity_id":"super","max_series":200,"numbered_series":1},{"rarity_id":"rare","max_series":300,"numbered_series":1},
    {"rarity_id":"peu_commune","max_series":400,"numbered_series":1},{"rarity_id":"common","max_series":500,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as raretes_du_type_a;
select (public.{{P}}admin_save_type_rarities('thomarie', :tb,
  '[{"rarity_id":"legende","max_series":100,"numbered_series":10}]'::jsonb, true) ->> 'ok')::bool as type_secret_b;

\echo '--- réglage de chaque type : (rareté, séries, séries numérotées)'
select 'A' as type, string_agg(rarity_id || ' ' || smax || '/' || numbered, ', ' order by smax) as reglage from public.{{P}}type_config(:ta)
union all select 'B', string_agg(rarity_id || ' ' || smax || '/' || numbered, ', ' order by smax) from public.{{P}}type_config(:tb)
union all select 'C (défauts)', string_agg(rarity_id || ' ' || smax || '/' || (case when numbered > 100000 then 'toutes' else numbered::text end), ', ' order by smax, rarity_id) from public.{{P}}type_config(:tc);
select public.{{P}}type_series_count(:ta) as series_max_a, public.{{P}}type_series_count(:tb) as series_max_b, public.{{P}}type_series_count(:tc) as series_max_c;

\echo '--- rareté de base par défaut d''une carte (la plus rare des raretés dont les séries peuvent la contenir)'
select m, public.{{P}}default_base_rarity(:ta, m) as type_a, public.{{P}}default_base_rarity(:tb, m) as type_b, public.{{P}}default_base_rarity(:tc, m) as type_c
from unnest(array[5, 20, 21, 100, 101, 250, 350, 450, 500]) m;

\echo '--- numéros visibles PAR RARETÉ : de la série 1 à la série numérotée de CETTE rareté (Légende 1..10, Ultra 1..5, Super 1, Commune aucune)'
select m, public.{{P}}number_visible(:ta, 'legende', m) as legende, public.{{P}}number_visible(:ta, 'ultra', m) as ultra, public.{{P}}number_visible(:ta, 'super', m) as super, public.{{P}}number_visible(:ta, 'common', m) as commune
from unnest(array[1, 5, 6, 10, 11, 20]) m;
-- Unique (série 1), Alpha (1/m) et Omega (m/m, numéro visible) remplacent la rareté de base
select public.{{P}}rarity_id(1, 1, :ta, 'ultra') as unique_1_1, public.{{P}}rarity_id(1, 4, :ta, 'ultra') as alpha_ultra_1_4, public.{{P}}rarity_id(4, 4, :ta, 'ultra') as omega_ultra_4_4,
       public.{{P}}rarity_id(2, 4, :ta, 'ultra') as milieu_ultra_2_4, public.{{P}}rarity_id(1, 7, :ta, 'ultra') as ultra_masquee_1_7, public.{{P}}rarity_id(7, 7, :ta, 'ultra') as ultra_masquee_7_7;

\echo '=== totaux : la somme des raretés égale le nombre de cartes ; Alpha/Omega = séries à numéro visible'
select public.{{P}}category_total(:cat) = (
  select sum(c.smax::bigint * (c.smax + 1) / 2) from public.{{P}}types t cross join lateral public.{{P}}type_config(t.id) c where t.category_id = :cat) as total_categorie_somme_des_series;
select public.{{P}}category_total(:cat) as cartes_de_la_categorie;
create temp table att as select (r->>'id') as id, (r->>'total')::bigint as total from jsonb_array_elements(public.{{P}}my_stats(:cat)->'by_rarity') r;
select (select sum(total) from att) = public.{{P}}category_total(:cat) as somme_des_raretes_egale_total_stats;
select (select total from att where id = 'alpha') as alpha_total,
       (select sum(greatest(least(c.numbered::bigint, c.smax) - 1, 0)) from public.{{P}}types t cross join lateral public.{{P}}type_config(t.id) c where t.category_id = :cat) as alpha_attendu,
       (select total from att where id = 'unique') as unique_total,
       (select count(*) from public.{{P}}types t cross join lateral public.{{P}}type_config(t.id) c where t.category_id = :cat) as unique_attendu;
select (select sum((r->>'total')::bigint) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r) = public.{{P}}category_total(:cat) as somme_chances_egale_total,
       (select sum((r->>'remaining')::bigint) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r) = public.{{P}}category_total(:cat) as tout_est_a_tirer,
       round((select sum((r->>'share')::numeric) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r), 6) as parts;
select (t->>'total')::bigint as total_type_b from jsonb_array_elements(public.{{P}}my_stats(:cat)->'types') t where (t->>'id')::int = :tb;

\echo '=== validations : doublon, rareté inconnue ou non « à seuil », numérotées au-delà du maximum, non entier, mauvais mot de passe'
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":50},{"rarity_id":"ultra","max_series":80}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"inconnue","max_series":50}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"unique","max_series":50}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":50,"numbered_series":51}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":"50.5"}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":0}]''::jsonb)', :ta));
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''mauvais'', %s, ''[]''::jsonb)', :ta));
select count(*) as raretes_du_type_a_inchangees from public.{{P}}type_rarities where type_id = :ta;
\echo '--- 0 série : la rareté n''existe pas pour ce type (une carte peut n''exister que dans une seule rareté)'
select (public.{{P}}admin_save_type_rarities('thomarie', :tc, '[{"rarity_id":"ultra","max_series":0,"numbered_series":0},{"rarity_id":"super","max_series":40,"numbered_series":0},{"rarity_id":"common","max_series":0}]'::jsonb) ->> 'ok')::bool as zero_serie_accepte;
select string_agg(rarity_id || ' ' || smax, ', ' order by rarity_id) as type_c_une_seule_rarete, (select series_count from public.{{P}}types where id = :tc) as series_du_type from public.{{P}}type_config(:tc);
select (select count(*) from public.{{P}}type_rarities where type_id = :tc) as lignes_enregistrees;   -- 1 : les raretés à 0 ne sont pas stockées
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":0,"numbered_series":0},{"rarity_id":"super","max_series":0}]''::jsonb)', :tc));       -- tout à 0 : refusé
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":0,"numbered_series":3},{"rarity_id":"super","max_series":40}]''::jsonb)', :tc));  -- numérotées sans série : refusé
select count(*) as type_c_inchange_apres_les_refus from public.{{P}}type_config(:tc) where rarity_id = 'super' and smax = 40;
\echo '--- aucun ordre à respecter : Super Rare avec MOINS de séries que Ultra Rare est accepté (séries indépendantes)'
select (public.{{P}}admin_save_type_rarities('thomarie', :tc, '[{"rarity_id":"ultra","max_series":100,"numbered_series":3},{"rarity_id":"super","max_series":40,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as ordre_libre_accepte;
select string_agg(rarity_id || ' ' || smax, ', ' order by rarity_id) as type_c_apres from public.{{P}}type_config(:tc);
select (public.{{P}}admin_save_type_rarities('thomarie', :tc, '[]'::jsonb) ->> 'ok')::bool as type_c_revenu_aux_defauts;

\echo '=== le type secret apparaît dans l''album comme une CARTE MYSTÈRE (sans nom ni visuel) tant qu''on n''en possède aucune carte ; un emplacement par rareté de chaque type'
select coalesce(type_name, '(carte secrète)') as carte, count(*) as emplacements, bool_and(secret) as secrete, bool_and(revealed) as devoilee
from public.{{P}}album_view(:cat) group by type_name, type_id order by bool_and(secret), type_id;   -- Chat Eau 9, Chat Peau 9, puis la carte secrète en dernier : 1 ligne mystère
select type_id = :tb as est_le_secret, type_name is null as nom_cache, type_image is null as visuel_cache, rarity_id is null as aucun_emplacement_revele, secret, revealed
from public.{{P}}album_view(:cat) where secret;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:tb, 'legende', 50, 7, :A);
select coalesce(type_name, '(carte secrète)') as carte, count(*) as emplacements, bool_and(secret) as secrete, bool_and(revealed) as devoilee
from public.{{P}}album_view(:cat) group by type_name, type_id order by bool_and(secret), type_id;   -- le Chat Iny est dévoilé : Légende + Unique + Alpha + Omega = 4, toujours en dernier
delete from public.{{P}}cards where type_id = :tb;

\echo '=== tirage doré par rareté : chaque rareté a SES séries ; hors des séries numérotées, la 1re et la dernière carte sont de la rareté de base'
create temp table dl as select (d).o_type as t, (d).o_base as b, (d).o_series as s, (d).o_number as n from (select public.{{P}}draw_rarity('legende', :cat) as d from generate_series(1, 400) offset 0) q;
select count(*) filter (where t is not null) as tirages,
       count(*) filter (where b <> 'legende') as base_autre_que_legende,
       count(*) filter (where (t = :ta and s > 20) or (t = :tb and s > 100) or (t = :tc and s > 20) or s < 2) as hors_des_series_de_la_rarete,
       count(*) filter (where t = :ta) > 0 as type_a_tire, count(*) filter (where t = :tb) > 0 as type_b_tire, count(*) filter (where t = :tc) > 0 as type_c_tire,
       count(*) filter (where t = :ta and s <= 10 and (n = 1 or n = s)) as extremites_de_series_visibles_jamais_legende,
       count(*) filter (where t = :ta and s > 10 and (n = 1 or n = s)) > 0 as extremites_de_series_masquees_parfois_legende
from dl;
create temp table du as select (d).o_type as t, (d).o_base as b, (d).o_series as s from (select public.{{P}}draw_rarity('unique', :cat) as d from generate_series(1, 300) offset 0) q;
select count(*) filter (where t is not null) as uniques_tirees, count(distinct (t, b)) as couples_type_rarete_differents, count(*) filter (where s <> 1) as pas_serie_1 from du;

\echo '=== vrais boosters : chaque carte reste dans les séries de SA rareté ; le type B ne donne que de la Légende'
update public.{{P}}categories set enabled = false where id <> :cat;
update public.{{P}}profiles set boosters = 60, bonus_boosters = 0 where id = :A;
update public.{{P}}config set value = 100 where key = 'max_boosters';
delete from public.{{P}}cards where type_id in (:ta, :tb, :tc);
select count(public.{{P}}open_booster()) as boosters_ouverts from generate_series(1, 40);
select count(*) as cartes_tirees,
       count(*) filter (where type_id = :ta) > 0 as type_a_tire, count(*) filter (where type_id = :tb) > 0 as type_b_tire, count(*) filter (where type_id = :tc) > 0 as type_c_tire,
       count(*) filter (where c.series > (select smax from public.{{P}}type_config(c.type_id) k where k.rarity_id = c.base_rarity)) as hors_de_leurs_series,
       count(*) filter (where type_id = :tb and base_rarity <> 'legende') as type_b_hors_legende,
       count(distinct base_rarity) as raretes_de_base_distinctes
from public.{{P}}cards c where type_id in (:ta, :tb, :tc);
select count(*) as cartes_en_double from (select type_id, base_rarity, series, number from public.{{P}}cards where type_id in (:ta, :tb, :tc) group by 1,2,3,4 having count(*) > 1) x;
update public.{{P}}categories set enabled = true where id <> :cat;

\echo '=== séries déjà tirées : une rareté ou des séries qui contiennent des cartes ne peuvent pas disparaître'
select (public.{{P}}admin_save_type_rarities('thomarie', :ta, '[{"rarity_id":"legende","max_series":20,"numbered_series":10},{"rarity_id":"ultra","max_series":100,"numbered_series":5},{"rarity_id":"super","max_series":200,"numbered_series":1},{"rarity_id":"rare","max_series":300,"numbered_series":1},{"rarity_id":"peu_commune","max_series":400,"numbered_series":1},{"rarity_id":"common","max_series":500,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as memes_reglages_acceptes;
delete from public.{{P}}cards where type_id = :ta;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:ta, 'super', 150, 5, :A);
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"super","max_series":100}]''::jsonb)', :ta));      -- series_locked : la carte 5/150 Super Rare n'y rentrerait plus
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":300}]''::jsonb)', :ta));      -- series_locked : plus de Super Rare
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[{"rarity_id":"ultra","max_series":300},{"rarity_id":"super","max_series":0}]''::jsonb)', :ta));   -- series_locked : 0 série pour une rareté qui a des cartes
select (public.{{P}}admin_save_type_rarities('thomarie', :ta, '[{"rarity_id":"super","max_series":150},{"rarity_id":"ultra","max_series":10}]'::jsonb) ->> 'ok')::bool as super_garde_150_series_accepte;
select pg_temp.try(format('select public.{{P}}admin_save_type_rarities(''thomarie'', %s, ''[]''::jsonb)', :ta));   -- series_locked : les défauts n'ont que 100 séries de Super Rare
delete from public.{{P}}cards where type_id = :ta;

\echo '=== admin_data expose raretés par type, nombre de séries et secret ; suppression d''une rareté utilisée refusée'
select (public.{{P}}admin_data('thomarie')->'types') @> jsonb_build_array(jsonb_build_object('id', :tb, 'secret', true, 'series_count', 100)) as types_exposent_secret_et_series;
select jsonb_array_length(public.{{P}}admin_data('thomarie')->'type_rarities') >= 2 as raretes_par_type_exposees;
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''legende'')');   -- utilisée par les types : refusée
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''unique'')');    -- protégée
select (public.{{P}}admin_create_rarity('thomarie', 'mega', 'Méga', 8, '#a5b4fc', '#4338ca', '#ffffff', 'legende') ->> 'ok')::bool as mega_creee;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:tc, 'mega', 6, 3, :A);
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''mega'')');       -- une carte de cette rareté existe : refusée
delete from public.{{P}}cards where type_id = :tc;
select (public.{{P}}admin_delete_rarity('thomarie', 'mega') ->> 'ok')::bool as mega_supprimee_une_fois_libre;
-- Nettoyage direct (les cartes d'autres tests peuvent avoir ces raretés de base : la fonction admin refuserait)
delete from public.{{P}}cards where base_rarity in ('legende', 'peu_commune');
delete from public.{{P}}rarities where id in ('legende', 'peu_commune');
delete from public.{{P}}categories where id = :cat;
