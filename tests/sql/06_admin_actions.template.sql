\set A '''11111111-1111-1111-1111-111111111111'''
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

\echo '--- changement de mot de passe'
select pg_temp.try('select public.{{P}}admin_change_password(''thomarie'', ''court'')');
select public.{{P}}admin_change_password('thomarie', 'nouveau-mdp-solide') ->> 'ok' as change;
select public.{{P}}admin_data('thomarie') ->> 'error' as ancien_mdp;
select (public.{{P}}admin_data('nouveau-mdp-solide') ->> 'error') is null as nouveau_mdp_ok;
select public.{{P}}admin_change_password('nouveau-mdp-solide', 'thomarie') ->> 'ok' as remis_thomarie;
