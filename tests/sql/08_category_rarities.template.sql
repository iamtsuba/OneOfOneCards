\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name in ('Test Seuils A', 'Test Seuils B');
set request.jwt.claim.sub = :A;

\echo '=== catégorie A : seuils personnalisés (série de 100 : ultra<=5, super<=20, rare<=50, le reste commune)'
select (public.{{P}}admin_save_category(
  'thomarie', null, 'Test Seuils A', 90, 100, '#ffffff', '#000000', '#000000', true,
  '[{"rarity_id":"ultra","max_series":5},{"rarity_id":"super","max_series":20},{"rarity_id":"rare","max_series":50},{"rarity_id":"common","max_series":null}]'::jsonb
) ->> 'id')::int as cat_a \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat_a, 'Objet A', '🧪', 1) ->> 'id')::int as type_a \gset

\echo '=== catégorie B : même taille de série (100), aucun seuil fourni -> repli sur les seuils globaux (ultra<=35)'
select (public.{{P}}admin_save_category(
  'thomarie', null, 'Test Seuils B', 91, 100, '#ffffff', '#000000', '#000000', true
) ->> 'id')::int as cat_b \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat_b, 'Objet B', '🧪', 1) ->> 'id')::int as type_b \gset
select count(*) as aucune_ligne_pour_b from public.{{P}}category_rarities where category_id = :cat_b;

\echo '=== la même taille de série (15) est classée différemment selon la catégorie'
select public.{{P}}rarity_id(2, 15, :type_a) as a_attendu_super, public.{{P}}rarity_id(2, 15, :type_b) as b_attendu_ultra;
select public.{{P}}rarity_id(2, 3, :type_a) as a_serie_3_ultra, public.{{P}}rarity_id(2, 40, :type_a) as a_serie_40_rare, public.{{P}}rarity_id(2, 80, :type_a) as a_serie_80_commune;
-- Unique / Alpha / Omega restent universels, inchangés par les seuils de la catégorie
select public.{{P}}rarity_id(1, 1, :type_a) as unique_1_1, public.{{P}}rarity_id(1, 40, :type_a) as alpha_1_40, public.{{P}}rarity_id(40, 40, :type_a) as omega_40_40;

\echo '=== admin_data expose les seuils de la catégorie A'
select e from jsonb_array_elements(public.{{P}}admin_data('thomarie')->'category_rarities') e
where (e->>'category_id')::int = :cat_a order by e->>'rarity_id';

\echo '=== seuils invalides refusés : décroissants, hors limite de la série, deux plafonds ouverts'
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_a || ', ''Test Seuils A'', 90, 100, ''#ffffff'', ''#000000'', ''#000000'', true, ''[{"rarity_id":"ultra","max_series":20},{"rarity_id":"super","max_series":10},{"rarity_id":"rare","max_series":50},{"rarity_id":"common","max_series":null}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_a || ', ''Test Seuils A'', 90, 100, ''#ffffff'', ''#000000'', ''#000000'', true, ''[{"rarity_id":"ultra","max_series":5},{"rarity_id":"super","max_series":20},{"rarity_id":"rare","max_series":150},{"rarity_id":"common","max_series":null}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_a || ', ''Test Seuils A'', 90, 100, ''#ffffff'', ''#000000'', ''#000000'', true, ''[{"rarity_id":"ultra","max_series":5},{"rarity_id":"super","max_series":null},{"rarity_id":"rare","max_series":50},{"rarity_id":"common","max_series":null}]''::jsonb)');

\echo '=== seuils inchangés après un renommage sans p_rarities (simple édition de nom/couleur)'
select public.{{P}}admin_save_category('thomarie', :cat_a, 'Test Seuils A (renommée)', 90, 100, '#ffffff', '#000000', '#000000', true) ->> 'ok' as renomme;
select public.{{P}}rarity_id(2, 3, :type_a) as toujours_ultra_apres_renommage;

delete from public.{{P}}types where id in (:type_a, :type_b);
delete from public.{{P}}categories where id in (:cat_a, :cat_b);
