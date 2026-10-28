-- Offres : accepter, refuser ou faire une contre-offre (négociation entre l'acheteur et le propriétaire).
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as pc;
delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}listings; delete from public.{{P}}cards where owner_id in (:A, :B, :C); delete from public.{{P}}album_picks; delete from public.{{P}}friendships;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Nego Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'N1', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t1, 'common', 20, 0, 'simple');
update public.{{P}}profiles set coins = 100 where id = :B;
update public.{{P}}profiles set coins = 50 where id = :A;
select username as na from public.{{P}}profiles where id = :A \gset
select username as nb from public.{{P}}profiles where id = :B \gset
create or replace function pg_temp.coins(u uuid) returns bigint language sql as $$ select coins from public.{{P}}profiles where id = u $$;
create or replace function pg_temp.owner(n int) returns uuid language sql as $$ select owner_id from public.{{P}}cards where series = 20 and number = n and type_id = (select min(id) from public.{{P}}types where name = 'N1') $$;
create or replace function pg_temp.offer(n int) returns public.{{P}}offers language sql as $$ select o from public.{{P}}offers o where o.series = 20 and o.number = n order by id desc limit 1 $$;
create or replace function pg_temp.notif(u uuid, k text) returns int language sql as $$ select count(*)::int from public.{{P}}notifications where user_id = u and kind = k $$;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) select :t1, 'common', 20, g, :A from generate_series(1, 12) g;

\echo '--- 1. l''acheteur propose, le propriétaire CONTRE-propose, l''acheteur contre-propose, le propriétaire accepte'
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 1, 10) ->> 'offer_id' as o1 \gset
select pg_temp.expect('offre de B (10 pièces) : en attente du propriétaire ; proposée par B, aucun échange pour l''instant', (select (status, amount, rounds, proposed_by) from public.{{P}}offers where id = :o1) = ('pending'::text, 10, 0, :B::uuid));
select pg_temp.expect('A (propriétaire) est invité à répondre (waiting_on_me) ; B attend (proposed_by_me)', (select (waiting_on_me, proposed_by_me, role) from public.{{P}}my_offers() where offer_id = :o1) = (false, true, 'buyer'::text));
set request.jwt.claim.sub = :A;
select pg_temp.expect('côté propriétaire : « à moi de répondre » (waiting_on_me), rôle vendeur, pas proposé par moi', (select (waiting_on_me, proposed_by_me, role) from public.{{P}}my_offers() where offer_id = :o1) = (true, false, 'seller'::text));
select public.{{P}}counter_offer(:o1, 30);
select pg_temp.expect('A contre-propose 30 : la même offre passe à 30, proposée par A, 1 échange ; toujours en attente', (select (status, amount, rounds, proposed_by) from public.{{P}}offers where id = :o1) = ('pending'::text, 30, 1, :A::uuid) and (select count(*) from public.{{P}}offers where series = 20 and number = 1) = 1);
select pg_temp.expect('B reçoit une notification « contre-offre » de 30 avec le pseudo de A', (select (kind, amount, actor_name) from public.{{P}}notifications where user_id = :B and kind = 'offer_countered' order by id desc limit 1) = ('offer_countered'::text, 30, :'na'::text));
select pg_temp.expect('A ne peut ni répondre à sa propre contre-offre, ni la contre-proposer (own_offer) ; il peut la retirer', pg_temp.err('select public.{{P}}respond_offer(' || :o1 || ', true)') like '%own_offer%' and pg_temp.err('select public.{{P}}counter_offer(' || :o1 || ', 25)') like '%own_offer%');
set request.jwt.claim.sub = :B;
select pg_temp.expect('côté acheteur : c''est à lui de répondre à la contre-offre', (select (waiting_on_me, proposed_by_me) from public.{{P}}my_offers() where offer_id = :o1) = (true, false));
select pg_temp.expect('B ne peut pas retirer la contre-offre de A (not_owner)', pg_temp.err('select public.{{P}}cancel_offer(' || :o1 || ')') like '%not_owner%');
select pg_temp.expect('même prix refusé (same_price) ; prix invalide refusé (invalid_price)', pg_temp.err('select public.{{P}}counter_offer(' || :o1 || ', 30)') like '%same_price%' and pg_temp.err('select public.{{P}}counter_offer(' || :o1 || ', 0)') like '%invalid_price%' and pg_temp.err('select public.{{P}}counter_offer(' || :o1 || ', null)') like '%invalid_price%');
select public.{{P}}counter_offer(:o1, 20);
select pg_temp.expect('B contre-propose 20 : proposée par B, 2 échanges ; A est notifié', (select (amount, rounds, proposed_by) from public.{{P}}offers where id = :o1) = (20, 2, :B::uuid) and pg_temp.notif(:A, 'offer_countered') = 1);
set request.jwt.claim.sub = :A;
select pg_temp.coins(:A) as ca0, pg_temp.coins(:B) as cb0 \gset
select public.{{P}}respond_offer(:o1, true);
select pg_temp.expect('A accepte 20 : la carte passe à B, B paie 20, A reçoit 20', pg_temp.owner(1) = :B::uuid and pg_temp.coins(:B) = :cb0 - 20 and pg_temp.coins(:A) = :ca0 + 20 and (pg_temp.offer(1)).status = 'accepted');
select pg_temp.expect('B est notifié que son offre est acceptée (offer_accepted) au prix négocié (20)', (select (amount) from public.{{P}}notifications where user_id = :B and kind = 'offer_accepted' order by id desc limit 1) = 20);

