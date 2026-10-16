-- Copie d'une catégorie de la PRÉPRODUCTION vers la PRODUCTION (test réservé à la préproduction : la fonction n'existe pas en production).
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
-- nettoyage de départ et mots de passe des deux environnements
delete from public.{{P}}admin_log; delete from public.o1ocards_admin_log;
delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
delete from public.o1ocards_secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
select public.o1ocards_admin_set_password('prodpass1');
delete from public.{{P}}categories where name in ('Copie Test', 'Copie Atomique');
delete from public.o1ocards_categories where lower(name) in ('copie test', 'copie atomique');
-- état de départ déterministe : la production n'a ni « legende » ni « platine » ; la préproduction a « legende » (créée comme dans la vraie vie)
delete from public.o1ocards_rarities where id in ('legende', 'platine');
delete from public.{{P}}rarities where id = 'platine';
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('legende', 'Légende', 'range', 20, 0, '#f5c542', '#b8860b', '#3d2a00') on conflict (id) do nothing;
set request.jwt.claim.sub = :A;

\echo '--- une catégorie de préproduction : 3 types, des raretés, une image de booster, un type secret'
select (public.{{P}}admin_save_category('thomarie', null, 'Copie Test', 90, 400, '#c9f0c0', '#5bbf4b', '#0c3a05', true, '🎞️') ->> 'id')::int as cat \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Alpha Copie', '🐱', 1) ->> 'id')::int as t1 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Beta Copie', 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 2) ->> 'id')::int as t2 \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat, 'Gamma Copie', '🐶', 3) ->> 'id')::int as t3 \gset
select public.{{P}}admin_save_type_rarities('thomarie', :t1, '[{"rarity_id":"ultra","max_series":50,"numbered_series":5,"card_style":"fullart"},{"rarity_id":"common","max_series":200,"numbered_series":0}]'::jsonb) ->> 'ok' as r1;
select public.{{P}}admin_save_type_rarities('thomarie', :t2, '[{"rarity_id":"legende","max_series":20,"numbered_series":20,"card_style":"fullart"}]'::jsonb, true) ->> 'ok' as r2_secret;
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('platine', 'Platine', 'range', 10, 5, '#e5e4e2', '#9a9a9a', '#222222');
select public.{{P}}admin_save_type_rarities('thomarie', :t3, '[{"rarity_id":"platine","max_series":10,"numbered_series":10,"card_style":"fullart"}]'::jsonb) ->> 'ok' as r3_rarete_absente_en_prod;
select count(*) as nb_cat_prod_avant from public.o1ocards_categories \gset
select count(*) as nb_types_prod_avant from public.o1ocards_types \gset
select md5(coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_cards x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_profiles x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_listings x), '')) as joueurs_prod_avant \gset

\echo '--- refus : mot de passe de préproduction faux, de production faux, pas connecté, catégorie inconnue'
select public.{{P}}admin_copy_category_to_prod('mauvais', :cat, 'prodpass1', true) ->> 'error' as mdp_preprod_faux;               -- admin_denied
select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'mauvais', true) ->> 'error' as mdp_prod_faux;                  -- prod_admin_denied
select count(*) as echec_journalise_en_prod from public.o1ocards_admin_log where not ok;                                         -- 1 : la garde de la production a vu l'essai
select public.{{P}}admin_copy_category_to_prod('thomarie', 999999, 'prodpass1', true) ->> 'error' as categorie_inconnue;        -- not_found
set request.jwt.claim.sub = '';
select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'prodpass1', true) ->> 'error' as pas_connecte;                -- not_authenticated
set request.jwt.claim.sub = :A;
select (select count(*) from public.o1ocards_categories) = :nb_cat_prod_avant as rien_cree_apres_les_refus;                      -- t

\echo '--- raretés absentes en production : refus avec la liste, rien n''est créé'
select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'prodpass1') ->> 'error' as raretes_manquantes;                -- prod_missing_rarities:legende,platine
select (select count(*) from public.o1ocards_categories) = :nb_cat_prod_avant as aucune_categorie_creee, (select count(*) from public.o1ocards_rarities where id in ('legende', 'platine')) as raretes_creees_en_prod;   -- t / 0

\echo '--- copie réussie (avec création de la rareté manquante)'
with r as (select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'prodpass1', true) as j)
select j ->> 'ok' as ok, j ->> 'types' as types, j ->> 'rarities' as reglages, j ->> 'created_rarities' as raretes_creees, j ->> 'enabled' as activee from r;   -- true / 3 / 4 / ["legende", "platine"] / false
select name, position = (select max(position) from public.o1ocards_categories) as en_derniere_position, series_count, color, color2, text_color, image, enabled, closed
from public.o1ocards_categories where name = 'Copie Test';                                                                     -- désactivée, fermée false, copie fidèle
select (select count(*) from public.o1ocards_categories) = :nb_cat_prod_avant + 1 as une_categorie_de_plus, (select count(*) from public.o1ocards_types) = :nb_types_prod_avant + 3 as trois_types_de_plus;
-- fidélité : types (nom, image, position, secret, séries) et raretés (séries, numérotées, style) identiques dans les deux sens
select count(*) as types_differents from (
  (select name, image, position, secret, series_count from public.{{P}}types where category_id = :cat
   except select t.name, t.image, t.position, t.secret, t.series_count from public.o1ocards_types t join public.o1ocards_categories c on c.id = t.category_id where c.name = 'Copie Test')
  union all
  (select t.name, t.image, t.position, t.secret, t.series_count from public.o1ocards_types t join public.o1ocards_categories c on c.id = t.category_id where c.name = 'Copie Test'
   except select name, image, position, secret, series_count from public.{{P}}types where category_id = :cat)) x;             -- 0
