-- Console admin : offrir des pièces à un joueur (cadeau), solde visible dans la liste des joueurs.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
create temp table prof_backup as select id, username, coins from public.{{P}}profiles where id in (:A, :B);
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
update public.{{P}}profiles set username = 'Zcoins_A', coins = 100 where id = :A;
update public.{{P}}profiles set username = 'Zcoins_B', coins = 7 where id = :B;
create or replace function pg_temp.coins(u uuid) returns bigint language sql as $$ select coins from public.{{P}}profiles where id = u $$;
create or replace function pg_temp.listed(u uuid) returns jsonb language sql as $$ select e from jsonb_array_elements(public.{{P}}admin_users('thomarie', 'zcoins', 50) -> 'users') e where (e ->> 'id')::uuid = u $$;

\echo '--- offrir des pièces'
select public.{{P}}admin_grant_coins('thomarie', :A, 50) as r1 \gset
select pg_temp.expect('A reçoit 50 pièces : 100 -> 150, la réponse donne ok, le nouveau solde et le pseudo', (:'r1'::jsonb ->> 'ok')::boolean and (:'r1'::jsonb ->> 'coins')::bigint = 150 and (:'r1'::jsonb ->> 'username') = 'Zcoins_A' and pg_temp.coins(:A) = 150);
select pg_temp.expect('l''autre joueur n''est pas touché (B : 7)', pg_temp.coins(:B) = 7);
select public.{{P}}admin_grant_coins('thomarie', :A, 25) as r2 \gset
select pg_temp.expect('les offres s''ajoutent : 150 + 25 = 175', (:'r2'::jsonb ->> 'coins')::bigint = 175 and pg_temp.coins(:A) = 175);
select pg_temp.expect('la liste des joueurs montre le solde de chacun (A : 175, B : 7)', (pg_temp.listed(:A) ->> 'coins')::bigint = 175 and (pg_temp.listed(:B) ->> 'coins')::bigint = 7);
select pg_temp.expect('bornes : 1 pièce et 1 000 000 pièces acceptées', (public.{{P}}admin_grant_coins('thomarie', :B, 1) ->> 'ok')::boolean and (public.{{P}}admin_grant_coins('thomarie', :B, 1000000) ->> 'ok')::boolean and pg_temp.coins(:B) = 1000008);

\echo '--- refus'
select pg_temp.expect('montant invalide (0, négatif, au-dessus d''un million, vide) : invalid_amount, solde inchangé', pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', ''' || :A || ''', 0)') like '%invalid_amount%' and pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', ''' || :A || ''', -5)') like '%invalid_amount%' and pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', ''' || :A || ''', 1000001)') like '%invalid_amount%' and pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', ''' || :A || ''', null)') like '%invalid_amount%' and pg_temp.coins(:A) = 175);
select pg_temp.expect('joueur inconnu ou vide : user_not_found', pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', ''99999999-9999-9999-9999-999999999999'', 10)') like '%user_not_found%' and pg_temp.err('select public.{{P}}admin_grant_coins(''thomarie'', null, 10)') like '%user_not_found%');
select pg_temp.expect('mauvais mot de passe : refusé (admin_denied), aucun changement', (public.{{P}}admin_grant_coins('faux', :A, 10) ->> 'error') = 'admin_denied' and pg_temp.coins(:A) = 175);
select pg_temp.expect('droits : ouverte aux joueurs connectés (le mot de passe admin est contrôlé dedans), jamais aux anonymes', has_function_privilege('authenticated', 'public.{{P}}admin_grant_coins(text, uuid, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_grant_coins(text, uuid, int)', 'execute'));
set request.jwt.claim.sub = '';
select pg_temp.expect('sans être connecté : refusé (not_authenticated)', (public.{{P}}admin_grant_coins('thomarie', :A, 10) ->> 'error') = 'not_authenticated' and pg_temp.coins(:A) = 175);
set request.jwt.claim.sub = :A;
select pg_temp.expect('un autre compte que l''admin (lié au premier mot de passe correct), même avec le bon mot de passe : refusé (admin_denied), aucune pièce offerte', (public.{{P}}admin_grant_coins('thomarie', :A, 10) ->> 'error') = 'admin_denied' and pg_temp.coins(:A) = 175);
-- nettoyage
update public.{{P}}profiles pr set username = b.username, coins = b.coins from prof_backup b where b.id = pr.id;
