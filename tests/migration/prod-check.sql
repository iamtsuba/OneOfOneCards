\echo === 1. totaux avant / après
select string_agg(k || '=' || n, ' ' order by k) as apres from (select 'cards' k, count(*) n from o1ocards_cards union all select 'listings', count(*) from o1ocards_listings union all select 'bids', count(*) from o1ocards_bids union all select 'offers', count(*) from o1ocards_offers
  union all select 'favorites', count(*) from o1ocards_favorites union all select 'notifications', count(*) from o1ocards_notifications union all select 'album_picks', count(*) from o1ocards_album_picks
  union all select 'unique_wins', count(*) from o1ocards_unique_wins union all select 'profiles', count(*) from o1ocards_profiles) x;
select (select string_agg(k || '=' || n, ' ' order by k) from avant_comptes) as avant;
\echo === 2. chaque carte garde-t-elle la rareté qu'elle AFFICHAIT ? (attendu 0 changement)
select count(*) as cartes_sans_rarete_de_base from o1ocards_cards where base_rarity is null;
select count(*) as raretes_changees from o1ocards_cards c join avant_cartes a using (type_id, series, number) where o1ocards_rarity_id(c.number, c.series, c.type_id, c.base_rarity) is distinct from a.rarite;
\echo === 3. les numéros restent-ils VISIBLES comme avant ? (attendu : 0 masqué, 0 pile)
select count(*) as numeros_masques from o1ocards_cards c where not o1ocards_number_visible(c.type_id, c.base_rarity, c.series);
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'Tom' as joueur, count(*) as tuiles, count(*) filter (where is_stack) as piles from o1ocards_list_collection(null, null, null, 'series', 200, 0);
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'Bea' as joueur, count(*) as tuiles, count(*) filter (where is_stack) as piles from o1ocards_list_collection(null, null, null, 'series', 200, 0);
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'Cleo' as joueur, count(*) as tuiles, count(*) filter (where is_stack) as piles from o1ocards_list_collection(null, null, null, 'series', 200, 0);
\echo === 4. réglages de raretés créés pour chaque type (type, rareté, séries, numérotées)
select type_id, string_agg(rarity_id || ' ' || max_series || '/' || numbered_series, ', ' order by max_series) as reglage from o1ocards_type_rarities where type_id in (select min(id) from o1ocards_types where category_id = 1 union select min(id) from o1ocards_types where category_id = 2) group by type_id order by 1;
\echo === 5. liens et compteurs
select (select count(*) from o1ocards_listings l join o1ocards_cards c on (c.type_id, c.base_rarity, c.series, c.number) = (l.type_id, l.base_rarity, l.series, l.number)) as annonces_liees,
       (select count(*) from o1ocards_offers o join o1ocards_cards c on (c.type_id, c.base_rarity, c.series, c.number) = (o.type_id, o.base_rarity, o.series, o.number)) as offres_liees,
       (select count(*) from o1ocards_favorites where base_rarity is not null) as favoris_ok,
       (select count(*) from o1ocards_notifications where type_id is null or card_base is not null) as notifs_ok,
       (select count(*) from o1ocards_series_taken s where s.taken <> (select count(*) from o1ocards_cards c where c.type_id = s.type_id and c.base_rarity = s.base_rarity and c.series = s.series)) as compteurs_faux;
select user_id::text like '11%' as tom, rarity_id, base_rarity, series, number from o1ocards_album_picks order by user_id, rarity_id;
