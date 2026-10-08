\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

-- État propre : A possède quelques cartes, B et C ont des pièces
delete from public.{{P}}notifications; delete from public.{{P}}offers; delete from public.{{P}}favorites;
delete from public.{{P}}cards; delete from public.{{P}}bids; delete from public.{{P}}listings;
update public.{{P}}categories set closed = false, series_count = 500;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
update public.{{P}}profiles set boosters = 50, coins = 0;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as b_profil;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as c_profil;
update public.{{P}}profiles set coins = 100 where id = :B; update public.{{P}}profiles set coins = 5 where id = :C;
set request.jwt.claim.sub = :A;
select count(*) from (select public.{{P}}open_booster() from generate_series(1,3)) x;
create temp table ca as select type_id, series, number, row_number() over (order by type_id, series, number) rn from public.{{P}}cards where owner_id = :A limit 4;

\echo '=== FAVORIS : mise en favori, interdit sur sa propre carte, notif à la mise en vente'
select pg_temp.try(format('select public.{{P}}toggle_favorite(%s,%s,%s)', type_id, series, number)) from ca where rn=1;
set request.jwt.claim.sub = :B;
select (public.{{P}}toggle_favorite(type_id, series, number)->>'favorited')::boolean as mis_en_favori from ca where rn=1;
select (public.{{P}}toggle_favorite(type_id, series, number)->>'favorited')::boolean as retire from ca where rn=1;
select (public.{{P}}toggle_favorite(type_id, series, number)->>'favorited')::boolean as remis from ca where rn=1;
set request.jwt.claim.sub = :A;
select (public.{{P}}list_card(type_id, series, number, 'buy_now', 7)->>'listing_id') as lid from ca where rn=1 \gset
set request.jwt.claim.sub = :B;
select 'notif favori reçue', kind, amount from public.{{P}}notifications_list(10) where kind = 'favorite_listed';
select card_type = (select type_id from ca where rn=1) as carte_ok, listing_price from public.{{P}}list_favorites() where card_number = (select number from ca where rn=1);

\echo '=== OFFRES : proposition, refus, acceptation'
set request.jwt.claim.sub = :C;
select pg_temp.try(format('select public.{{P}}make_offer(%s,%s,%s,3)', type_id, series, number)) from ca where rn=2;
select (public.{{P}}make_offer(type_id, series, number, 3)->>'offer_id')::bigint as oid_c from ca where rn=2 \gset
set request.jwt.claim.sub = :A;
select 'notif offre reçue', kind, amount, actor_name from public.{{P}}notifications_list(10) where kind = 'offer_received';
select pg_temp.try(format('select public.{{P}}respond_offer(%s, false)', :oid_c));
set request.jwt.claim.sub = :C;
select 'offre refusée, pièces inchangées', status, (select coins from public.{{P}}profiles where id=:C) as coins_c
from public.{{P}}my_offers() where offer_id = :oid_c;

set request.jwt.claim.sub = :B;
select (public.{{P}}make_offer(type_id, series, number, 20)->>'offer_id')::bigint as oid_b from ca where rn=2 \gset
-- Une nouvelle offre du même acheteur sur la même carte remplace la précédente (même montant mis à jour)
select (public.{{P}}make_offer(type_id, series, number, 25)->>'offer_id')::bigint = :oid_b as offre_mise_a_jour from ca where rn=2;
set request.jwt.claim.sub = :A;
select pg_temp.try(format('select public.{{P}}respond_offer(%s, true)', :oid_b));
select 'carte transférée à B', owner_id = :B from public.{{P}}cards c join ca on ca.type_id=c.type_id and ca.series=c.series and ca.number=c.number and ca.rn=2;
select 'pièces A / B après acceptation (25)', (select coins from public.{{P}}profiles where id=:A) a, (select coins from public.{{P}}profiles where id=:B) b;
set request.jwt.claim.sub = :B;
select 'notif offre acceptée', kind, amount from public.{{P}}notifications_list(10) where kind = 'offer_accepted';

\echo '=== OFFRES : refus pour sa propre carte, pièces insuffisantes, annulation par l acheteur'
set request.jwt.claim.sub = :A;
select pg_temp.try(format('select public.{{P}}make_offer(%s,%s,%s,1)', type_id, series, number)) from ca where rn=3;
set request.jwt.claim.sub = :C;
select (public.{{P}}make_offer(type_id, series, number, 999)->>'offer_id')::bigint as oid_big from ca where rn=3 \gset
set request.jwt.claim.sub = :A;
select pg_temp.try(format('select public.{{P}}respond_offer(%s, true)', :oid_big));
set request.jwt.claim.sub = :C;
select pg_temp.try(format('select public.{{P}}cancel_offer(%s)', :oid_big));
select 'offre annulée', status from public.{{P}}my_offers() where offer_id = :oid_big;

\echo '=== NOTIFICATIONS : tout marquer comme lu'
set request.jwt.claim.sub = :B;
select unread_total from public.{{P}}notifications_list(10) limit 1;
select public.{{P}}notifications_mark_read(null) is not null as marque_tout_lu;
select coalesce(bool_and(read), true) as tout_lu from public.{{P}}notifications_list(10);
