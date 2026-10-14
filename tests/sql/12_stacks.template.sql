\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;


-- Adaptateur : les colonnes lisibles d'une tuile de « Mes cartes » (list_collection), toutes pages confondues
create or replace function pg_temp.cv(p_cat int, p_type int default null, p_rarity text default null)
returns table (kind text, type_id int, series int, number int, rarity_id text, qty int, sellable int, in_album boolean)
language sql as $$
  select case when is_stack then 'stack' else 'card' end, card_type, card_series, card_number, rarity_id, stack_qty, stack_free, in_album
  from public.{{P}}list_collection(p_cat, p_type, p_rarity, 'series', 200, 0)
$$;

delete from public.{{P}}album_picks; delete from public.{{P}}offers; delete from public.{{P}}notifications;
delete from public.{{P}}listings; delete from public.{{P}}cards;
delete from public.{{P}}type_rarities where type_id in (1, 2);
update public.{{P}}types set series_count = null where id in (1, 2);
select category_id as cat from public.{{P}}types where id = 1 \gset
update public.{{P}}categories set closed = false, enabled = true where id = :cat;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :A;

-- Type 1 : Ultra Rare sur les séries 1 à 20 (numéros visibles seulement pour les 3 premières séries), Commune de 21 à 100 (jamais visibles)
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series) values (1, 'ultra', 20, 3), (1, 'common', 100, 0);
update public.{{P}}types set series_count = 100 where id = 1;
insert into public.{{P}}cards (type_id, series, number, owner_id)
select 1, 30, n, :A from generate_series(2, 9) n;                                  -- 8 communes à numéro masqué
insert into public.{{P}}cards (type_id, series, number, owner_id) values
  (1, 31, 2, :A), (1, 31, 3, :A),                                                  -- 2 communes de plus : 10 en tout
  (1, 3, 2, :A),                                                                   -- Ultra Rare à numéro VISIBLE (série 3)
  (1, 10, 5, :A),                                                                  -- Ultra Rare à numéro masqué (série 10)
  (1, 2, 1, :A), (1, 2, 2, :A), (1, 1, 1, :A),                                     -- Alpha, Omega et Unique à numéro visible
  (1, 15, 1, :A), (1, 15, 15, :A);                                                 -- Alpha et Omega à numéro masqué

\echo '=== ma collection : une ligne par carte à numéro visible, une pile par (type, rareté) pour les numéros masqués'
select kind, rarity_id, series, number, qty, sellable from pg_temp.cv(:cat) where type_id = 1 order by kind desc, rarity_id, series, number;
select count(*) as cartes_au_total, sum(qty) as somme_des_quantites from pg_temp.cv(:cat);
select (select count(*) from public.{{P}}cards where owner_id = :A) as cartes_en_base;
select count(*) as filtre_rarete_commune, max(qty) as quantite from pg_temp.cv(:cat, null, 'common');
select count(*) as filtre_autre_type from pg_temp.cv(:cat, 2, null);


\echo '=== cohérence : chaque tuile porte la rareté que donne rarity_id() ; totaux de tuiles et de cartes'
select count(*) as ecarts_de_rarete from public.{{P}}list_collection(:cat, null, null, 'series', 200, 0) t
where t.rarity_id is distinct from public.{{P}}rarity_id(t.card_number, t.card_series, t.card_type);
select max(total) as tuiles, max(cards_total) as cartes, (select count(*) from public.{{P}}cards where owner_id = :A) as cartes_en_base
from public.{{P}}list_collection(:cat, null, null, 'series', 200, 0);

\echo '=== pagination : deux pages d''une tuile ne se recoupent pas et couvrent tout'
create temp table pages as
  select 1 as p, card_type, card_series, card_number from public.{{P}}list_collection(:cat, null, null, 'series', 4, 0)
  union all select 2, card_type, card_series, card_number from public.{{P}}list_collection(:cat, null, null, 'series', 4, 4)
  union all select 3, card_type, card_series, card_number from public.{{P}}list_collection(:cat, null, null, 'series', 4, 8);
select count(*) as tuiles_lues, count(distinct (card_type, card_series, card_number)) as tuiles_distinctes,
       (select max(total) from public.{{P}}list_collection(:cat, null, null, 'series', 1, 0)) as tuiles_annoncees from pages;
select card_series, card_number, is_stack, stack_qty from public.{{P}}list_collection(:cat, null, 'common', 'series', 1, 0);

\echo '=== tri par rareté : la plus rare d''abord ; tri récent sans erreur'
select string_agg(distinct rarity_id, ',') as raretes_presentes, (select rarity_id from public.{{P}}list_collection(:cat, null, null, 'rarity', 1, 0)) as premiere_en_tri_rarete
from public.{{P}}list_collection(:cat, null, null, 'series', 200, 0);
select count(*) as tri_recent_ok from public.{{P}}list_collection(:cat, null, null, 'recent', 200, 0);

\echo '=== un type sans réglage propre : tous les numéros visibles, donc aucune pile'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (2, 20, 5, :A), (2, 20, 6, :A);
select kind, count(*) from pg_temp.cv(:cat, 2, null) group by kind;
delete from public.{{P}}cards where type_id = 2;

