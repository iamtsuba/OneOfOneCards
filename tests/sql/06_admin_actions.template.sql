\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key = 'admin_password_hash';
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}categories where name = 'Années 2000';
set request.jwt.claim.sub = :A;
select public.{{P}}admin_save_category('thomarie', null, 'Années 2000', 3, 300, '#c9f0c0', '#5bbf4b', '#0c3a05', true) ->> 'ok' as creee;
select public.{{P}}admin_save_category('thomarie', (select id from public.{{P}}categories where name = 'Années 2000'), 'Années 2000', 3, 250, '#c9f0c0', '#5bbf4b', '#0c3a05', true) ->> 'ok' as modif_series_sans_carte;
select 'série modifiable sans carte', (select series_count from public.{{P}}categories where name='Années 2000') as series;
\echo '--- types : emoji, https, image intégrée, refus de javascript:'
select public.{{P}}admin_save_type('thomarie', null, (select id from public.{{P}}categories where name = 'Années 2000'), 'MP3 player', '🎵', 1) ->> 'id' as type_emoji \gset
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''https://exemple.fr/mp3.png'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''data:image/png;base64,iVBORw0KGgo='', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''javascript:alert(1)'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''http://pas-https.fr/a.png'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''data:text/html;base64,PHNjcmlwdD4='', 1)');
select 'image enregistrée', left(image, 30) as image from public.{{P}}types where id = :type_emoji;

