-- Cartes SECRÈTES : une carte placée dans l'album se vend quand même à un autre joueur (marché, enchère, offre) et quitte alors l'album de son vendeur.
-- Les autres cartes gardent la règle : une carte placée dans l'album ne peut pas être vendue. La revente à la banque reste refusée pour tout le monde.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as pc;
delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}listings; delete from public.{{P}}favorites; delete from public.{{P}}friendships;
delete from public.{{P}}album_picks; delete from public.{{P}}cards where owner_id in (:A, :B, :C);
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Secretes Album', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'SEC1', '🐱', 1, true) returning id as ts \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'NOR1', '🐱', 2, false) returning id as tn \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t, 'common', 20, 0, 'simple' from unnest(array[:ts, :tn]) t;
update public.{{P}}profiles set coins = 1000 where id in (:B, :C);
update public.{{P}}profiles set coins = 100 where id = :A;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :ts, 'common', 20, g, :A from generate_series(1, 6) g;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :tn, 'common', 20, g, :A from generate_series(1, 3) g;
create or replace function pg_temp.owner(t int, n int) returns uuid language sql as $$ select owner_id from public.{{P}}cards where type_id = t and series = 20 and number = n $$;
create or replace function pg_temp.pick(u uuid, t int) returns int language sql as $$ select number from public.{{P}}album_picks where user_id = u and type_id = t and rarity_id = 'common' $$;
create or replace function pg_temp.coins(u uuid) returns bigint language sql as $$ select coins from public.{{P}}profiles where id = u $$;

\echo '--- préparation : A range une carte secrète et une carte ordinaire dans son album'
select pg_temp.expect('la fonction card_is_secret distingue les deux types', public.{{P}}card_is_secret(:ts) and not public.{{P}}card_is_secret(:tn) and not public.{{P}}card_is_secret(-1));
set request.jwt.claim.sub = :A;
select public.{{P}}set_album_pick(:ts, 'common', 20, 1) is not null as s1;
select public.{{P}}set_album_pick(:tn, 'common', 20, 1) is not null as s2;
select pg_temp.expect('A a la secrète n° 1 et l''ordinaire n° 1 dans son album', pg_temp.pick(:A, :ts) = 1 and pg_temp.pick(:A, :tn) = 1);

\echo '--- 1. mise en vente'
select pg_temp.expect('carte ORDINAIRE dans l''album : toujours refusée (card_in_album)', pg_temp.err('select public.{{P}}list_card(' || :tn || ', ''common'', 20, 1, ''buy_now'', 10)') like '%card_in_album%' and pg_temp.pick(:A, :tn) = 1);
select (public.{{P}}list_card(:ts, 'common', 20, 1, 'buy_now', 10) ->> 'listing_id')::bigint as l1 \gset
select pg_temp.expect('carte SECRÈTE dans l''album : mise en vente acceptée, et elle reste dans l''album tant qu''elle n''est pas vendue', :l1 > 0 and pg_temp.pick(:A, :ts) = 1 and pg_temp.owner(:ts, 1) = :A::uuid);

\echo '--- 2. achat au prix fixe'
set request.jwt.claim.sub = :B;
select public.{{P}}buy_now(:l1) is not null as achat;
select pg_temp.expect('B achète : la carte est à B ET dans son album ; A n''a plus rien dans son album pour ce type (retirée automatiquement)', pg_temp.owner(:ts, 1) = :B::uuid and pg_temp.pick(:B, :ts) = 1 and pg_temp.pick(:A, :ts) is null and pg_temp.pick(:A, :tn) = 1);

\echo '--- 3. offre acceptée'
set request.jwt.claim.sub = :A;
select public.{{P}}set_album_pick(:ts, 'common', 20, 2) is not null as s3;
select pg_temp.expect('A range la secrète n° 2 dans son album', pg_temp.pick(:A, :ts) = 2);
set request.jwt.claim.sub = :C;
select public.{{P}}make_offer(:ts, 'common', 20, 2, 25) ->> 'offer_id' as o1 \gset
select pg_temp.coins(:A) as a_avant, pg_temp.coins(:C) as c_avant \gset
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o1, true) is not null as ok1;
select pg_temp.expect('A accepte l''offre sur sa secrète rangée dans l''album : la carte passe à C, A reçoit 25 pièces, C les paie', pg_temp.owner(:ts, 2) = :C::uuid and pg_temp.coins(:A) = :a_avant + 25 and pg_temp.coins(:C) = :c_avant - 25);
select pg_temp.expect('… elle quitte l''album de A (plus d''emplacement pris) et arrive dans l''album de C (emplacement libre)', pg_temp.pick(:A, :ts) is null and pg_temp.pick(:C, :ts) = 2);
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:tn, 'common', 20, 1, 30) ->> 'offer_id' as o2 \gset
set request.jwt.claim.sub = :A;
select pg_temp.expect('offre sur une carte ORDINAIRE rangée dans l''album : l''acceptation est refusée (card_in_album), rien ne bouge', pg_temp.err('select public.{{P}}respond_offer(' || :o2 || ', true)') like '%card_in_album%' and pg_temp.owner(:tn, 1) = :A::uuid and pg_temp.pick(:A, :tn) = 1 and (select status from public.{{P}}offers where id = :o2) = 'pending');
select public.{{P}}clear_album_pick(:tn, 'common') is not null as retiree;
select public.{{P}}respond_offer(:o2, true) is not null as ok2;
select pg_temp.expect('une fois retirée de l''album, la carte ordinaire se vend à B (règle inchangée)', pg_temp.owner(:tn, 1) = :B::uuid);

\echo '--- 4. enchère gagnée'
set request.jwt.claim.sub = :A;
select public.{{P}}set_album_pick(:ts, 'common', 20, 3) is not null as s4;
select (public.{{P}}list_card(:ts, 'common', 20, 3, 'auction', 5) ->> 'listing_id')::bigint as la \gset
set request.jwt.claim.sub = :C;
select public.{{P}}place_bid(:la, 6) is not null as bid_c;
update public.{{P}}listings set ends_at = now() - interval '1 minute' where id = :la;
select public.{{P}}settle_due();
select pg_temp.expect('enchère gagnée par C sur une secrète rangée dans l''album de A : carte à C, retirée de l''album de A', pg_temp.owner(:ts, 3) = :C::uuid and pg_temp.pick(:A, :ts) is null);

\echo '--- 5. la revente à la banque reste refusée pour une carte dans l''album'
set request.jwt.claim.sub = :A;
select public.{{P}}set_album_pick(:ts, 'common', 20, 4) is not null as s5;
select pg_temp.expect('carte SECRÈTE dans l''album vers la banque : refusée (card_in_album) ; seule la vente à un autre joueur la fait sortir de l''album', pg_temp.err('select public.{{P}}sell_direct(' || :ts || ', ''common'', 20, 4)') like '%card_in_album%' and pg_temp.owner(:ts, 4) = :A::uuid and pg_temp.pick(:A, :ts) = 4);
select pg_temp.expect('droits : card_is_secret appelable par les joueurs connectés, jamais par les anonymes', has_function_privilege('authenticated', 'public.{{P}}card_is_secret(int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}card_is_secret(int)', 'execute'));
-- nettoyage
delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}listings; delete from public.{{P}}album_picks;
delete from public.{{P}}cards where owner_id in (:A, :B, :C);
delete from public.{{P}}categories where name = 'Secretes Album';
update public.{{P}}categories set closed = false;
