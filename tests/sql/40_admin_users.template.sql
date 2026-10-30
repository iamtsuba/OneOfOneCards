-- Console admin : liste des joueurs (cartes, doubles par collection, pass), OneMore offert ou retiré.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as pc;
create temp table prof_backup as select id, username from public.{{P}}profiles where id in (:A, :B, :C);
create temp table cfg_backup as select * from public.{{P}}config where key = 'subscription_gift_quantity';
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}pro_members; delete from public.{{P}}offers; delete from public.{{P}}listings; delete from public.{{P}}album_picks; delete from public.{{P}}cards where owner_id in (:A, :B, :C);
update public.{{P}}profiles set username = 'Zuser_A' where id = :A;
update public.{{P}}profiles set username = 'Zuser_B' where id = :B;
update public.{{P}}profiles set username = 'zUSER_C' where id = :C;
update public.{{P}}config set value = 1 where key = 'subscription_gift_quantity';
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Joueurs 1', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat1 \gset
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Joueurs 2', 2, 100, '#fff', '#ccc', '#000', true) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat1, 'U1', 'x', 1, false) returning id as t1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat1, 'U2', 'x', 2, false) returning id as t2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'U3', 'x', 1, false) returning id as t3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat1, 'U4', 'x', 3, false) returning id as t4 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t, 'common', 10, 0, 'simple' from unnest(array[:t1, :t2, :t3]) t;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t4, 'rare', 10, 10, 'simple');
-- A : U1 x4 (3 doubles), U2 x1, U4 rare x3 numérotées (2 doubles), collection 2 : U3 x2 (1 double) -> 10 cartes, 6 doubles ; B : U1 x2 (1 double) ; C : aucune carte
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:t1, 'common', 5, 1, :A), (:t1, 'common', 5, 2, :A), (:t1, 'common', 5, 3, :A), (:t1, 'common', 5, 4, :A), (:t2, 'common', 5, 1, :A),
  (:t4, 'rare', 5, 2, :A), (:t4, 'rare', 5, 3, :A), (:t4, 'rare', 5, 4, :A), (:t3, 'common', 5, 1, :A), (:t3, 'common', 5, 2, :A),
  (:t1, 'common', 6, 1, :B), (:t1, 'common', 6, 2, :B);
create or replace function pg_temp.list(q text default 'zuser', l int default 50, pw text default 'thomarie') returns jsonb language sql as $$ select public.{{P}}admin_users(pw, q, l) $$;
create or replace function pg_temp.user(u uuid, q text default 'zuser') returns jsonb language sql as $$ select e from jsonb_array_elements(public.{{P}}admin_users('thomarie', q, 50) -> 'users') e where (e ->> 'id')::uuid = u $$;

