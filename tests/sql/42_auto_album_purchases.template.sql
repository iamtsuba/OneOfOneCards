-- Une carte achetée sur le marché (prix fixe, enchère gagnée) ou obtenue par une offre / contre-offre acceptée va directement dans l'album de l'acheteur, si l'emplacement est libre.
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
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Achats Album', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'AA1', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'AA2', '🐱', 2, false) returning id as t2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'AA3', '🐱', 3, false) returning id as t3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'AA4', '🐱', 4, false) returning id as t4 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t, 'common', 20, 0, 'simple' from unnest(array[:t1, :t2, :t3, :t4]) t;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t1, 'rare', 20, 20, 'simple');
update public.{{P}}profiles set coins = 1000 where id in (:B, :C);
update public.{{P}}profiles set coins = 100 where id = :A;
-- A possède : AA1 communes 1..4 et une rare numérotée (n° 5), AA2 communes 1..3, AA3 communes 1..2, AA4 communes 1..2
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :t1, 'common', 20, g, :A from generate_series(1, 4) g;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:t1, 'rare', 20, 5, :A);
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :t2, 'common', 20, g, :A from generate_series(1, 3) g;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :t3, 'common', 20, g, :A from generate_series(1, 2) g;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :t4, 'common', 20, g, :A from generate_series(1, 2) g;
create or replace function pg_temp.owner(t int, n int) returns uuid language sql as $$ select owner_id from public.{{P}}cards where type_id = t and series = 20 and number = n $$;
create or replace function pg_temp.pick(u uuid, t int, r text) returns int language sql as $$ select number from public.{{P}}album_picks where user_id = u and type_id = t and rarity_id = r $$;
create or replace function pg_temp.picks(u uuid) returns int language sql as $$ select count(*)::int from public.{{P}}album_picks where user_id = u $$;

\echo '--- 1. achat au prix fixe'
set request.jwt.claim.sub = :A;
select (public.{{P}}list_card(:t1, 'common', 20, 1, 'buy_now', 10) ->> 'listing_id')::bigint as l1 \gset
select (public.{{P}}list_card(:t1, 'common', 20, 2, 'buy_now', 10) ->> 'listing_id')::bigint as l2 \gset
select (public.{{P}}list_card(:t1, 'common', 20, 3, 'buy_now', 10) ->> 'listing_id')::bigint as l3 \gset
select (public.{{P}}list_card(:t1, 'rare', 20, 5, 'buy_now', 10) ->> 'listing_id')::bigint as l5 \gset
set request.jwt.claim.sub = :B;
select pg_temp.picks(:B) as avant \gset
select public.{{P}}buy_now(:l1) ->> 'placed' as p1 \gset
select pg_temp.expect('B achète la commune n° 1 : elle est à lui ET directement dans son album (emplacement libre) ; la réponse l''indique (placed)', pg_temp.owner(:t1, 1) = :B::uuid and pg_temp.pick(:B, :t1, 'common') = 1 and :'p1' = 'true' and :avant = 0);
select pg_temp.expect('A n''a rien dans l''album pour cette carte vendue', not exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = :t1 and number = 1));
select public.{{P}}buy_now(:l2) ->> 'placed' as p2 \gset
select pg_temp.expect('B achète une 2e commune du même emplacement : elle arrive chez lui mais l''album GARDE la n° 1 (aucun remplacement) ; placed = faux', pg_temp.owner(:t1, 2) = :B::uuid and pg_temp.pick(:B, :t1, 'common') = 1 and :'p2' = 'false' and pg_temp.picks(:B) = 1);
select public.{{P}}buy_now(:l5) ->> 'placed' as p5 \gset
select pg_temp.expect('B achète la rare n° 5 du même type : autre rareté = autre emplacement, elle est placée (la commune reste) ', pg_temp.pick(:B, :t1, 'rare') = 5 and pg_temp.pick(:B, :t1, 'common') = 1 and :'p5' = 'true' and pg_temp.picks(:B) = 2);
select public.{{P}}clear_album_pick(:t1, 'common');
select pg_temp.expect('B retire sa commune de l''album : emplacement libre, même s''il possède encore la n° 2 hors album', pg_temp.pick(:B, :t1, 'common') is null and pg_temp.owner(:t1, 2) = :B::uuid);
select public.{{P}}buy_now(:l3) ->> 'placed' as p3 \gset
select pg_temp.expect('B achète la n° 3 : l''emplacement est libre, elle est placée (pas la n° 2 qu''il possédait déjà)', pg_temp.pick(:B, :t1, 'common') = 3 and :'p3' = 'true');

