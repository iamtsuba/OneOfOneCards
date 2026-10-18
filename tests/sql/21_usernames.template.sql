-- Pseudo unique (casse ignorée) et définitif ; disponibilité à l'inscription ; dédoublonnage des pseudos existants ; statistique « cartes complétées ».
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'aucune erreur'; exception when others then return sqlstate; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
delete from auth.users where id::text like '44444444-%';

\echo '--- unicité : un index sur le pseudo en minuscules ; un doublon est refusé quelle que soit la casse'
select pg_temp.expect('index unique sur lower(pseudo) présent', (select count(*) from pg_indexes where indexname = '{{P}}profiles_username_uq' and indexdef ilike '%unique%' and indexdef ilike '%lower%') = 1);
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-0000-0000-0000-000000000001', 'x1@test.fr', '{}'::jsonb);
select username as pseudo_a from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('inserer le pseudo d''un autre joueur, en majuscules, est refusé (code 23505)', pg_temp.err($q$insert into public.{{P}}profiles (id, username) values ('44444444-0000-0000-0000-000000000001', upper('$q$ || :'pseudo_a' || $q$'))$q$) = '23505');

\echo '--- création du profil : le pseudo choisi, sinon _2, _3… (jamais d''erreur pour le joueur)'
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-0000-0000-0000-000000000011', 'a@test.fr', '{"username": "Tomy"}'::jsonb),
  ('44444444-0000-0000-0000-000000000012', 'b@test.fr', '{"username": "tomy"}'::jsonb),
  ('44444444-0000-0000-0000-000000000013', 'c@test.fr', '{"username": "  TOMY  "}'::jsonb),
  ('44444444-0000-0000-0000-000000000014', 'abcdefghijklmnopqrstuvwxyz@test.fr', '{}'::jsonb),
  ('44444444-0000-0000-0000-000000000015', 'abcdefghijklmnopqrstuvwx@autre.fr', '{"username": "abcdefghijklmnopqrstuvwxyz0123"}'::jsonb),
  ('44444444-0000-0000-0000-000000000016', '@sansnom.fr', '{}'::jsonb),
  ('44444444-0000-0000-0000-000000000017', '@autre.fr', '{"username": "   "}'::jsonb);