\echo '--- la liste'
select pg_temp.expect('trois joueurs trouvés (recherche « zuser » sans tenir compte de la casse), triés par nombre de cartes : A (10), B (2), C (0)', (pg_temp.list() ->> 'total')::int = 3 and (select array_agg(e ->> 'username' order by ord) from jsonb_array_elements(pg_temp.list() -> 'users') with ordinality t(e, ord)) = array['Zuser_A', 'Zuser_B', 'zUSER_C']);
select pg_temp.expect('A : 10 cartes, 6 doubles (3 + 2 dans la collection 1, 1 dans la collection 2)', (pg_temp.user(:A) ->> 'cards')::int = 10 and (pg_temp.user(:A) ->> 'doubles')::int = 6);
select pg_temp.expect('détail par collection : collection 1 = 8 cartes / 5 doubles ; collection 2 = 2 cartes / 1 double ; dans l''ordre des collections', (select array_agg(row(x ->> 'category_id', x ->> 'cards', x ->> 'doubles')::text order by ord) from jsonb_array_elements(pg_temp.user(:A) -> 'collections') with ordinality t(x, ord)) = array[row(:cat1::text, '8', '5')::text, row(:cat2::text, '2', '1')::text]);
select pg_temp.expect('B : 2 cartes, 1 double dans la collection 1 seulement ; C : aucune carte, aucun double, aucune collection', (pg_temp.user(:B) ->> 'cards')::int = 2 and (pg_temp.user(:B) ->> 'doubles')::int = 1 and jsonb_array_length(pg_temp.user(:B) -> 'collections') = 1 and (pg_temp.user(:C) ->> 'cards')::int = 0 and (pg_temp.user(:C) ->> 'doubles')::int = 0 and jsonb_array_length(pg_temp.user(:C) -> 'collections') = 0);
select pg_temp.expect('les collections sont listées avec leur nom et leur état (terminée ou non)', exists (select 1 from jsonb_array_elements(pg_temp.list() -> 'categories') c where c ->> 'name' = 'Joueurs 1' and (c ->> 'id')::int = :cat1 and (c ->> 'closed')::boolean = false));
select pg_temp.expect('personne n''a encore de pass', (select bool_and(e -> 'pro' = 'null'::jsonb) from jsonb_array_elements(pg_temp.list() -> 'users') e));
select pg_temp.expect('recherche : un seul joueur (« zuser_a »), aucun (« introuvable »), « % » et « _ » sont des caractères ordinaires (pas de joker)', (pg_temp.list('zuser_a') ->> 'total')::int = 1 and (pg_temp.list('introuvable') ->> 'shown')::int = 0 and (pg_temp.list('%') ->> 'shown')::int = 0 and (pg_temp.list('_c') ->> 'total')::int = 1);
select pg_temp.expect('limite : 2 joueurs montrés sur 3, les mieux dotés (A puis B)', (pg_temp.list('zuser', 2) ->> 'shown')::int = 2 and (pg_temp.list('zuser', 2) ->> 'total')::int = 3 and (pg_temp.list('zuser', 2) -> 'users' -> 1 ->> 'username') = 'Zuser_B');
select pg_temp.expect('sans recherche : tous les joueurs de l''environnement ; limite hors bornes ramenée à 1..1000', (pg_temp.list(null) ->> 'total')::int >= 3 and (pg_temp.list('zuser', 0) ->> 'shown')::int = 1 and (pg_temp.list('zuser', 99999) ->> 'shown')::int = 3);
select pg_temp.expect('mauvais mot de passe : refusé (admin_denied), sans données', (pg_temp.list('zuser', 50, 'faux') ->> 'error') = 'admin_denied' and not (pg_temp.list('zuser', 50, 'faux') ? 'users'));

