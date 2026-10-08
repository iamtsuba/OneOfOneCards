\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
delete from public.{{P}}secrets; delete from public.{{P}}admin_log;
update public.{{P}}categories set closed = false, series_count = 500;

\echo '=== droits : anonyme (écran de connexion) et joueur connecté'
set role anon;
select 'anon lit catégories', count(*) from public.{{P}}categories;
select 'anon lit types', count(*) from public.{{P}}types;
select pg_temp.try('select count(*) from public.{{P}}secrets');
select pg_temp.try('select count(*) from public.{{P}}admin_log');
select pg_temp.try('select public.{{P}}admin_data(''x'')');
reset role;
set role authenticated; set request.jwt.claim.sub = :A;
select pg_temp.try('select count(*) from public.{{P}}secrets');
select pg_temp.try('update public.{{P}}categories set name = ''pirate''');
select pg_temp.try('insert into public.{{P}}types (category_id, name) values (1, ''pirate'')');
select pg_temp.try('select public.{{P}}admin_set_password(''pirate123'')');
select pg_temp.try('select public.{{P}}admin_guard(''x'')');
select pg_temp.try('select public.{{P}}draw_rarity(''alpha'', 1)');
reset role;
select 'catégories intactes', string_agg(name, ', ' order by position) from public.{{P}}categories;

\echo '=== console admin : mot de passe non défini'
set request.jwt.claim.sub = :A;
select public.{{P}}admin_data('thomarie') as sans_mot_de_passe;
\echo '--- définition du mot de passe (SQL Editor) ; trop court refusé ; le clair n est jamais stocké'
select pg_temp.try('select public.{{P}}admin_set_password(''court'')');
select public.{{P}}admin_set_password('thomarie');
select 'haché (bcrypt)', left(value, 4) as prefixe, value <> 'thomarie' as pas_en_clair from public.{{P}}secrets where key = 'admin_password_hash';

\echo '=== mauvais mots de passe : verrouillage après 5 erreurs'
select public.{{P}}admin_data('mauvais') ->> 'error' as essai_1;
select public.{{P}}admin_data('mauvais') ->> 'error' as essai_2;
select public.{{P}}admin_data('mauvais') ->> 'error' as essai_3;
select public.{{P}}admin_data('mauvais') ->> 'error' as essai_4;
select public.{{P}}admin_data('mauvais') ->> 'error' as essai_5;
select public.{{P}}admin_data('thomarie') ->> 'error' as bon_mdp_apres_5_erreurs;
select 'erreurs enregistrées', count(*) from public.{{P}}admin_log where not ok;
update public.{{P}}admin_log set created_at = now() - interval '20 minutes';   -- 20 minutes plus tard
select 'après 20 min : bon mot de passe -> données', (public.{{P}}admin_data('thomarie') ->> 'error') is null as ok;
select 'compte admin lié', value = :A as c_est_A from public.{{P}}secrets where key = 'admin_user_id';
select 'erreurs effacées après succès', count(*) from public.{{P}}admin_log where not ok;

\echo '=== un autre compte, même avec le bon mot de passe : refusé'
set request.jwt.claim.sub = :B;
select public.{{P}}admin_data('thomarie') ->> 'error' as autre_compte;
set request.jwt.claim.sub = :A;
delete from public.{{P}}admin_log;

\echo '=== données de la console'
select jsonb_array_length(d->'categories') cats, jsonb_array_length(d->'types') types, jsonb_array_length(d->'config') reglages, jsonb_array_length(d->'rarities') raretes, jsonb_array_length(d->'legal') legal, d->>'players' joueurs, (d->'categories'->0->>'total') total_cat1
from (select public.{{P}}admin_data('thomarie') d) x;