select public.{{P}}ensure_profile(('44444444-0000-0000-0000-0000000000' || n)::uuid) from (values ('11'), ('12'), ('13'), ('14'), ('15'), ('16'), ('17')) v(n);
select pg_temp.expect('1er « Tomy » garde son pseudo, « tomy » devient tomy_2, « TOMY » (espaces retirés) devient TOMY_3',
  (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000011') = 'Tomy'
  and (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000012') = 'tomy_2'
  and (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000013') = 'TOMY_3');
select pg_temp.expect('sans pseudo choisi : le début de l''email, tronqué à 24 caractères',
  (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000014') = 'abcdefghijklmnopqrstuvwx');
select pg_temp.expect('pseudo pris et déjà de 24 caractères : le suffixe tient dans les 24 caractères (22 + _2)',
  (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000015') = 'abcdefghijklmnopqrstuvwx'
  or (select char_length(username) <= 24 and username like 'abcdefghijklmnopqrstuv%\_2' from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000015'));
select pg_temp.expect('email sans début et pseudo vide : « joueur », puis « joueur_2 » pour le suivant',
  (select string_agg(username, ',' order by username) from public.{{P}}profiles where id in ('44444444-0000-0000-0000-000000000016', '44444444-0000-0000-0000-000000000017')) = 'joueur,joueur_2');
select pg_temp.expect('tous les pseudos de 24 caractères au plus, tous différents (casse ignorée)', (select max(char_length(username)) from public.{{P}}profiles) <= 24
  and (select count(*) = count(distinct lower(username)) from public.{{P}}profiles));
select count(*) as profils_avant from public.{{P}}profiles \gset
select public.{{P}}ensure_profile('44444444-0000-0000-0000-000000000011');
select public.{{P}}ensure_profile('44444444-0000-0000-0000-0000000000ff');
select pg_temp.expect('relancer pour un profil existant ou un utilisateur inconnu ne change rien et ne lève rien', (select count(*) from public.{{P}}profiles) = :profils_avant and (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000011') = 'Tomy');

\echo '--- disponibilité d''un pseudo (appelable avant la connexion)'
select pg_temp.expect('pseudo libre : disponible', public.{{P}}username_available('Pseudo_Tout_Neuf'));
select pg_temp.expect('pseudo pris : indisponible, casse et espaces ignorés', not public.{{P}}username_available('tomy') and not public.{{P}}username_available('  TOMY  ') and not public.{{P}}username_available('tomy_2'));
select pg_temp.expect('longueur : 1 caractère, 25 caractères, vide, nul = indisponibles ; 2 et 24 caractères = disponibles',
  not public.{{P}}username_available('a') and not public.{{P}}username_available(repeat('z', 25)) and not public.{{P}}username_available('') and not public.{{P}}username_available('   ') and not public.{{P}}username_available(null)
  and public.{{P}}username_available('zz') and public.{{P}}username_available(repeat('z', 24)));
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-0000-0000-0000-000000000021', 'attente@test.fr', '{"username": "Reserve"}'::jsonb);
select pg_temp.expect('une inscription pas encore confirmée (pas de profil) réserve déjà son pseudo', not public.{{P}}username_available('reserve') and not public.{{P}}username_available('RESERVE'));
select public.{{P}}ensure_profile('44444444-0000-0000-0000-000000000021');
select pg_temp.expect('une fois le profil créé, le pseudo reste pris (une seule fois)', not public.{{P}}username_available('Reserve') and (select count(*) from public.{{P}}profiles where lower(username) = 'reserve') = 1);
select pg_temp.expect('droits : appelable sans être connecté (formulaire d''inscription)', has_function_privilege('anon', 'public.{{P}}username_available(text)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}username_available(text)', 'execute'));

\echo '--- le pseudo est définitif : plus aucune fonction pour le changer'
select pg_temp.expect('set_username n''existe plus', (select count(*) from pg_proc where proname = '{{P}}set_username') = 0);
select pg_temp.expect('un joueur ne peut pas non plus modifier son pseudo directement (table fermée)', not has_table_privilege('authenticated', 'public.{{P}}profiles', 'update') and not has_table_privilege('anon', 'public.{{P}}profiles', 'update'));

\echo '--- pseudos déjà en double dans une base existante : dédoublonnés sans en perdre un seul'
drop index if exists public.{{P}}profiles_username_uq;
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-0000-0000-0000-000000000031', 'd1@test.fr', '{}'::jsonb), ('44444444-0000-0000-0000-000000000032', 'd2@test.fr', '{}'::jsonb),
  ('44444444-0000-0000-0000-000000000033', 'd3@test.fr', '{}'::jsonb), ('44444444-0000-0000-0000-000000000034', 'd4@test.fr', '{}'::jsonb);
insert into public.{{P}}profiles (id, username, created_at) values
  ('44444444-0000-0000-0000-000000000031', 'Dup', now() - interval '3 days'), ('44444444-0000-0000-0000-000000000032', 'dup', now() - interval '2 days'),
  ('44444444-0000-0000-0000-000000000033', 'DUP', now() - interval '1 day'), ('44444444-0000-0000-0000-000000000034', 'Dup_2', now());
select public.{{P}}dedupe_usernames() as renommes \gset
select pg_temp.expect('2 profils renommés (le plus ancien garde « Dup », « Dup_2 » existait déjà et reste)', :renommes = 2
  and (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000031') = 'Dup'
  and (select username from public.{{P}}profiles where id = '44444444-0000-0000-0000-000000000034') = 'Dup_2');
select pg_temp.expect('les deux autres reçoivent un suffixe libre (dup_3, DUP_4), tous les pseudos sont différents',
  (select string_agg(username, ',' order by created_at) from public.{{P}}profiles where id in ('44444444-0000-0000-0000-000000000032', '44444444-0000-0000-0000-000000000033')) = 'dup_3,DUP_4'
  and (select count(*) = count(distinct lower(username)) from public.{{P}}profiles));
select public.{{P}}dedupe_usernames() as renommes2 \gset
select pg_temp.expect('un second passage ne change plus rien', :renommes2 = 0);
create unique index if not exists {{P}}profiles_username_uq on public.{{P}}profiles (lower(username));
select pg_temp.expect('l''index unique se recrée sans erreur après le dédoublonnage', (select count(*) from pg_indexes where indexname = '{{P}}profiles_username_uq') = 1);

\echo '--- statistique « cartes complétées » du profil (remplace « séries commencées » à l''écran)'
delete from public.{{P}}gold_rewards where user_id = :A;
select pg_temp.expect('aucune carte complétée : 0 ; la clé existe', (public.{{P}}my_stats() -> 'types_completed')::int = 0 and public.{{P}}my_stats() ? 'series_started');
insert into public.{{P}}gold_rewards (user_id, type_id) select :A, id from public.{{P}}types order by id limit 2;
select pg_temp.expect('2 boosters Gold gagnés = 2 cartes complétées (ouverts ou non)', (public.{{P}}my_stats() -> 'types_completed')::int = 2);
update public.{{P}}gold_rewards set opened_at = now() where user_id = :A;
select pg_temp.expect('ouvrir les boosters Gold ne retire pas les cartes complétées', (public.{{P}}my_stats() -> 'types_completed')::int = 2);
delete from public.{{P}}gold_rewards where user_id = :A;

-- nettoyage
delete from public.{{P}}profiles where id::text like '44444444-%';
delete from auth.users where id::text like '44444444-%';