\echo '--- 2. enchère gagnée'
set request.jwt.claim.sub = :A;
select (public.{{P}}list_card(:t2, 'common', 20, 1, 'auction', 5) ->> 'listing_id')::bigint as la \gset
select (public.{{P}}list_card(:t2, 'common', 20, 2, 'auction', 5) ->> 'listing_id')::bigint as lb \gset
set request.jwt.claim.sub = :C;
select public.{{P}}place_bid(:la, 6) is not null as bid_c;
set request.jwt.claim.sub = :B;
select public.{{P}}place_bid(:la, 8) is not null as bid_b;
update public.{{P}}listings set ends_at = now() - interval '1 minute' where id in (:la, :lb);
select public.{{P}}settle_due();
select pg_temp.expect('B gagne l''enchère à 8 : la carte AA2 n° 1 est à lui ET dans son album', pg_temp.owner(:t2, 1) = :B::uuid and pg_temp.pick(:B, :t2, 'common') = 1);
select pg_temp.expect('C, qui avait enchéri moins haut, n''a rien reçu ni dans son album', pg_temp.picks(:C) = 0);
select pg_temp.expect('enchère sans aucune offre : expirée, la carte reste à A, aucun placement', (select status from public.{{P}}listings where id = :lb) = 'expired' and pg_temp.owner(:t2, 2) = :A::uuid and not exists (select 1 from public.{{P}}album_picks where type_id = :t2 and number = 2));

\echo '--- 3. offre acceptée (acheteur et vendeur NON amis)'
select pg_temp.expect('les joueurs ne sont pas amis (aucune amitié)', not exists (select 1 from public.{{P}}friendships));
set request.jwt.claim.sub = :C;
select public.{{P}}make_offer(:t3, 'common', 20, 1, 12) ->> 'offer_id' as o1 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o1, true) ->> 'placed' as pa1 \gset
select pg_temp.expect('A (vendeur) accepte l''offre de C : la carte est à C ET dans l''album de C ; pour A (le vendeur) la réponse dit placed = faux', pg_temp.owner(:t3, 1) = :C::uuid and pg_temp.pick(:C, :t3, 'common') = 1 and :'pa1' = 'false');
set request.jwt.claim.sub = :C;
select public.{{P}}make_offer(:t3, 'common', 20, 2, 12) ->> 'offer_id' as o2 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o2, true);
select pg_temp.expect('2e carte du même emplacement par offre : elle arrive mais l''album de C garde la n° 1 (aucun remplacement)', pg_temp.owner(:t3, 2) = :C::uuid and pg_temp.pick(:C, :t3, 'common') = 1 and pg_temp.picks(:C) = 1);

\echo '--- 4. contre-offre acceptée'
set request.jwt.claim.sub = :C;
select public.{{P}}make_offer(:t4, 'common', 20, 1, 10) ->> 'offer_id' as o3 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o3, 20);
set request.jwt.claim.sub = :C;
select public.{{P}}respond_offer(:o3, true) ->> 'placed' as pc3 \gset
select pg_temp.expect('A contre-propose 20, C ACCEPTE : la carte est à C ET dans son album ; pour C (l''acheteur) la réponse dit placed = vrai', pg_temp.owner(:t4, 1) = :C::uuid and pg_temp.pick(:C, :t4, 'common') = 1 and :'pc3' = 'true');
select pg_temp.expect('C a payé 20 (prix de la contre-offre) en plus des 12 + 12 précédents', (select coins from public.{{P}}profiles where id = :C) = 1000 - 12 - 12 - 20);
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t4, 'common', 20, 2, 10) ->> 'offer_id' as o4 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o4, 25);
set request.jwt.claim.sub = :B;
select public.{{P}}counter_offer(:o4, 15);
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o4, true) ->> 'placed' as pa4 \gset
select pg_temp.expect('après plusieurs contre-offres, A accepte celle de B : la carte est à B ET dans son album ; placed = faux pour A', pg_temp.owner(:t4, 2) = :B::uuid and pg_temp.pick(:B, :t4, 'common') = 2 and :'pa4' = 'false');
select pg_temp.expect('notification « offre acceptée » pour B, qui est aussi le seul propriétaire de la carte', exists (select 1 from public.{{P}}notifications where user_id = :B and kind = 'offer_accepted' and type_id = :t4 and number = 2));

\echo '--- 5. refus, annulation et sécurité'
select pg_temp.expect('le vendeur A n''a reçu aucune carte dans son album par ces ventes', pg_temp.picks(:A) = 0);
set request.jwt.claim.sub = :C;
select public.{{P}}make_offer(:t1, 'common', 20, 4, 10) ->> 'offer_id' as o5 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o5, false);
select pg_temp.expect('offre REFUSÉE : la carte reste à A, rien n''est placé chez C', pg_temp.owner(:t1, 4) = :A::uuid and pg_temp.pick(:C, :t1, 'common') is null);
select public.{{P}}auto_place_album(:A::uuid, :t1, 'common', 20, 4);
select pg_temp.expect('une carte rangée dans l''album du vendeur reste impossible à vendre (card_in_album)', pg_temp.picks(:A) = 1 and pg_temp.err('select public.{{P}}list_card(' || :t1 || ', ''common'', 20, 4, ''buy_now'', 10)') like '%card_in_album%');
select pg_temp.expect('la fonction de placement n''est pas appelable par les joueurs (ni par un visiteur)', not has_function_privilege('authenticated', 'public.{{P}}place_in_album(uuid, int, text, int, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}place_in_album(uuid, int, text, int, int)', 'execute'));
-- nettoyage
delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}listings; delete from public.{{P}}album_picks;
delete from public.{{P}}cards where owner_id in (:A, :B, :C);
delete from public.{{P}}categories where name = 'Achats Album';
update public.{{P}}categories set closed = false;
