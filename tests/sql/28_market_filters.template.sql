-- Marché > À vendre : filtre par rareté, filtre « non possédées », indication i_own, filtres appliqués avant la limite.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
delete from public.{{P}}listings; delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Filtres Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'T1', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'T2', '🐶', 2, false) returning id as t2 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t, r, 6, case r when 'common' then 0 else 6 end, 'simple' from (values (:t1), (:t2)) x(t) cross join (values ('common'), ('rare')) y(r);
-- B possède et vend 4 cartes ; A possède une Commune de T1 et une Rare de T2 (deux emplacements déjà remplis)
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:t1, 'common', 5, 3, :B), (:t1, 'rare', 5, 3, :B), (:t2, 'common', 5, 2, :B), (:t2, 'rare', 5, 3, :B),
  (:t1, 'common', 5, 4, :A), (:t2, 'rare', 5, 2, :A);
set request.jwt.claim.sub = :B;
select public.{{P}}list_card(:t1, 'common', 5, 3, 'buy_now', 10) ->> 'listing_id' as l1 \gset
select public.{{P}}list_card(:t1, 'rare', 5, 3, 'buy_now', 20) ->> 'listing_id' as l2 \gset
select public.{{P}}list_card(:t2, 'common', 5, 2, 'auction', 5) ->> 'listing_id' as l3 \gset
select public.{{P}}list_card(:t2, 'rare', 5, 3, 'buy_now', 30) ->> 'listing_id' as l4 \gset
set request.jwt.claim.sub = :A;
create temp table m_all as select * from public.{{P}}market_list();
select pg_temp.expect('sans filtre : les 4 annonces, avec i_own : vrai pour T1 commune et T2 rare (emplacements déjà remplis), faux pour T1 rare et T2 commune',
  (select count(*) from m_all) = 4 and (select i_own from m_all where listing_id = :l1) and not (select i_own from m_all where listing_id = :l2) and not (select i_own from m_all where listing_id = :l3) and (select i_own from m_all where listing_id = :l4));
select pg_temp.expect('appel ancien (4 paramètres) : inchangé', (select count(*) from public.{{P}}market_list('buy_now', 'price', 10, 0)) = 3);
create temp table m_missing as select * from public.{{P}}market_list(null, 'ending', 40, 0, null, true);
select pg_temp.expect('« non possédées » : seulement les cartes dont l''emplacement me manque (T1 rare, T2 commune), total = 2', (select array_agg(listing_id order by listing_id) from m_missing) = array[:l2::bigint, :l3::bigint] and (select max(total) from m_missing) = 2 and (select bool_and(not i_own) from m_missing));
select pg_temp.expect('filtre par rareté « rare » : T1 rare et T2 rare', (select array_agg(listing_id order by listing_id) from public.{{P}}market_list(null, 'ending', 40, 0, 'rare', false)) = array[:l2::bigint, :l4::bigint]);
select pg_temp.expect('filtre par rareté « common » : T1 commune et T2 commune', (select array_agg(listing_id order by listing_id) from public.{{P}}market_list(null, 'ending', 40, 0, 'common', false)) = array[:l1::bigint, :l3::bigint]);
select pg_temp.expect('rareté + non possédées : seule la T1 rare', (select array_agg(listing_id) from public.{{P}}market_list(null, 'ending', 40, 0, 'rare', true)) = array[:l2::bigint]);
select pg_temp.expect('type d''annonce + non possédées : enchères manquantes = T2 commune ; achats directs manquants = T1 rare', (select array_agg(listing_id) from public.{{P}}market_list('auction', 'ending', 40, 0, null, true)) = array[:l3::bigint] and (select array_agg(listing_id) from public.{{P}}market_list('buy_now', 'ending', 40, 0, null, true)) = array[:l2::bigint]);
select pg_temp.expect('rareté inconnue : aucune annonce ; rareté vide ou nulle : toutes', (select count(*) from public.{{P}}market_list(null, 'ending', 40, 0, 'nimporte_quoi', false)) = 0 and (select count(*) from public.{{P}}market_list(null, 'ending', 40, 0, '', false)) = 4 and (select count(*) from public.{{P}}market_list(null, 'ending', 40, 0, null, null)) = 4);
select pg_temp.expect('la limite s''applique APRÈS les filtres : 1 annonce renvoyée mais total = 2 ; décalage (offset) idem', (select count(*) from public.{{P}}market_list(null, 'price', 1, 0, null, true)) = 1 and (select max(total) from public.{{P}}market_list(null, 'price', 1, 0, null, true)) = 2
  and (select listing_id from public.{{P}}market_list(null, 'price', 1, 1, null, true)) = :l2::bigint);
select pg_temp.expect('tri par prix conservé avec les filtres : T2 commune (enchère 5) avant T1 rare (20)', (select array_agg(listing_id order by ord) from (select listing_id, row_number() over () as ord from public.{{P}}market_list(null, 'price', 40, 0, null, true)) z) = array[:l3::bigint, :l2::bigint]);
-- mon annonce : ma carte, jamais « manquante »
select public.{{P}}list_card(:t2, 'rare', 5, 2, 'buy_now', 99) ->> 'listing_id' as l5 \gset
select pg_temp.expect('ma propre annonce : i_own vrai, is_mine vrai, absente du filtre « non possédées »', (select (i_own, is_mine) from public.{{P}}market_list() where listing_id = :l5) = (true, true) and not exists (select 1 from public.{{P}}market_list(null, 'ending', 40, 0, null, true) where listing_id = :l5));
-- obtenir une carte la retire des « manquantes »
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:t1, 'rare', 5, 2, :A);
select pg_temp.expect('après avoir obtenu une Rare de T1 : l''annonce T1 rare n''est plus « non possédée » (i_own vrai) et sort du filtre', (select i_own from public.{{P}}market_list() where listing_id = :l2) and not exists (select 1 from public.{{P}}market_list(null, 'ending', 40, 0, null, true) where listing_id = :l2));
select pg_temp.expect('droits : réservé aux joueurs connectés', has_function_privilege('authenticated', 'public.{{P}}market_list(text, text, int, int, text, boolean)', 'execute') and not has_function_privilege('anon', 'public.{{P}}market_list(text, text, int, int, text, boolean)', 'execute'));
-- nettoyage
delete from public.{{P}}listings; delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name = 'Filtres Param';
update public.{{P}}categories set closed = false;
