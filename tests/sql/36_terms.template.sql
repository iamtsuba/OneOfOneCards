-- Conditions générales d'utilisation : version en vigueur, acceptation du joueur (preuve datée par le serveur), nouvelle acceptation quand la version monte.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
create temp table cfg_backup as select * from public.{{P}}config where key = 'cgu_version';
delete from public.{{P}}terms_acceptances;
update public.{{P}}config set value = 1 where key = 'cgu_version';

\echo '--- version en vigueur et statut'
select pg_temp.expect('réglage « cgu_version » présent, à 1 au départ', (select value from cfg_backup) is not null and (select value from public.{{P}}config where key = 'cgu_version') = 1);
set request.jwt.claim.sub = :A;
select pg_temp.expect('statut : version 1 en vigueur, pas encore acceptée par le joueur', (public.{{P}}status() ->> 'cgu_version')::int = 1 and (public.{{P}}status() ->> 'cgu_accepted')::boolean = false);

\echo '--- acceptation'
select public.{{P}}accept_terms(1, 'Mozilla/5.0 (test)');
select pg_temp.expect('accepter la version 1 : le statut passe à « acceptée »', (public.{{P}}status() ->> 'cgu_accepted')::boolean = true);
select pg_temp.expect('preuve enregistrée : joueur, version, navigateur, date du serveur (maintenant)', (select (version, user_agent) from public.{{P}}terms_acceptances where user_id = :A) = (1, 'Mozilla/5.0 (test)'::text) and (select accepted_at > now() - interval '1 minute' from public.{{P}}terms_acceptances where user_id = :A));
select public.{{P}}accept_terms(1, 'Autre navigateur');
select pg_temp.expect('accepter deux fois ne crée qu''une preuve (la première est conservée)', (select count(*) from public.{{P}}terms_acceptances where user_id = :A) = 1 and (select user_agent from public.{{P}}terms_acceptances where user_id = :A) = 'Mozilla/5.0 (test)');
set request.jwt.claim.sub = :B;
select pg_temp.expect('chaque joueur a son propre statut : B n''a pas accepté', (public.{{P}}status() ->> 'cgu_accepted')::boolean = false);
select pg_temp.expect('mauvaise version ou version vide refusées (terms_outdated)', pg_temp.err('select public.{{P}}accept_terms(2)') like '%terms_outdated%' and pg_temp.err('select public.{{P}}accept_terms(0)') like '%terms_outdated%' and pg_temp.err('select public.{{P}}accept_terms(null)') like '%terms_outdated%' and (select count(*) from public.{{P}}terms_acceptances where user_id = :B) = 0);
set request.jwt.claim.sub = '';
select pg_temp.expect('aucun joueur connecté : accept_terms refusée (not_authenticated)', pg_temp.err('select public.{{P}}accept_terms(1)') like '%not_authenticated%');

\echo '--- nouvelle version : tout le monde doit accepter de nouveau'
update public.{{P}}config set value = 2 where key = 'cgu_version';
set request.jwt.claim.sub = :A;
select pg_temp.expect('version 2 en vigueur : A doit accepter de nouveau (statut « non acceptée »), l''ancienne preuve reste', (public.{{P}}status() ->> 'cgu_version')::int = 2 and (public.{{P}}status() ->> 'cgu_accepted')::boolean = false and (select count(*) from public.{{P}}terms_acceptances where user_id = :A and version = 1) = 1);
select pg_temp.expect('l''ancienne version (1) n''est plus acceptable', pg_temp.err('select public.{{P}}accept_terms(1)') like '%terms_outdated%');
select public.{{P}}accept_terms(2);
select pg_temp.expect('A accepte la version 2 : acceptée, deux preuves conservées (1 et 2)', (public.{{P}}status() ->> 'cgu_accepted')::boolean = true and (select array_agg(version order by version) from public.{{P}}terms_acceptances where user_id = :A) = array[1, 2]);

\echo '--- droits'
select pg_temp.expect('la table des preuves est fermée aux joueurs ; accept_terms réservée aux connectés', not has_table_privilege('authenticated', 'public.{{P}}terms_acceptances', 'select') and not has_table_privilege('authenticated', 'public.{{P}}terms_acceptances', 'insert') and not has_table_privilege('anon', 'public.{{P}}terms_acceptances', 'select')
  and has_function_privilege('authenticated', 'public.{{P}}accept_terms(int, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}accept_terms(int, text)', 'execute'));
-- nettoyage
delete from public.{{P}}terms_acceptances;
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