\echo '=== une carte de la pile placée dans l''album : elle n''est plus vendable, la pile le signale'
select public.{{P}}set_album_pick(1, 30, 2) ->> 'rarity_id' as commune_choisie;
select public.{{P}}set_album_pick(1, 3, 2) ->> 'rarity_id' as ultra_visible_choisie;
select kind, rarity_id, qty, sellable, in_album from pg_temp.cv(:cat) where type_id = 1 and rarity_id in ('common', 'ultra') order by rarity_id, kind desc;
select pg_temp.try('select public.{{P}}sell_direct(1, 30, 2)');                       -- card_in_album
select pg_temp.try('select public.{{P}}sell_direct(1, 3, 2)');                        -- card_in_album
select pg_temp.try('select public.{{P}}list_card(1, 30, 2, ''buy_now'', 3)');         -- card_in_album

\echo '=== vente rapide de plusieurs cartes : tout ou rien, jamais la carte de l''album'
select pg_temp.try('select public.{{P}}sell_direct_many(1, ''common'', 10)');         -- not_enough_cards : 9 vendables seulement
select pg_temp.try('select public.{{P}}sell_direct_many(1, ''common'', 0)');          -- invalid_count
select count(*) as communes_toujours_la from public.{{P}}cards where type_id = 1 and series in (30, 31) and owner_id = :A;
select coins as coins_avant from public.{{P}}profiles where id = :A \gset
select (public.{{P}}sell_direct_many(1, 'common', 9) ->> 'sold')::int as cartes_vendues;
select (select coins from public.{{P}}profiles where id = :A) - :coins_avant = 9 * public.{{P}}cfg('direct_sell_price')::int as gain_exact_neuf_fois_le_prix;
select kind, qty, sellable, in_album from pg_temp.cv(:cat) where type_id = 1 and rarity_id = 'common';
select count(*) as carte_de_l_album_conservee from public.{{P}}cards where type_id = 1 and series = 30 and number = 2 and owner_id = :A;
select count(*) as choix_d_album_conserve from public.{{P}}album_picks where user_id = :A and type_id = 1 and rarity_id = 'common';
select pg_temp.try('select public.{{P}}sell_direct_many(1, ''common'', 1)');          -- not_enough_cards : plus rien de vendable

\echo '=== vente rapide : refusée si la catégorie est terminée'
update public.{{P}}categories set closed = true where id = :cat;
select pg_temp.try('select public.{{P}}sell_direct_many(1, ''ultra'', 1)');           -- category_closed
update public.{{P}}categories set closed = false where id = :cat;

\echo '=== mise en vente d''UNE carte de la pile, une par une'
select (public.{{P}}list_stack_card(1, 'ultra', 'buy_now', 5) ->> 'listing_id')::bigint as lid \gset
select count(*) as annonces_actives from public.{{P}}listings where type_id = 1 and series = 10 and number = 5 and status = 'active';
select kind, qty, sellable from pg_temp.cv(:cat) where type_id = 1 and rarity_id = 'ultra' and kind = 'stack';
select pg_temp.try('select public.{{P}}list_stack_card(1, ''ultra'', ''buy_now'', 5)');   -- not_enough_cards : l'unique carte masquée est en vente
select pg_temp.try('select public.{{P}}list_stack_card(1, ''common'', ''buy_now'', 5)');  -- not_enough_cards : seule la carte de l'album reste
select pg_temp.try('select public.{{P}}list_stack_card(1, ''alpha'', ''lot'', 5)');       -- invalid_kind
select (public.{{P}}list_stack_card(1, 'alpha', 'auction') ->> 'listing_id') is not null as alpha_masquee_mise_aux_encheres;

\echo '=== accepter une offre = vendre : refusé pour une carte de l''album (le refus reste possible)'
set request.jwt.claim.sub = :B;
select public.{{P}}status() is not null as b;
select (public.{{P}}make_offer(1, 30, 2, 3) ->> 'offer_id')::bigint as oid \gset
set request.jwt.claim.sub = :A;
select pg_temp.try(format('select public.{{P}}respond_offer(%s, true)', :oid));         -- card_in_album
select (public.{{P}}respond_offer(:oid, false) ->> 'status') is not null as offre_refusee_sans_probleme;
select count(*) as carte_toujours_a_a from public.{{P}}cards where type_id = 1 and series = 30 and number = 2 and owner_id = :A;

\echo '=== exemplaires d''un type : en vente / dans l''album signalés'
select count(*) filter (where picked) as dans_l_album, count(*) filter (where listed) as en_vente, count(*) as total from public.{{P}}my_type_cards(1);
select count(*) filter (where not visible) as numeros_masques, count(*) filter (where visible) as numeros_visibles, count(*) filter (where visible) = (select count(*) from public.{{P}}cards where owner_id = :A and type_id = 1 and public.{{P}}number_visible(series, type_id)) as indicateur_coherent_avec_number_visible from public.{{P}}my_type_cards(1);

\echo '=== un autre joueur ne voit rien de ma collection'
set request.jwt.claim.sub = :B;
select count(*) as collection_de_b from pg_temp.cv(:cat);
set request.jwt.claim.sub = :A;

delete from public.{{P}}album_picks; delete from public.{{P}}offers; delete from public.{{P}}notifications;
delete from public.{{P}}listings; delete from public.{{P}}cards;
delete from public.{{P}}type_rarities where type_id = 1;
update public.{{P}}types set series_count = null where id = 1;
