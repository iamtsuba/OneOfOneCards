set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select o1ocards_status() is not null as a;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select o1ocards_status() is not null as b;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; select o1ocards_status() is not null as c;
update o1ocards_profiles set coins = 1000;
select min(id) as t1 from o1ocards_types where category_id = 1 \gset
select (array_agg(id order by id))[2] as t2, (array_agg(id order by id))[3] as t3 from o1ocards_types where category_id = 1 \gset
select min(id) as t4 from o1ocards_types where category_id = 2 \gset
-- cartes de la production : toutes les tranches (Ultra 1-35, Super 36-100, Rare 101-250, Commune 251+), Unique, Alpha, Omega
insert into o1ocards_cards (type_id, series, number, owner_id) values
  (:t1, 1, 1, '11111111-1111-1111-1111-111111111111'),                                     -- Unique
  (:t1, 2, 1, '11111111-1111-1111-1111-111111111111'), (:t1, 2, 2, '11111111-1111-1111-1111-111111111111'),   -- Alpha, Omega (série complète)
  (:t1, 10, 3, '11111111-1111-1111-1111-111111111111'), (:t1, 35, 12, '22222222-2222-2222-2222-222222222222'), (:t1, 35, 35, '11111111-1111-1111-1111-111111111111'),
  (:t1, 36, 4, '11111111-1111-1111-1111-111111111111'), (:t1, 60, 5, '11111111-1111-1111-1111-111111111111'), (:t1, 100, 50, '22222222-2222-2222-2222-222222222222'),
  (:t1, 101, 7, '11111111-1111-1111-1111-111111111111'), (:t1, 250, 100, '33333333-3333-3333-3333-333333333333'),
  (:t1, 251, 3, '22222222-2222-2222-2222-222222222222'), (:t1, 251, 4, '22222222-2222-2222-2222-222222222222'), (:t1, 400, 200, '11111111-1111-1111-1111-111111111111'), (:t1, 500, 1, '33333333-3333-3333-3333-333333333333'), (:t1, 500, 500, '33333333-3333-3333-3333-333333333333'),
  (:t2, 20, 8, '11111111-1111-1111-1111-111111111111'), (:t2, 150, 30, '11111111-1111-1111-1111-111111111111'), (:t2, 300, 77, '22222222-2222-2222-2222-222222222222'),
  (:t3, 1, 1, '22222222-2222-2222-2222-222222222222'), (:t3, 480, 241, '33333333-3333-3333-3333-333333333333'),
  (:t4, 36, 36, '11111111-1111-1111-1111-111111111111'), (:t4, 99, 98, '33333333-3333-3333-3333-333333333333'), (:t4, 260, 12, '22222222-2222-2222-2222-222222222222');
-- ce que le jeu AFFICHE aujourd'hui pour chaque carte (fonction de rareté actuelle de la production)
create table avant_cartes as select type_id, series, number, owner_id, o1ocards_rarity_id(number, series, type_id) as rarite from o1ocards_cards;
-- marché : annonce à prix fixe, enchère avec une mise, offre directe, favori
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (o1ocards_list_card(:t1, 60, 5, 'buy_now', 7) ->> 'listing_id')::bigint as l_fixe \gset
select (o1ocards_list_card(:t1, 10, 3, 'auction', null) ->> 'listing_id')::bigint as l_enchere \gset
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select o1ocards_place_bid(:l_enchere, 6) is not null as mise_b;
select o1ocards_make_offer(:t1, 101, 7, 4) is not null as offre_b;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select o1ocards_toggle_favorite(:t1, 60, 5) is not null as favori_c;
select o1ocards_toggle_favorite(:t1, 250, 100) is not null as favori_c2;
-- choix d'album (ancien modèle : un exemplaire par type) et une victoire « 1/1 »
insert into o1ocards_album_picks (user_id, type_id, series, number) values ('11111111-1111-1111-1111-111111111111', :t1, 36, 4), ('11111111-1111-1111-1111-111111111111', :t2, 20, 8), ('22222222-2222-2222-2222-222222222222', :t1, 251, 3);
insert into o1ocards_unique_wins (user_id, type_id) values ('11111111-1111-1111-1111-111111111111', :t1);
create table avant_comptes as select 'cards' k, count(*) n from o1ocards_cards union all select 'listings', count(*) from o1ocards_listings union all select 'bids', count(*) from o1ocards_bids union all select 'offers', count(*) from o1ocards_offers
  union all select 'favorites', count(*) from o1ocards_favorites union all select 'notifications', count(*) from o1ocards_notifications union all select 'album_picks', count(*) from o1ocards_album_picks
  union all select 'unique_wins', count(*) from o1ocards_unique_wins union all select 'profiles', count(*) from o1ocards_profiles;
select string_agg(k || '=' || n, ' ' order by k) as avant from avant_comptes;
select rarite, count(*) as cartes from avant_cartes group by rarite order by 2 desc;