\echo '--- 2. le propriétaire contre-propose et l''ACHETEUR accepte'
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 2, 10) ->> 'offer_id' as o2 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o2, 40);
set request.jwt.claim.sub = :B;
select pg_temp.coins(:A) as ca1, pg_temp.coins(:B) as cb1 \gset
select public.{{P}}respond_offer(:o2, true);
select pg_temp.expect('B accepte la contre-offre de 40 : la carte est à B, B paie 40, A reçoit 40', pg_temp.owner(2) = :B::uuid and pg_temp.coins(:B) = :cb1 - 40 and pg_temp.coins(:A) = :ca1 + 40 and (pg_temp.offer(2)).status = 'accepted');
select pg_temp.expect('A est notifié de la vente (offer_sold) à 40 avec le pseudo de B ; pas de « offer_accepted » pour A', (select (amount, actor_name) from public.{{P}}notifications where user_id = :A and kind = 'offer_sold' order by id desc limit 1) = (40, :'nb'::text) and pg_temp.notif(:A, 'offer_accepted') = 0);

\echo '--- 3. refus : par le propriétaire (offre de l''acheteur) et par l''acheteur (contre-offre)'
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 3, 5) ->> 'offer_id' as o3 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}respond_offer(:o3, false);
select pg_temp.expect('A refuse l''offre de B : refusée, B notifié (offer_declined), la carte reste à A', (pg_temp.offer(3)).status = 'declined' and pg_temp.notif(:B, 'offer_declined') = 1 and pg_temp.owner(3) = :A::uuid);
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 4, 5) ->> 'offer_id' as o4 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o4, 60);
set request.jwt.claim.sub = :B;
select public.{{P}}respond_offer(:o4, false);
select pg_temp.expect('B refuse la contre-offre : refusée ; A est notifié (offer_counter_declined, pas « offer_declined »)', (pg_temp.offer(4)).status = 'declined' and pg_temp.notif(:A, 'offer_counter_declined') = 1 and pg_temp.notif(:A, 'offer_declined') = 0 and pg_temp.owner(4) = :A::uuid);
select pg_temp.expect('une offre refusée ne peut plus recevoir de réponse ni de contre-offre (offer_unavailable)', pg_temp.err('select public.{{P}}respond_offer(' || :o4 || ', true)') like '%offer_unavailable%' and pg_temp.err('select public.{{P}}counter_offer(' || :o4 || ', 9)') like '%offer_unavailable%');

\echo '--- 4. retirer sa proposition'
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 5, 8) ->> 'offer_id' as o5 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o5, 35);
select pg_temp.expect('A retire sa contre-offre : l''offre est annulée', (public.{{P}}cancel_offer(:o5) ->> 'ok')::boolean and (pg_temp.offer(5)).status = 'cancelled');
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 5, 12) ->> 'offer_id' as o5b \gset
select public.{{P}}cancel_offer(:o5b);
select pg_temp.expect('B retire sa propre offre (comme avant) : annulée', (pg_temp.offer(5)).status = 'cancelled');

\echo '--- 5. B refait une offre pendant une contre-offre : sa nouvelle proposition remplace la contre-offre'
select public.{{P}}make_offer(:t1, 'common', 20, 6, 10) ->> 'offer_id' as o6 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o6, 50);
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 6, 15) ->> 'offer_id' as o6b \gset
select pg_temp.expect('même ligne (une seule offre en cours par acheteur et carte), montant 15, de nouveau proposée par B, échanges conservés (1)', :o6b = :o6 and (select (amount, proposed_by, rounds) from public.{{P}}offers where id = :o6) = (15, :B::uuid, 1));