\echo '--- offrir OneMore'
select (public.{{P}}admin_grant_pro('thomarie', :A) ->> 'ok')::boolean as g1 \gset
select pg_temp.expect('A reçoit le pass : membre, avantages comme un achat', :'g1'::boolean and public.{{P}}is_subscriber(:A::uuid));
select pg_temp.expect('la liste montre le pass offert (source « admin »), avec sa date', (pg_temp.user(:A) -> 'pro' ->> 'active')::boolean and (pg_temp.user(:A) -> 'pro' ->> 'source') = 'admin' and (pg_temp.user(:A) -> 'pro' ->> 'since') is not null);
select pg_temp.expect('le booster cadeau Pro est offert une fois (1 booster)', (select coalesce(sum(ub.quantity), 0) from public.{{P}}user_boosters ub join public.{{P}}booster_types bt on bt.id = ub.booster_type_id where ub.user_id = :A and bt.role = 'subscription_gift') = 1);
select pg_temp.expect('déjà membre : refusé (already_member), rien ne change', pg_temp.err('select public.{{P}}admin_grant_pro(''thomarie'', ''' || :A || ''')') like '%already_member%' and (select coalesce(sum(ub.quantity), 0) from public.{{P}}user_boosters ub join public.{{P}}booster_types bt on bt.id = ub.booster_type_id where ub.user_id = :A and bt.role = 'subscription_gift') = 1);
insert into public.{{P}}pro_members (user_id, stripe_session_id, stripe_payment_intent, amount_cents, currency) values (:B, 'cs_live_payee', 'pi_live_payee', 499, 'eur');
select pg_temp.expect('un pass PAYÉ est signalé « paid » dans la liste, et ne peut ni être offert de nouveau (already_member) ni être retiré ici (paid_member)', (pg_temp.user(:B) -> 'pro' ->> 'source') = 'paid' and pg_temp.err('select public.{{P}}admin_grant_pro(''thomarie'', ''' || :B || ''')') like '%already_member%' and pg_temp.err('select public.{{P}}admin_revoke_pro(''thomarie'', ''' || :B || ''')') like '%paid_member%' and public.{{P}}is_subscriber(:B::uuid));
select pg_temp.expect('retirer à un joueur sans pass : not_member ; joueur inconnu ou vide : user_not_found', pg_temp.err('select public.{{P}}admin_revoke_pro(''thomarie'', ''' || :C || ''')') like '%not_member%' and pg_temp.err('select public.{{P}}admin_grant_pro(''thomarie'', ''99999999-9999-9999-9999-999999999999'')') like '%user_not_found%' and pg_temp.err('select public.{{P}}admin_grant_pro(''thomarie'', null)') like '%user_not_found%');
select pg_temp.expect('mauvais mot de passe : refusé pour offrir et pour retirer', (public.{{P}}admin_grant_pro('faux', :C) ->> 'error') = 'admin_denied' and (public.{{P}}admin_revoke_pro('faux', :A) ->> 'error') = 'admin_denied' and not public.{{P}}is_subscriber(:C::uuid) and public.{{P}}is_subscriber(:A::uuid));

\echo '--- retirer un pass offert'
select (public.{{P}}admin_revoke_pro('thomarie', :A) ->> 'ok')::boolean as r1 \gset
select pg_temp.expect('pass offert retiré : A n''est plus membre, la liste ne montre plus de pass', :'r1'::boolean and not public.{{P}}is_subscriber(:A::uuid) and (pg_temp.user(:A) -> 'pro') = 'null'::jsonb);
select pg_temp.expect('retirer deux fois : not_member', pg_temp.err('select public.{{P}}admin_revoke_pro(''thomarie'', ''' || :A || ''')') like '%not_member%');
select (public.{{P}}admin_grant_pro('thomarie', :A) ->> 'ok')::boolean as g2 \gset
select pg_temp.expect('on peut l''offrir de nouveau après un retrait', :'g2'::boolean and public.{{P}}is_subscriber(:A::uuid));
select pg_temp.expect('droits : fonctions ouvertes aux joueurs connectés (le mot de passe admin est contrôlé dedans), jamais aux anonymes', has_function_privilege('authenticated', 'public.{{P}}admin_users(text, text, int)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}admin_grant_pro(text, uuid)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}admin_revoke_pro(text, uuid)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_users(text, text, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_grant_pro(text, uuid)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_revoke_pro(text, uuid)', 'execute'));
set request.jwt.claim.sub = '';
select pg_temp.expect('sans être connecté : refusé (not_authenticated)', (public.{{P}}admin_users('thomarie', 'zuser', 5) ->> 'error') = 'not_authenticated' and (public.{{P}}admin_grant_pro('thomarie', :A) ->> 'error') = 'not_authenticated');
-- nettoyage
delete from public.{{P}}pro_members; delete from public.{{P}}user_boosters;
delete from public.{{P}}cards where owner_id in (:A, :B, :C);
delete from public.{{P}}categories where name in ('Joueurs 1', 'Joueurs 2');
update public.{{P}}profiles pr set username = b.username from prof_backup b where b.id = pr.id;
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
update public.{{P}}categories set closed = false;
