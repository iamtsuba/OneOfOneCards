\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}album_picks;
delete from public.{{P}}cards where type_id = 1;
delete from public.{{P}}listings where type_id = 1;
update public.{{P}}categories set closed = false where id = (select category_id from public.{{P}}types where id = 1);
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :A;
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 10, 3, :A), (1, 10, 7, :A);

\echo '=== état initial : vide, mais 2 exemplaires possédés'
select pick_series, owned_count from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;

\echo '=== impossible de choisir une carte qui ne m''appartient pas'
select pg_temp.try('select public.{{P}}set_album_pick(1, 10, 3)');  -- OK, m''appartient
set request.jwt.claim.sub = :B;
select pg_temp.try('select public.{{P}}set_album_pick(1, 10, 3)');  -- refusée : appartient à A
set request.jwt.claim.sub = :A;

\echo '=== choisie, puis changée librement, toujours parmi mes exemplaires'
select pick_series, pick_number, rarity_id is not null as rarete_calculee
from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;
select public.{{P}}set_album_pick(1, 10, 7) ->> 'ok' as changee;
select pick_number = 7 as nouvelle_carte_affichee
from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;

\echo '=== my_type_cards liste bien mes deux exemplaires, triés'
select series, number from public.{{P}}my_type_cards(1);

\echo '=== revente directe de la carte choisie -> la case redevient vide'
select public.{{P}}sell_direct(1, 10, 7) ->> 'status' is not null as revendue;
select pick_series from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;

\echo '=== vidage explicite d''une case déjà vide : sans erreur'
select public.{{P}}set_album_pick(1, 10, 3) ->> 'ok' as repick;
select public.{{P}}clear_album_pick(1) ->> 'ok' as videe;
select pick_series from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;

\echo '=== vente sur le marché (achat direct) : la case de l''ACHETEUR, pas du vendeur, est concernée'
select public.{{P}}set_album_pick(1, 10, 3) ->> 'ok' as a_repick;
select (public.{{P}}list_card(1, 10, 3, 'buy_now', 1)->>'listing_id')::bigint as lid \gset
set request.jwt.claim.sub = :B;
select public.{{P}}buy_now(:lid) is not null as achetee_par_b;
set request.jwt.claim.sub = :A;
select pick_series from public.{{P}}album_view((select category_id from public.{{P}}types where id = 1)) where type_id = 1;  -- vide : A a perdu la carte

delete from public.{{P}}album_picks;
delete from public.{{P}}cards where type_id = 1;