select count(*) as reglages_differents from (
  (select ty.name, tr.rarity_id, tr.max_series, tr.numbered_series, tr.card_style from public.{{P}}type_rarities tr join public.{{P}}types ty on ty.id = tr.type_id where ty.category_id = :cat
   except select ty.name, tr.rarity_id, tr.max_series, tr.numbered_series, tr.card_style from public.o1ocards_type_rarities tr join public.o1ocards_types ty on ty.id = tr.type_id join public.o1ocards_categories c on c.id = ty.category_id where c.name = 'Copie Test')
  union all
  (select ty.name, tr.rarity_id, tr.max_series, tr.numbered_series, tr.card_style from public.o1ocards_type_rarities tr join public.o1ocards_types ty on ty.id = tr.type_id join public.o1ocards_categories c on c.id = ty.category_id where c.name = 'Copie Test'
   except select ty.name, tr.rarity_id, tr.max_series, tr.numbered_series, tr.card_style from public.{{P}}type_rarities tr join public.{{P}}types ty on ty.id = tr.type_id where ty.category_id = :cat)) x;   -- 0
select count(*) as reglages_en_prod, count(*) filter (where card_style = 'fullart') as fullart_en_prod from public.o1ocards_type_rarities tr join public.o1ocards_types ty on ty.id = tr.type_id join public.o1ocards_categories c on c.id = ty.category_id where c.name = 'Copie Test';   -- 4 / 3
select (select secret from public.o1ocards_types ty join public.o1ocards_categories c on c.id = ty.category_id where c.name = 'Copie Test' and ty.name = 'Beta Copie') as type_secret_copie,
       (select left(ty.image, 11) from public.o1ocards_types ty join public.o1ocards_categories c on c.id = ty.category_id where c.name = 'Copie Test' and ty.name = 'Beta Copie') as image_integree_copiee;   -- t / data:image/
select count(*) as raretes_copiees_a_l_identique from (select id, name, kind, max_series, sort_order, color, color2, text_color from public.o1ocards_rarities where id in ('legende', 'platine')
   intersect select id, name, kind, max_series, sort_order, color, color2, text_color from public.{{P}}rarities where id in ('legende', 'platine')) x;   -- 2
select md5(coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_cards x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_profiles x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from public.o1ocards_listings x), '')) = :'joueurs_prod_avant' as cartes_profils_annonces_prod_intacts;   -- t

\echo '--- jamais de doublon : la catégorie existe déjà en production (casse ignorée)'
select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'prodpass1', true) ->> 'error' as deja_en_prod;                  -- prod_category_exists
update public.{{P}}categories set name = 'COPIE TEST' where id = :cat;
select public.{{P}}admin_copy_category_to_prod('thomarie', :cat, 'prodpass1', true) ->> 'error' as deja_en_prod_casse_differente; -- prod_category_exists
update public.{{P}}categories set name = 'Copie Test' where id = :cat;
select (select count(*) from public.o1ocards_categories) = :nb_cat_prod_avant + 1 as toujours_une_seule_copie;

\echo '--- tout ou rien : un type refusé en production annule toute la copie (catégorie et types déjà créés compris)'
select (public.{{P}}admin_save_category('thomarie', null, 'Copie Atomique', 91, 300, '#fecaca', '#dc2626', '#450a0a', true) ->> 'id')::int as cat2 \gset
select public.{{P}}admin_save_type('thomarie', null, :cat2, 'Premier', '🐱', 1) ->> 'ok' as premier;
select public.{{P}}admin_save_type('thomarie', null, :cat2, 'Piège', '🐱', 2) ->> 'ok' as piege;
create function public.o1o_test_boom() returns trigger language plpgsql as $$ begin raise exception 'type_refuse_en_production'; end $$;
create trigger o1o_test_boom before insert on public.o1ocards_types for each row when (new.name = 'Piège') execute function public.o1o_test_boom();
select pg_temp.try('select public.{{P}}admin_copy_category_to_prod(''thomarie'', ' || :cat2 || ', ''prodpass1'', true)');       -- exception attrapée
drop trigger o1o_test_boom on public.o1ocards_types; drop function public.o1o_test_boom();
select (select count(*) from public.o1ocards_categories where name = 'Copie Atomique') as categorie_atomique_en_prod,
       (select count(*) from public.o1ocards_types where name in ('Premier', 'Piège')) as types_atomiques_en_prod;                 -- 0 / 0

\echo '--- droits : réservé à un administrateur connecté, et la fonction n''existe que dans le schéma de préproduction'
select has_function_privilege('authenticated', 'public.{{P}}admin_copy_category_to_prod(text, int, text, boolean)', 'execute') as joueur_connecte_peut_appeler,
       has_function_privilege('anon', 'public.{{P}}admin_copy_category_to_prod(text, int, text, boolean)', 'execute') as anonyme_peut_appeler;   -- t (le mot de passe protège) / f
select (select count(*) from pg_proc where proname = '{{P}}admin_copy_category_to_prod') as fonctions_preprod,
       (select count(*) from pg_proc where proname = 'o1ocards_admin_copy_category_to_prod') as fonctions_prod;                      -- 1 / 0

-- nettoyage : on laisse la base comme on l'a trouvée
delete from public.o1ocards_categories where name in ('Copie Test', 'Copie Atomique');
delete from public.o1ocards_rarities where id in ('legende', 'platine');
delete from public.{{P}}categories where name in ('Copie Test', 'Copie Atomique');
delete from public.{{P}}rarities where id = 'platine';
select (select count(*) from public.o1ocards_categories) = :nb_cat_prod_avant as prod_nettoyee, (select count(*) from public.o1ocards_types) = :nb_types_prod_avant as types_prod_nettoyes;
