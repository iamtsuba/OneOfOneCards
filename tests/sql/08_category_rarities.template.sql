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

\echo '=== création d''une nouvelle rareté « range » : identifiant, doublon, nom, seuil, ajout aux catégories qui ont déjà les leurs'
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''MEGA-1'', ''Méga'', 8, ''#a5b4fc'', ''#4338ca'', ''#ffffff'')');   -- identifiant invalide
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''ultra'', ''Doublon'', 8, ''#a5b4fc'', ''#4338ca'', ''#ffffff'')');  -- déjà pris
select pg_temp.try('select public.{{P}}admin_create_rarity(''thomarie'', ''mega'', ''Méga'', null, ''#a5b4fc'', ''#4338ca'', ''#ffffff'')');   -- pas de plafond ouvert autorisé
select public.{{P}}admin_create_rarity('thomarie', 'mega', 'Méga', 8, '#a5b4fc', '#4338ca', '#ffffff') ->> 'id' as mega_cree;
select kind, max_series, sort_order from public.{{P}}rarities where id = 'mega';
-- Ajoutée automatiquement aux seuils de la catégorie A (qui a déjà les siens), pas à la B (qui n'en a aucun)
select max_series from public.{{P}}category_rarities where category_id = :cat_a and rarity_id = 'mega';
select count(*) as pas_ajoutee_a_b from public.{{P}}category_rarities where category_id = :cat_b and rarity_id = 'mega';

\echo '=== suppression : protégée (Unique/Alpha/Omega), bloquée si utilisée, sinon acceptée'
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''unique'')');
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:type_a, 8, 2, :A);  -- série 8 chez A -> 'mega' (seuil 8)
select public.{{P}}rarity_id(2, 8, :type_a) as carte_classee_mega;
select pg_temp.try('select public.{{P}}admin_delete_rarity(''thomarie'', ''mega'')');  -- refusée : déjà utilisée
delete from public.{{P}}cards where type_id = :type_a and series = 8 and number = 2;
select (public.{{P}}admin_delete_rarity('thomarie', 'mega') ->> 'ok')::bool as supprimee_une_fois_libre;
select count(*) as seuils_categorie_a_retires_en_cascade from public.{{P}}category_rarities where rarity_id = 'mega';

delete from public.{{P}}types where id in (:type_a, :type_b);
delete from public.{{P}}categories where id in (:cat_a, :cat_b);
