-- Lien d'invitation : un code par joueur, devenir ami en l'ouvrant, nouveau code, demandes en attente, limites, droits.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'aucune erreur'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.rel(me uuid, other uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', me::text, false);
  return (select relation from public.{{P}}friends_list() where user_id = other);
end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
delete from public.{{P}}friendships; delete from public.{{P}}friend_invites;
delete from auth.users where id::text like '66666666-%';
insert into auth.users (id, email, raw_user_meta_data) values ('66666666-0000-0000-0000-000000000001', 'c@test.fr', '{"username": "Camille"}'::jsonb);
select public.{{P}}ensure_profile('66666666-0000-0000-0000-000000000001');

\echo '--- le code : un par joueur, stable, au hasard'
set request.jwt.claim.sub = :A;
select public.{{P}}friend_invite_code() as code_a \gset
select pg_temp.expect('le code a 20 caractères hexadécimaux', :'code_a' ~ '^[0-9a-f]{20}$');
select public.{{P}}friend_invite_code() as code_a2 \gset
select pg_temp.expect('redemander le code donne toujours le même (le lien copié reste valable)', :'code_a2' = :'code_a');
set request.jwt.claim.sub = :B;
select public.{{P}}friend_invite_code() as code_b \gset
select pg_temp.expect('chaque joueur a son propre code', :'code_b' <> :'code_a' and :'code_b' ~ '^[0-9a-f]{20}$');
select pg_temp.expect('aperçu avant connexion : le pseudo du propriétaire (A), rien pour un code inconnu ou mal formé', public.{{P}}friend_invite_preview(:'code_a') = (select username from public.{{P}}profiles where id = :A)
  and public.{{P}}friend_invite_preview('00000000000000000000') is null and public.{{P}}friend_invite_preview('nimporte quoi') is null and public.{{P}}friend_invite_preview(null) is null and public.{{P}}friend_invite_preview('') is null
  and public.{{P}}friend_invite_preview(upper(:'code_a')) is null);

\echo '--- ouvrir le lien : on devient ami tout de suite'
set request.jwt.claim.sub = :B;
select public.{{P}}friend_accept_invite(:'code_a') as r \gset i_
select pg_temp.expect('B ouvre le lien de A : amis aussitôt, le pseudo de A est renvoyé, pas de demande à accepter', (:'i_r'::jsonb ->> 'ok')::bool and not (:'i_r'::jsonb ->> 'already')::bool and :'i_r'::jsonb ->> 'friend' = (select username from public.{{P}}profiles where id = :A));
select pg_temp.expect('les DEUX voient l''autre comme ami (relation « friend »), aucune demande en attente', pg_temp.rel(:A, :B) = 'friend' and pg_temp.rel(:B, :A) = 'friend' and (select count(*) from public.{{P}}friendships) = 1 and (select status from public.{{P}}friendships limit 1) = 'accepted');
set request.jwt.claim.sub = :B;
select public.{{P}}friend_accept_invite(:'code_a') as r \gset i_
select pg_temp.expect('rouvrir le même lien : « déjà amis », rien de dupliqué', (:'i_r'::jsonb ->> 'already')::bool and (select count(*) from public.{{P}}friendships) = 1);
select pg_temp.expect('le nombre d''utilisations du code est compté (1 : seule la vraie création compte)', (select uses from public.{{P}}friend_invites where user_id = :A) = 1);
set request.jwt.claim.sub = :A;
select public.{{P}}friend_accept_invite(:'code_b') as r \gset i_
select pg_temp.expect('A ouvrant le lien de B : déjà amis aussi, rien de dupliqué', (:'i_r'::jsonb ->> 'already')::bool and (select count(*) from public.{{P}}friendships) = 1);

\echo '--- refus : son propre lien, un code faux'
set request.jwt.claim.sub = :A;
select pg_temp.expect('ouvrir son propre lien : refusé (cannot_friend_self)', pg_temp.err('select public.{{P}}friend_accept_invite(' || quote_literal(:'code_a') || ')') = 'cannot_friend_self');
select pg_temp.expect('code inconnu, vide, nul, en majuscules ou mal formé : « invalid_invite »', pg_temp.err($q$select public.{{P}}friend_accept_invite('00000000000000000000')$q$) = 'invalid_invite' and pg_temp.err($q$select public.{{P}}friend_accept_invite('')$q$) = 'invalid_invite'
  and pg_temp.err($q$select public.{{P}}friend_accept_invite(null)$q$) = 'invalid_invite' and pg_temp.err($q$select public.{{P}}friend_accept_invite('ABCDEF0123456789ABCD')$q$) = 'invalid_invite' and pg_temp.err($q$select public.{{P}}friend_accept_invite('abc')$q$) = 'invalid_invite'
  and pg_temp.err($q$select public.{{P}}friend_accept_invite('0123456789abcdef0123; drop table x')$q$) = 'invalid_invite');
select pg_temp.expect('un refus ne crée aucune amitié', (select count(*) from public.{{P}}friendships) = 1);

\echo '--- demandes déjà en attente : le lien les transforme en amitié'
delete from public.{{P}}friendships;
set request.jwt.claim.sub = :B;
select public.{{P}}friend_request(:A) as _ \gset
select pg_temp.expect('B avait envoyé une demande à A (en attente)', pg_temp.rel(:B, :A) = 'sent' and pg_temp.rel(:A, :B) = 'received');
set request.jwt.claim.sub = :B;
select public.{{P}}friend_accept_invite(:'code_a') as r \gset i_
select pg_temp.expect('B ouvre le lien de A : la demande devient une amitié (une seule ligne)', (:'i_r'::jsonb ->> 'ok')::bool and pg_temp.rel(:A, :B) = 'friend' and pg_temp.rel(:B, :A) = 'friend' and (select count(*) from public.{{P}}friendships) = 1);
delete from public.{{P}}friendships;
set request.jwt.claim.sub = :A;
select public.{{P}}friend_request(:B) as _ \gset
set request.jwt.claim.sub = :B;
select public.{{P}}friend_accept_invite(:'code_a') as r \gset i_
select pg_temp.expect('A avait demandé B puis B ouvre le lien de A : amis aussi (une seule ligne)', pg_temp.rel(:A, :B) = 'friend' and (select count(*) from public.{{P}}friendships) = 1);

\echo '--- nouveau lien : l''ancien ne marche plus'
set request.jwt.claim.sub = :A;
select public.{{P}}friend_invite_code(true) as code_a3 \gset
select pg_temp.expect('un nouveau code différent, l''utilisation repart à zéro', :'code_a3' <> :'code_a' and :'code_a3' ~ '^[0-9a-f]{20}$' and (select uses from public.{{P}}friend_invites where user_id = :A) = 0);
select pg_temp.expect('l''ancien lien est refusé, l''aperçu aussi ; le nouveau marche', public.{{P}}friend_invite_preview(:'code_a') is null and public.{{P}}friend_invite_preview(:'code_a3') is not null);
select pg_temp.expect('le code que le joueur reçoit ensuite est le nouveau', public.{{P}}friend_invite_code() = :'code_a3');
delete from public.{{P}}friendships;
set request.jwt.claim.sub = '66666666-0000-0000-0000-000000000001';
select pg_temp.expect('un 3e joueur avec l''ANCIEN lien : refusé ; avec le nouveau : ami de A', pg_temp.err('select public.{{P}}friend_accept_invite(' || quote_literal(:'code_a') || ')') = 'invalid_invite' and (public.{{P}}friend_accept_invite(:'code_a3') ->> 'ok')::bool);
select pg_temp.expect('A et Camille sont amis ; B n''est pas concerné', pg_temp.rel(:A, '66666666-0000-0000-0000-000000000001') = 'friend' and pg_temp.rel(:A, :B) is null);

\echo '--- limite de 200 amis'
delete from public.{{P}}friendships;
delete from auth.users where id::text like '77777777-%';
insert into auth.users (id, email, raw_user_meta_data) select ('77777777-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'f' || g || '@test.fr', jsonb_build_object('username', 'Ami' || g) from generate_series(1, 200) g;
select public.{{P}}ensure_profile(id) from auth.users where id::text like '77777777-%';
insert into public.{{P}}friendships (requester_id, addressee_id, status, responded_at) select :A, id, 'accepted', now() from auth.users where id::text like '77777777-%';
select pg_temp.expect('A a 200 amis', (select count(*) from public.{{P}}friendships) = 200);
set request.jwt.claim.sub = :B;
select pg_temp.expect('B ouvre le lien de A qui a déjà 200 amis : refusé (inviter_full), aucune amitié de plus', pg_temp.err('select public.{{P}}friend_accept_invite(' || quote_literal(:'code_a3') || ')') = 'inviter_full' and (select count(*) from public.{{P}}friendships) = 200);
delete from public.{{P}}friendships where addressee_id <> '77777777-0000-0000-0000-000000000001'::uuid and requester_id = :A;
insert into public.{{P}}friendships (requester_id, addressee_id, status, responded_at) select '77777777-0000-0000-0000-000000000001', id, 'accepted', now() from auth.users where id::text like '77777777-%' and id <> '77777777-0000-0000-0000-000000000001' limit 199;
select public.{{P}}friend_invite_code() as code_b2 \gset
set request.jwt.claim.sub = '77777777-0000-0000-0000-000000000001';
select pg_temp.expect('un joueur qui a déjà 200 amis ouvre le lien de B : refusé (too_many_friends)', pg_temp.err('select public.{{P}}friend_accept_invite(' || quote_literal(:'code_b2') || ')') = 'too_many_friends');
delete from public.{{P}}friendships;

\echo '--- droits'
select pg_temp.expect('code et acceptation : réservés aux joueurs connectés ; l''aperçu est public (avant la connexion)', has_function_privilege('authenticated', 'public.{{P}}friend_invite_code(boolean)', 'execute') and not has_function_privilege('anon', 'public.{{P}}friend_invite_code(boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.{{P}}friend_accept_invite(text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}friend_accept_invite(text)', 'execute')
  and has_function_privilege('anon', 'public.{{P}}friend_invite_preview(text)', 'execute'));
select pg_temp.expect('la table des codes est fermée (on ne peut ni lire ni écrire les codes des autres)', not has_table_privilege('authenticated', 'public.{{P}}friend_invites', 'select') and not has_table_privilege('authenticated', 'public.{{P}}friend_invites', 'insert') and not has_table_privilege('anon', 'public.{{P}}friend_invites', 'select'));
reset request.jwt.claim.sub;
select pg_temp.expect('sans être connecté, accepter ou demander un code échoue (not_authenticated)', pg_temp.err($q$select public.{{P}}friend_accept_invite('0123456789abcdef0123')$q$) = 'not_authenticated' and pg_temp.err($q$select public.{{P}}friend_invite_code()$q$) = 'not_authenticated');

-- nettoyage
delete from public.{{P}}friendships; delete from public.{{P}}friend_invites;
delete from public.{{P}}profiles where id::text like '66666666-%' or id::text like '77777777-%';
delete from auth.users where id::text like '66666666-%' or id::text like '77777777-%';