\echo '=== catégories'
select public.{{P}}admin_save_category('thomarie', null, 'Années 2000', 3, 300, '#c9f0c0', '#5bbf4b', '#0c3a05', true) as creation \gset
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', null, '''', 3, 300, ''#c9f0c0'', ''#5bbf4b'', ''#0c3a05'', true)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', null, ''X'', 3, 300, ''vert'', ''#5bbf4b'', ''#0c3a05'', true)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', null, ''X'', 3, 0, ''#c9f0c0'', ''#5bbf4b'', ''#0c3a05'', true)');
select 'catégorie créée', id, name, series_count, position from public.{{P}}categories where name = 'Années 2000';
select public.{{P}}admin_save_category('thomarie', (select id from public.{{P}}categories where name = 'Années 2000'), 'Années 2000', 3, 250, '#c9f0c0', '#5bbf4b', '#0c3a05', true) ->> 'ok' as modif_series_sans_carte;
\echo '--- types : emoji, https, image intégrée, refus de javascript:'
select public.{{P}}admin_save_type('thomarie', null, (select id from public.{{P}}categories where name = 'Années 2000'), 'MP3 player', '🎵', 1) ->> 'id' as type_emoji \gset
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''https://exemple.fr/mp3.png'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''data:image/png;base64,iVBORw0KGgo='', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''javascript:alert(1)'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''http://pas-https.fr/a.png'', 1)');
select pg_temp.try('select public.{{P}}admin_save_type(''thomarie'', ' || :type_emoji || ', (select id from public.{{P}}categories where name = ''Années 2000''), ''MP3 player'', ''data:text/html;base64,PHNjcmlwdD4='', 1)');
select 'image enregistrée', left(image, 30) from public.{{P}}types where id = :type_emoji;

\echo '--- suppression : refusée si des cartes existent'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 10, 4, :A);
select pg_temp.try('select public.{{P}}admin_delete_type(''thomarie'', 1)');
select pg_temp.try('select public.{{P}}admin_delete_category(''thomarie'', 1)');
select pg_temp.try('select public.{{P}}admin_save_category(''thomarie'', 1, ''Années 80'', 1, 100, ''#ffc88a'', ''#f29a45'', ''#3d1f00'', true)');
select 'suppression type/catégorie sans carte', (public.{{P}}admin_delete_type('thomarie', :type_emoji) ->> 'ok')::bool as type_ok,
  (public.{{P}}admin_delete_category('thomarie', (select id from public.{{P}}categories where name = 'Années 2000')) ->> 'ok')::bool as cat_ok;
delete from public.{{P}}cards where type_id = 1 and series = 10 and number = 4;

\echo '--- clôture manuelle, réglages, raretés, infos légales'
select (public.{{P}}admin_set_category_closed('thomarie', 1, true) ->> 'ok') as ferme;
select 'catégorie active après clôture manuelle de la 1', public.{{P}}status()->>'active_category_id';
select (public.{{P}}admin_set_category_closed('thomarie', 1, false) ->> 'ok') as rouvre;
select public.{{P}}admin_set_config('thomarie', 'regen_amount', 5) ->> 'ok' as config_ok, (select value from public.{{P}}config where key='regen_amount') as valeur;
select pg_temp.try('select public.{{P}}admin_set_config(''thomarie'', ''inconnue'', 5)');
select public.{{P}}admin_set_config('thomarie', 'regen_amount', 10) ->> 'ok' as remis;
select public.{{P}}admin_save_rarity('thomarie', 'rare', 'Rare+', 300, '#10b981', '#065f46', '#ffffff') ->> 'ok' as rarete_ok, (select name || ' <= ' || max_series from public.{{P}}rarities where id='rare') as rare;
select public.{{P}}admin_save_rarity('thomarie', 'rare', 'Rare', 250, '#10b981', '#065f46', '#ffffff') ->> 'ok' as remise;
select public.{{P}}admin_set_legal('thomarie', 'seller_name', 'Thomas Test') ->> 'ok' as legal_ok, (select value from public.{{P}}legal where key='seller_name') as v;
select public.{{P}}admin_set_legal('thomarie', 'seller_name', '') ->> 'ok' as remis;

\echo '--- changement de mot de passe'
select pg_temp.try('select public.{{P}}admin_change_password(''thomarie'', ''court'')');
select public.{{P}}admin_change_password('thomarie', 'nouveau-mdp-solide') ->> 'ok' as change;
select public.{{P}}admin_data('thomarie') ->> 'error' as ancien_mdp;
select (public.{{P}}admin_data('nouveau-mdp-solide') ->> 'error') is null as nouveau_mdp_ok;