\echo '--- 6. au plus 6 contre-offres'
select public.{{P}}make_offer(:t1, 'common', 20, 7, 10) ->> 'offer_id' as o7 \gset
do $$ declare i int; begin
  for i in 1..6 loop
    perform set_config('request.jwt.claim.sub', case when i % 2 = 1 then '11111111-1111-1111-1111-111111111111' else '22222222-2222-2222-2222-222222222222' end, false);
    perform public.{{P}}counter_offer((select id from public.{{P}}offers where series = 20 and number = 7 and status = 'pending'), 10 + i * 5);
  end loop;
end $$;
select pg_temp.expect('6 contre-offres échangées : le compteur est à 6', (pg_temp.offer(7)).rounds = 6);
set request.jwt.claim.sub = :A;
select pg_temp.expect('la 7e contre-offre est refusée (too_many_counters) alors que A est bien le destinataire ; il peut encore accepter ou refuser', pg_temp.err('select public.{{P}}counter_offer(' || :o7 || ', 99)') like '%too_many_counters%' and (select waiting_on_me from public.{{P}}my_offers() where offer_id = :o7) = true);

\echo '--- 7. conditions d''acceptation'
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 9, 10) ->> 'offer_id' as o9 \gset
set request.jwt.claim.sub = :A;
select public.{{P}}counter_offer(:o9, 500);
set request.jwt.claim.sub = :B;
select pg_temp.coins(:B) as cb2 \gset
select pg_temp.expect('B accepte une contre-offre de 500 sans avoir assez : refusé (not_enough_coins, message de l''acheteur), l''offre reste en attente, rien ne bouge', pg_temp.err('select public.{{P}}respond_offer(' || :o9 || ', true)') like '%not_enough_coins%' and (pg_temp.offer(9)).status = 'pending' and pg_temp.owner(9) = :A::uuid and pg_temp.coins(:B) = :cb2);
set request.jwt.claim.sub = :B;
select public.{{P}}make_offer(:t1, 'common', 20, 8, 99999) ->> 'offer_id' as o8 \gset
set request.jwt.claim.sub = :A;
select pg_temp.expect('A accepte une offre que B ne peut pas payer : buyer_insufficient_coins (message du vendeur)', pg_temp.err('select public.{{P}}respond_offer(' || :o8 || ', true)') like '%buyer_insufficient_coins%' and (pg_temp.offer(8)).status = 'pending');
set request.jwt.claim.sub = :C;
select pg_temp.expect('tiers (C) : not_owner pour répondre, contre-proposer et retirer', pg_temp.err('select public.{{P}}respond_offer(' || :o8 || ', true)') like '%not_owner%' and pg_temp.err('select public.{{P}}counter_offer(' || :o8 || ', 5)') like '%not_owner%' and pg_temp.err('select public.{{P}}cancel_offer(' || :o8 || ')') like '%not_owner%');
set request.jwt.claim.sub = :A;
-- la carte change de main : plus de négociation possible
update public.{{P}}cards set owner_id = :C where series = 20 and number = 8;
select pg_temp.expect('la carte a été vendue à quelqu''un d''autre : contre-offre impossible (offer_unavailable) et acceptation refusée (not_owner)', pg_temp.err('select public.{{P}}counter_offer(' || :o8 || ', 5)') like '%offer_unavailable%' and pg_temp.err('select public.{{P}}respond_offer(' || :o8 || ', true)') like '%not_owner%');
-- carte placée dans l'album du propriétaire
update public.{{P}}cards set owner_id = :A where series = 20 and number = 8;
select public.{{P}}auto_place_album(:A, :t1, 'common', 20, 8);
select pg_temp.expect('carte rangée dans l''album du vendeur : acceptation refusée (card_in_album)', pg_temp.err('select public.{{P}}respond_offer(' || :o8 || ', true)') like '%card_in_album%');

\echo '--- 8. compatibilité et droits'
select pg_temp.expect('anciens appels : respond_offer(id, accepter) toujours à deux paramètres ; counter_offer ouverte aux joueurs connectés seulement', has_function_privilege('authenticated', 'public.{{P}}respond_offer(bigint, boolean)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}counter_offer(bigint, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}counter_offer(bigint, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}respond_offer(bigint, boolean)', 'execute'));
select pg_temp.expect('les nouvelles notifications sont acceptées par la base (offer_countered, offer_sold, offer_counter_declined)', pg_temp.notif(:B, 'offer_countered') >= 1 and pg_temp.notif(:A, 'offer_sold') = 1 and pg_temp.notif(:A, 'offer_counter_declined') = 1);
-- nettoyage
delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}cards where owner_id in (:A, :B, :C); delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name = 'Nego Param';
update public.{{P}}categories set closed = false;
