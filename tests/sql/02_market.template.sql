\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
-- Profils des trois joueurs de test, créés comme dans l'application (au premier appel d'une fonction)
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
-- état propre : catégorie 2 ouverte, quelques cartes pour A
delete from public.{{P}}cards; delete from public.{{P}}bids; delete from public.{{P}}listings;
update public.{{P}}categories set closed = false, series_count = 500;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
update public.{{P}}profiles set boosters = 50, coins = 0;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as c_profil;
update public.{{P}}profiles set coins = 100 where id = :B; update public.{{P}}profiles set coins = 50 where id = :C;
set request.jwt.claim.sub = :A;
select count(*) from (select public.{{P}}open_booster() from generate_series(1,3)) x;
create temp table ca as select type_id, series, number, row_number() over (order by type_id, series, number) rn from public.{{P}}cards where owner_id = :A limit 4;

\echo '=== MARCHÉ : achat direct'
select (public.{{P}}list_card(type_id, series, number, 'buy_now', 10)->>'listing_id') as lid from ca where rn=1 \gset
select pg_temp.try(format('select public.{{P}}sell_direct(%s,%s,%s)', type_id, series, number)) from ca where rn=1;
select pg_temp.try(format('select public.{{P}}list_card(%s,%s,%s,''buy_now'',5)', type_id, series, number)) from ca where rn=1;
select 'annonce vue par B avec le type', card_type = (select type_id from ca where rn=1) as type_ok, card_series, card_number, price, kind from (select set_config('request.jwt.claim.sub', :B, false)) s, public.{{P}}market_list();
set request.jwt.claim.sub = :B;
select pg_temp.try('select public.{{P}}buy_now(' || :lid || ')');
select 'propriétaire = B', owner_id = :B from public.{{P}}cards c join ca on ca.type_id=c.type_id and ca.series=c.series and ca.number=c.number and ca.rn=1;
select 'pièces A / B', (select coins from public.{{P}}profiles where id=:A) a, (select coins from public.{{P}}profiles where id=:B) b;

\echo '=== MARCHÉ : enchère jusqu à la clôture'
set request.jwt.claim.sub = :A;
select (public.{{P}}list_card(type_id, series, number, 'auction')->>'listing_id') as lid2 from ca where rn=2 \gset
set request.jwt.claim.sub = :B; select pg_temp.try('select public.{{P}}place_bid(' || :lid2 || ', 5)');
set request.jwt.claim.sub = :C; select pg_temp.try('select public.{{P}}place_bid(' || :lid2 || ', 8)');
select 'pièces B remboursé / C bloqué', (select coins from public.{{P}}profiles where id=:B) b, (select coins from public.{{P}}profiles where id=:C) c;
update public.{{P}}listings set ends_at = now() - interval '1 second' where id = :lid2;
set request.jwt.claim.sub = :A; select public.{{P}}status()->>'coins' as coins_vendeur_apres;
select 'carte -> C', owner_id = :C from public.{{P}}cards c join ca on ca.type_id=c.type_id and ca.series=c.series and ca.number=c.number and ca.rn=2;
set request.jwt.claim.sub = :C;
select card_type = (select type_id from ca where rn=2) as type_ok, card_series, card_number, rarity_id from public.{{P}}list_collection(null, null, null, 'recent', 10, 0);
select 'filtre par type', count(*) from public.{{P}}list_collection(null, (select type_id from ca where rn=2), null, 'series', 10, 0);
select 'filtre par autre catégorie (aucune)', count(*) from public.{{P}}list_collection(1, null, null, 'series', 10, 0) where false;

\echo '=== ALBUM : état d un type'
set request.jwt.claim.sub = :A;
select public.{{P}}type_state((select type_id from ca where rn=3), (select series from ca where rn=3)) as etat;
set request.jwt.claim.sub = :B;
select (public.{{P}}type_state((select type_id from ca where rn=3), (select series from ca where rn=3))->'taken') @> to_jsonb((select number from ca where rn=3)) as vu_comme_prise_par_un_autre;
select 'stats : catégories et types',
  jsonb_array_length(public.{{P}}my_stats()->'categories') cats, jsonb_array_length(public.{{P}}my_stats()->'types') types,
  public.{{P}}my_stats(1)->>'category_id' cat1, public.{{P}}my_stats(2)->>'total_cards' total2;
