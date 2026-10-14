\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;

delete from public.{{P}}album_picks;
delete from public.{{P}}cards where type_id = 1;
delete from public.{{P}}listings where type_id = 1;
delete from public.{{P}}type_rarities where type_id = 1;
update public.{{P}}types set series_count = null where id = 1;
update public.{{P}}categories set closed = false where id = (select category_id from public.{{P}}types where id = 1);
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :A;
select category_id as cat from public.{{P}}types where id = 1 \gset
-- A possède : 2 cartes « du milieu » de la série 10, la 1/10 (Alpha), la 10/10 (Omega) et la 1/1 (Unique)
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 10, 3, :A), (1, 10, 7, :A), (1, 10, 1, :A), (1, 10, 10, :A), (1, 1, 1, :A);

\echo '=== un emplacement par rareté de la carte : tranches du type puis Unique, Alpha, Omega (du plus commun au plus rare)'
select string_agg(rarity_id, ' > ' order by ord) as emplacements_du_type_1 from (select rarity_id, row_number() over () as ord from public.{{P}}album_view(:cat) where type_id = 1) x;
select rarity_id, owned_count, pick_series is null as vide from public.{{P}}album_view(:cat) where type_id = 1 order by owned_count desc, rarity_id;

\echo '=== choisir une carte la place dans SA rareté ; impossible de choisir une carte qui ne m''appartient pas'
select public.{{P}}set_album_pick(1, 10, 3) ->> 'rarity_id' as rarete_de_la_carte_choisie;
set request.jwt.claim.sub = :B;
select pg_temp.try('select public.{{P}}set_album_pick(1, 10, 3)');  -- refusée : appartient à A
set request.jwt.claim.sub = :A;

\echo '=== une même carte dans plusieurs raretés : toutes visibles en même temps dans l''album'
select public.{{P}}set_album_pick(1, 10, 1) ->> 'rarity_id' as alpha_choisie;
select public.{{P}}set_album_pick(1, 10, 10) ->> 'rarity_id' as omega_choisie;
select public.{{P}}set_album_pick(1, 1, 1) ->> 'rarity_id' as unique_choisie;
select rarity_id, pick_series, pick_number from public.{{P}}album_view(:cat) where type_id = 1 and pick_series is not null order by rarity_id;

\echo '=== changer librement l''exemplaire d''un emplacement, sans toucher aux autres'
select public.{{P}}set_album_pick(1, 10, 7) ->> 'rarity_id' as changee;
select rarity_id, pick_number from public.{{P}}album_view(:cat) where type_id = 1 and pick_series is not null order by rarity_id;

\echo '=== mes exemplaires par rareté (pour le sélecteur)'
select (select count(*) from public.{{P}}my_type_cards(1)) as tous, (select count(*) from public.{{P}}my_type_cards(1, 'ultra')) as ultra,
       (select count(*) from public.{{P}}my_type_cards(1, 'alpha')) as alpha, (select count(*) from public.{{P}}my_type_cards(1, 'rare')) as rare_aucune;

\echo '=== une carte placée dans l''album ne peut pas être vendue (banque, marché) ; elle reste dans l''album'
select pg_temp.try('select public.{{P}}sell_direct(1, 10, 7)');                       -- carte_in_album
select pg_temp.try('select public.{{P}}list_card(1, 10, 7, ''buy_now'', 5)');         -- card_in_album
select rarity_id, pick_number from public.{{P}}album_view(:cat) where type_id = 1 and pick_series is not null order by rarity_id;
select count(*) as cartes_toujours_possedees from public.{{P}}cards where type_id = 1 and owner_id = :A;

\echo '=== vider l''emplacement libère la carte : elle peut alors être revendue'
select public.{{P}}clear_album_pick(1, 'ultra') ->> 'ok' as ultra_videe;
select public.{{P}}sell_direct(1, 10, 7) ->> 'status' is not null as revendue_une_fois_libre;
select rarity_id, pick_number from public.{{P}}album_view(:cat) where type_id = 1 and pick_series is not null order by rarity_id;

\echo '=== une carte en vente ne peut pas entrer dans l''album'
select (public.{{P}}list_card(1, 10, 3, 'buy_now', 1)->>'listing_id')::bigint as lid \gset
select pg_temp.try('select public.{{P}}set_album_pick(1, 10, 3)');                    -- card_listed
select (select listed from public.{{P}}my_type_cards(1, 'ultra') where number = 3) as carte_signalee_en_vente;

\echo '=== filet de sécurité : si un choix existait malgré tout sur une carte vendue, il est retiré (insertion directe)'
insert into public.{{P}}album_picks (user_id, type_id, rarity_id, series, number) values (:A, 1, 'ultra', 10, 3);
select count(*) as choix_present_avant_la_vente from public.{{P}}album_picks where user_id = :A and rarity_id = 'ultra';
set request.jwt.claim.sub = :B;
select public.{{P}}buy_now(:lid) is not null as achetee_par_b;
set request.jwt.claim.sub = :A;
select count(*) as choix_retire_apres_la_vente from public.{{P}}album_picks where user_id = :A and rarity_id = 'ultra';

\echo '=== choix périmé : si les raretés du type changent, un choix dont la rareté n''existe plus n''est pas affiché'
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series) values (1, 'super', 10, 10), (1, 'common', 500, 0);
select string_agg(rarity_id, ', ' order by rarity_id) as emplacements_avec_les_nouvelles_raretes from public.{{P}}album_view(:cat) where type_id = 1;
select count(*) as choix_affiches_de_la_rareté_disparue from public.{{P}}album_view(:cat) where type_id = 1 and rarity_id = 'ultra';
delete from public.{{P}}type_rarities where type_id = 1;
update public.{{P}}types set series_count = null where id = 1;

delete from public.{{P}}album_picks;
delete from public.{{P}}cards where type_id = 1;