\echo '--- suppression : refusée si des cartes existent'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 10, 4, :A);
select pg_temp.try('select public.{{P}}admin_delete_type(''thomarie'', 1)');
select pg_temp.try('select public.{{P}}admin_delete_category(''thomarie'', 1)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', 1, ''Années 80'', 1, 100, ''#ffc88a'', ''#f29a45'', ''#3d1f00'', true)');
select 'suppression type + catégorie sans carte', (public.{{P}}admin_delete_type('thomarie', :type_emoji) ->> 'ok')::bool as type_ok,
  (public.{{P}}admin_delete_category('thomarie', (select id from public.{{P}}categories where name = 'Années 2000')) ->> 'ok')::bool as cat_ok;
select 'catégories restantes', count(*) from public.{{P}}categories;
delete from public.{{P}}cards where type_id = 1 and series = 10 and number = 4;

\echo '--- import de types en masse : emoji, https, position auto, doublons ignorés, tout ou rien'
delete from public.{{P}}categories where name = 'Test Import';
select (public.{{P}}admin_save_category('thomarie', null, 'Test Import', 96, 50, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat_imp \gset
select public.{{P}}admin_import_types('thomarie', :cat_imp,
  '[{"name":"Football","position":1,"image":"⚽"},{"name":"Tennis","position":"","image":"https://exemple.com/t.png"},{"name":"Golf"},{"name":"football","position":9,"image":"🏈"}]'::jsonb) as import_ok;
select name, position, image from public.{{P}}types where category_id = :cat_imp order by position;  -- 3 types, Golf en position 3 (auto), « football » ignoré
-- Ré-import du même fichier : plus rien de créé, tout ignoré
select public.{{P}}admin_import_types('thomarie', :cat_imp, '[{"name":"Football"},{"name":"Golf"}]'::jsonb) ->> 'skipped' as deuxieme_import_ignores;
-- Une ligne invalide annule TOUT l'import (rang renvoyé), même les lignes valides avant elle
select pg_temp.try('select public.{{P}}admin_import_types(''thomarie'', ' || :cat_imp || ', ''[{"name":"Rugby"},{"name":"Piège","image":"http://x.fr/a.png"}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_import_types(''thomarie'', ' || :cat_imp || ', ''[{"name":"Rugby"},{"name":"Piège","image":"javascript:alert(1)"}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_import_types(''thomarie'', ' || :cat_imp || ', ''[{"name":"Rugby"},{"name":""}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_import_types(''thomarie'', ' || :cat_imp || ', ''[{"name":"Rugby"},{"name":"X","position":"abc"}]''::jsonb)');
select pg_temp.try('select public.{{P}}admin_import_types(''thomarie'', ' || :cat_imp || ', ''[]''::jsonb)');
select 'rien d''importé après les refus (toujours 3 types, pas de Rugby)', count(*), count(*) filter (where name = 'Rugby') from public.{{P}}types where category_id = :cat_imp;
-- Mauvais mot de passe : refusé, rien créé
select public.{{P}}admin_import_types('mauvais', :cat_imp, '[{"name":"Judo"}]'::jsonb) ->> 'error' as erreur_mdp;
select count(*) as judo_non_cree from public.{{P}}types where category_id = :cat_imp and name = 'Judo';
delete from public.{{P}}categories where id = :cat_imp;

\echo '--- suppression forcée : catégorie entamée, avec annonces, enchère, offre, favori'
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
delete from public.{{P}}categories where name = 'Test Suppression';
set request.jwt.claim.sub = :A;
select (public.{{P}}admin_save_category('thomarie', null, 'Test Suppression', 95, 50, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat_del \gset
select (public.{{P}}admin_save_type('thomarie', null, :cat_del, 'Objet à supprimer', '🗑️', 1) ->> 'id')::int as type_del \gset
select (public.{{P}}admin_save_type_rarities('thomarie', :type_del, '[{"rarity_id":"ultra","max_series":50,"numbered_series":3}]'::jsonb) ->> 'ok')::bool as raretes_du_type_a_supprimer;
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:type_del, 5, 2, :A), (:type_del, 5, 3, :A);
select public.{{P}}list_card(:type_del, public.{{P}}default_base_rarity(:type_del, 5), 5, 2, 'auction') ->> 'listing_id' as listing_id \gset
set request.jwt.claim.sub = :B;
select (coins) as coins_b_avant_enchere from public.{{P}}profiles where id = :B \gset
select public.{{P}}place_bid(:listing_id, 10) ->> 'ends_at' is not null as a_enchere;
select coins from public.{{P}}profiles where id = :B;  -- doit avoir baissé de 10 (mise bloquée)
select public.{{P}}make_offer(:type_del, public.{{P}}default_base_rarity(:type_del, 5), 5, 3, 4) ->> 'offer_id' is not null as offre_envoyee;
select public.{{P}}toggle_favorite(:type_del, public.{{P}}default_base_rarity(:type_del, 5), 5, 4) ->> 'favorited' as favori_pose;  -- carte encore libre
set request.jwt.claim.sub = :A;

select pg_temp.try('select public.{{P}}admin_force_delete_category(''thomarie'', ' || :cat_del || ', ''mauvais nom'')');  -- refusée
select 'rien supprimé si mauvais nom', count(*) from public.{{P}}categories where id = :cat_del;

select (public.{{P}}admin_force_delete_category('thomarie', :cat_del, 'Test Suppression') ->> 'refunded_bidders')::int = 1 as un_enchérisseur_rembourse;
select 'B entièrement remboursé', coins = :coins_b_avant_enchere from public.{{P}}profiles where id = :B;
select 'catégorie supprimée', count(*) from public.{{P}}categories where id = :cat_del;
select 'types supprimés (cascade)', count(*) from public.{{P}}types where id = :type_del;
select 'cartes supprimées (cascade)', count(*) from public.{{P}}cards where type_id = :type_del;
select 'annonce supprimée', count(*) from public.{{P}}listings where id::text = :'listing_id';
select 'offre supprimée', count(*) from public.{{P}}offers where type_id = :type_del;
select 'favori supprimé (cascade)', count(*) from public.{{P}}favorites where type_id = :type_del;
select 'raretés du type supprimées (cascade)', count(*) from public.{{P}}type_rarities where type_id = :type_del;

\echo '--- 1/1 obtenue : journalisée et visible dans admin_data (email, type, date)'
delete from public.{{P}}unique_wins;
delete from public.{{P}}cards where type_id = 1 and series = 1 and number = 1;
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 1, 1, :A);
select w.*
from jsonb_to_recordset(public.{{P}}admin_data('thomarie')->'unique_wins') as w(email text, username text, type_name text, won_at timestamptz);
delete from public.{{P}}cards where type_id = 1 and series = 1 and number = 1;

\echo '--- clôture manuelle, réglages, raretés, infos légales'
select (public.{{P}}admin_set_category_closed('thomarie', 1, true) ->> 'ok') as ferme, public.{{P}}status()->>'active_category_id' as active_apres;
select (public.{{P}}admin_set_category_closed('thomarie', 1, false) ->> 'ok') as rouvre, public.{{P}}status()->>'active_category_id' as active_apres;
select public.{{P}}admin_set_config('thomarie', 'regen_amount', 5) ->> 'ok' as config_ok, (select value from public.{{P}}config where key='regen_amount') as valeur;
select pg_temp.try('select public.{{P}}admin_set_config(''thomarie'', ''inconnue'', 5)');
select public.{{P}}admin_set_config('thomarie', 'regen_amount', 10) ->> 'ok' as remis;
select public.{{P}}admin_save_rarity('thomarie', 'rare', 'Rare+', 300, '#10b981', '#065f46', '#ffffff') ->> 'ok' as rarete_ok, (select name || ' <= ' || max_series from public.{{P}}rarities where id='rare') as rare;
select public.{{P}}admin_save_rarity('thomarie', 'rare', 'Rare', 250, '#10b981', '#065f46', '#ffffff') ->> 'ok' as remise;
select public.{{P}}admin_set_legal('thomarie', 'seller_name', 'Thomas Test') ->> 'ok' as legal_ok, (select value from public.{{P}}legal where key='seller_name') as v;
select public.{{P}}admin_set_legal('thomarie', 'seller_name', '') ->> 'ok' as remis;

\echo '--- image de la catégorie (booster) : emoji, https ou image intégrée ; vide = « 1/1 » ; non envoyée = inchangée'
select (public.{{P}}admin_save_category('thomarie', null, 'Test Image', 94, 50, '#ffffff', '#000000', '#000000', true, '🎞️') ->> 'id')::int as cat_img \gset
select image as a_la_creation from public.{{P}}categories where id = :cat_img;                         -- 🎞️
select (public.{{P}}admin_save_category('thomarie', null, 'Test Sans Image', 93, 50, '#ffffff', '#000000', '#000000', true) ->> 'id')::int as cat_sans \gset
select image = '' as sans_p_image_a_la_creation_image_vide from public.{{P}}categories where id = :cat_sans;   -- t
select public.{{P}}admin_delete_category('thomarie', :cat_sans) ->> 'ok' as nettoyee_sans;
select (public.{{P}}admin_save_category('thomarie', :cat_img, 'Test Image', 94, 50, '#ffffff', '#000000', '#000000', false) ->> 'ok')::bool as enregistree_sans_p_image;
select image as inchangee_si_non_envoyee, enabled from public.{{P}}categories where id = :cat_img;      -- 🎞️, false
select (public.{{P}}admin_save_category('thomarie', :cat_img, 'Test Image', 94, 50, '#ffffff', '#000000', '#000000', true, 'https://exemple.test/booster.png') ->> 'ok')::bool as https_ok;
select image as https from public.{{P}}categories where id = :cat_img;
select (public.{{P}}admin_save_category('thomarie', :cat_img, 'Test Image', 94, 50, '#ffffff', '#000000', '#000000', true, 'data:image/png;base64,iVBORw0KGgo=') ->> 'ok')::bool as image_integree_ok;
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_img || ', ''Test Image'', 94, 50, ''#ffffff'', ''#000000'', ''#000000'', true, ''http://exemple.test/a.png'')');          -- invalid_image
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_img || ', ''Test Image'', 94, 50, ''#ffffff'', ''#000000'', ''#000000'', true, ''data:text/html;base64,AAAAAAAAAAAAAAAAAAAA'')');   -- invalid_image
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', ' || :cat_img || ', ''Test Image'', 94, 50, ''#ffffff'', ''#000000'', ''#000000'', true, repeat(''a'', 300001))');       -- image_too_large
select (select image from public.{{P}}categories where id = :cat_img) like 'data:image/png%' as inchangee_apres_les_refus;
select (select c ->> 'image' from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'categories') c where (c ->> 'id')::int = :cat_img) like 'data:image/png%' as admin_data_renvoie_l_image;
select (public.{{P}}admin_save_category('thomarie', :cat_img, 'Test Image', 94, 50, '#ffffff', '#000000', '#000000', true, '') ->> 'ok')::bool as retiree;
select image = '' as image_vide_apres_retrait from public.{{P}}categories where id = :cat_img;
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '{{P}}admin_save_category') as une_seule_fonction;   -- 1 (pas de doublon d'ancienne signature)
select public.{{P}}admin_delete_category('thomarie', :cat_img) ->> 'ok' as nettoyee;

\echo '--- changement de mot de passe'
select pg_temp.try('select public.{{P}}admin_change_password(''thomarie'', ''court'')');
select public.{{P}}admin_change_password('thomarie', 'nouveau-mdp-solide') ->> 'ok' as change;
select public.{{P}}admin_data('thomarie') ->> 'error' as ancien_mdp;
select (public.{{P}}admin_data('nouveau-mdp-solide') ->> 'error') is null as nouveau_mdp_ok;
select public.{{P}}admin_change_password('nouveau-mdp-solide', 'thomarie') ->> 'ok' as remis_thomarie;
