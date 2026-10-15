\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name = 'Test Alpha';
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'rarity_exponent');
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

-- Catégorie de test : T1 (Ultra Rare 1..20 dont les 3 premières séries numérotées, Commune 21..60 jamais numérotée),
-- T2 (tout numéroté, réglage par défaut), T3 (rien de numéroté), T4 (2 séries, numéros masqués), T5 (2 séries, numéros visibles)
select (public.{{P}}admin_save_category('thomarie', null, 'Test Alpha', 96, 60, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'T1', '1', 1) ->> 'id')::int as t1 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'T2', '2', 2) ->> 'id')::int as t2 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'T3', '3', 3) ->> 'id')::int as t3 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'T4', '4', 4) ->> 'id')::int as t4 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'T5', '5', 5) ->> 'id')::int as t5 \gset
select (public.{{P}}admin_save_type_rarities('thomarie', :t1, '[{"rarity_id":"ultra","max_series":20,"numbered_series":3},{"rarity_id":"common","max_series":60,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as t1_regle;
select (public.{{P}}admin_save_type_rarities('thomarie', :t3, '[{"rarity_id":"common","max_series":30,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as t3_regle;
select (public.{{P}}admin_save_type_rarities('thomarie', :t4, '[{"rarity_id":"common","max_series":2,"numbered_series":0}]'::jsonb) ->> 'ok')::bool as t4_regle;
select (public.{{P}}admin_save_type_rarities('thomarie', :t5, '[{"rarity_id":"common","max_series":2,"numbered_series":2}]'::jsonb) ->> 'ok')::bool as t5_regle;

\echo '=== rareté d''une carte : Alpha (1/m) et Omega (m/m) seulement si le numéro de la série est visible'
select rarity_id, count(*) as nb from (
  select public.{{P}}rarity_id(n, m, :t1) as rarity_id
  from (values (1,1), (1,2), (2,2), (1,3), (3,3), (2,3), (1,4), (4,4), (1,15), (15,15), (1,30), (30,30), (7,30)) v(n, m)
) x group by rarity_id order by rarity_id;
select 'T1 série 3 (visible)  : 1/3 ' || public.{{P}}rarity_id(1, 3, :t1) || ', 3/3 ' || public.{{P}}rarity_id(3, 3, :t1) || ', 2/3 ' || public.{{P}}rarity_id(2, 3, :t1) as visible,
       'T1 série 4 (masquée)  : 1/4 ' || public.{{P}}rarity_id(1, 4, :t1) || ', 4/4 ' || public.{{P}}rarity_id(4, 4, :t1) as masquee,
       'T1 série 30 (commune) : 1/30 ' || public.{{P}}rarity_id(1, 30, :t1) || ', 30/30 ' || public.{{P}}rarity_id(30, 30, :t1) as commune;
select public.{{P}}rarity_id(1, 1, :t3) as unique_reste_universel_meme_masque, public.{{P}}rarity_id(1, 10, :t2) as t2_alpha, public.{{P}}rarity_id(10, 10, :t2) as t2_omega;
select count(*) as ecarts_avec_number_visible from generate_series(2, 60) m
where (public.{{P}}rarity_id(1, m, :t1) = 'alpha') is distinct from public.{{P}}number_visible(m, :t1)
   or (public.{{P}}rarity_id(m, m, :t1) = 'omega') is distinct from public.{{P}}number_visible(m, :t1);

\echo '=== totaux : Alpha/Omega = séries à numéro visible ; la somme des raretés égale toujours le nombre de cartes'
select public.{{P}}category_total(:cat) as cartes_de_la_categorie;
create temp table att as select (r->>'id') as id, (r->>'total')::bigint as total from jsonb_array_elements(public.{{P}}my_stats(:cat)->'by_rarity') r;
select (select total from att where id = 'alpha') as alpha_total,
       (select count(*) from public.{{P}}types t cross join generate_series(2, public.{{P}}type_series_count(t.id)) m where t.category_id = :cat and public.{{P}}number_visible(m, t.id)) as series_visibles_attendues,
       (select total from att where id = 'omega') as omega_total, (select total from att where id = 'unique') as unique_total;
select (select sum(total) from att) = public.{{P}}category_total(:cat) as somme_des_raretes_egale_total_stats;
select (select sum((r->>'total')::bigint) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r) = public.{{P}}category_total(:cat) as somme_des_raretes_egale_total_chances,
       (select sum((r->>'remaining')::bigint) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r) = public.{{P}}category_total(:cat) as tout_est_encore_a_tirer,
       round((select sum((r->>'share')::numeric) from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r), 6) as parts;
select (select (r->>'total')::bigint from jsonb_array_elements(public.{{P}}draw_odds(:cat)->'by_rarity') r where r->>'id' = 'alpha') = (select total from att where id = 'alpha') as totaux_chances_et_stats_concordent;

\echo '=== tirage doré : une Alpha ou une Omega ne sort QUE d''une série à numéro visible'
create temp table da as select (d).o_type as t, (d).o_series as s, (d).o_number as n from (select public.{{P}}draw_rarity('alpha', :cat) as d from generate_series(1, 400) offset 0) q;
create temp table dom as select (d).o_type as t, (d).o_series as s, (d).o_number as n from (select public.{{P}}draw_rarity('omega', :cat) as d from generate_series(1, 400) offset 0) q;
select (select count(*) from da where t is not null) as alpha_tirees, (select count(*) from da where not public.{{P}}number_visible(s, t)) as alpha_en_serie_masquee, (select count(*) from da where n <> 1) as alpha_pas_numero_1,
       (select count(*) from dom where t is not null) as omega_tirees, (select count(*) from dom where not public.{{P}}number_visible(s, t)) as omega_en_serie_masquee, (select count(*) from dom where n <> s) as omega_pas_dernier_numero,
       (select count(*) from da where t in (:t3, :t4)) as alpha_des_types_sans_numero_visible;

\echo '=== tirage doré : dans une série à numéro masqué, la 1re et la dernière carte sont des Ultra Rare comme les autres'
create temp table du as select (d).o_type as t, (d).o_series as s, (d).o_number as n from (select public.{{P}}draw_rarity('ultra', :cat) as d from generate_series(1, 800) offset 0) q where (d).o_type = :t1;
select count(*) filter (where s <= 3 and (n = 1 or n = s)) as extremites_de_series_visibles_jamais_ultra,
       count(*) filter (where s >= 4 and (n = 1 or n = s)) > 0 as extremites_de_series_masquees_parfois_ultra,
       count(*) filter (where s between 3 and 20) = count(*) as toutes_dans_la_tranche_ultra_series_3_a_20,
       count(*) filter (where s = 3 and n <> 2) as serie_3_visible_autre_que_le_milieu from du;

\echo '=== album : emplacements Alpha/Omega seulement pour les types qui ont des séries à numéro visible ; une tranche sans carte n''a pas d''emplacement'
select type_name, string_agg(rarity_id, ',' order by rarity_id) as emplacements
from public.{{P}}album_view(:cat) group by type_name, type_id order by type_id;

\echo '=== les cartes à numéro masqué des anciennes Alpha/Omega rejoignent la rareté de leur tranche dans « Mes cartes »'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:t1, 15, 1, :A), (:t1, 15, 15, :A), (:t1, 15, 7, :A), (:t1, 2, 1, :A), (:t1, 2, 2, :A);
select rarity_id, is_stack, stack_qty from public.{{P}}list_collection(:cat, :t1, null, 'series', 60, 0) order by rarity_id, is_stack;
select count(*) as ecarts_avec_rarity_id from public.{{P}}list_collection(:cat, null, null, 'series', 200, 0) t
where t.rarity_id is distinct from public.{{P}}rarity_id(t.card_number, t.card_series, t.card_type);
delete from public.{{P}}cards where type_id = :t1;
delete from public.{{P}}categories where id = :cat;
