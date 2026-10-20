-- Une carte 1/1 n'est « Unique » que si le numéro de sa rareté est VISIBLE ; sinon c'est une carte ordinaire de sa rareté (jamais violette).
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
create temp table ub_backup as select * from public.{{P}}user_boosters;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
select exists (select 1 from public.{{P}}rarities where id = 'artrare') as had_art \gset
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('artrare', 'Art Rare', 'range', 50, 4, '#7c3aed', '#4c1d95', '#fff') on conflict (id) do nothing;
select id as uniq from public.{{P}}rarities where kind = 'unique' limit 1 \gset
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Vis Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
-- X1..X6 : Commune à numéros MASQUÉS (0 numérotée) + Art Rare à numéros VISIBLES ; Y : Commune masquée seulement ; Z : aucun réglage propre (numéros toujours visibles)
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'X' || g, '🎨', g, false from generate_series(1, 6) g;
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Y', '🐱', 7, false) returning id as y \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Z', '🐶', 8, false) returning id as z \gset
select min(id) as x1 from public.{{P}}types where category_id = :cat and name = 'X1' \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select t.id, r.rid, 5, case r.rid when 'common' then 0 else 5 end, 'simple' from public.{{P}}types t cross join (values ('common'), ('artrare')) r(rid) where t.category_id = :cat and t.name like 'X%';
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:y, 'common', 5, 0, 'simple');

\echo '--- rareté affichée'
select pg_temp.expect('Commune à numéros masqués : la 1/1 est une carte COMMUNE ordinaire (pas Unique), comme la 1/5 et la 5/5 (pas d''Alpha ni d''Omega)', public.{{P}}rarity_id(1, 1, :x1, 'common') = 'common' and public.{{P}}rarity_id(1, 5, :x1, 'common') = 'common' and public.{{P}}rarity_id(5, 5, :x1, 'common') = 'common' and public.{{P}}rarity_id(1, 1, :y, 'common') = 'common');
select pg_temp.expect('Art Rare à numéros visibles : la 1/1 est Unique, la 1/5 Alpha, la 5/5 Omega, la 3/5 Art Rare', public.{{P}}rarity_id(1, 1, :x1, 'artrare') = :'uniq' and public.{{P}}rarity_id(1, 5, :x1, 'artrare') = 'alpha' and public.{{P}}rarity_id(5, 5, :x1, 'artrare') = 'omega' and public.{{P}}rarity_id(3, 5, :x1, 'artrare') = 'artrare');
select pg_temp.expect('type sans réglage propre (numéros toujours visibles) : la 1/1 reste Unique', public.{{P}}rarity_id(1, 1, :z, 'common') = :'uniq');
delete from public.{{P}}types where id = :z;   -- Z (réglage par défaut, des milliers de cartes) n'est plus utile : les totaux ci-dessous sont ceux de X et Y seulement

\echo '--- emplacements d''album'
select pg_temp.expect('type X : Commune, Art Rare, Unique, Alpha, Omega ; type Y (aucune série visible) : Commune seulement, jamais d''Unique',
  (select count(*) from public.{{P}}type_album_slots(:x1)) = 5 and (select bool_and(true) from public.{{P}}type_album_slots(:x1) where rid = :'uniq')
  and (select array_agg(rid) from public.{{P}}type_album_slots(:y)) = array['common']);
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'W1', '🐾', 9, false) returning id as w1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'W2', '🐾', 10, false) returning id as w2 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:w1, 'common', 1, 0, 'simple'), (:w2, 'common', 1, 1, 'simple');
select pg_temp.expect('une seule série de 1 carte : à numéro masqué = un emplacement Commune ; à numéro visible = un emplacement Unique', (select array_agg(rid) from public.{{P}}type_album_slots(:w1)) = array['common'] and (select array_agg(rid) from public.{{P}}type_album_slots(:w2)) = array[:'uniq']);
delete from public.{{P}}types where id in (:w1, :w2);

\echo '--- statistiques : la somme des raretés égale toujours le nombre de cartes'
create temp table st as select e ->> 'id' as id, (e ->> 'total')::bigint as total from jsonb_array_elements(public.{{P}}my_stats(:cat) -> 'by_rarity') e;
select pg_temp.expect('totaux exacts : Commune 6x15 + 15 = 105 (la 1/1 comprise), Art Rare 6x6 = 36, Alpha 24, Omega 24, Unique 6 (les 6 Art Rare 1/1 seulement, aucune Commune 1/1), aucune autre',
  (select total from st where id = 'common') = 105 and (select total from st where id = 'artrare') = 36 and (select total from st where id = 'alpha') = 24 and (select total from st where id = 'omega') = 24 and (select total from st where id = :'uniq') = 6
  and (select coalesce(sum(total), 0) from st where id in ('rare', 'super', 'ultra')) = 0);
create temp table st2 as select (e ->> 'total')::bigint as total, e ->> 'id' as id from jsonb_array_elements(public.{{P}}my_stats(:cat) -> 'by_rarity') e;
select pg_temp.expect('cartes comptées exactement une fois : somme des raretés = nombre de cartes de la catégorie', (select sum(total) from st2) = (select (e ->> 'total')::bigint from jsonb_array_elements(public.{{P}}my_stats(:cat) -> 'categories') e where (e ->> 'id')::int = :cat));

\echo '--- tirage'
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Seulement Unique', 1, '#111111', null, true, ('[{"position":1,"rarity_id":"' || :'uniq' || '","weight":100}]')::jsonb) ->> 'id')::int as bu \gset
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Seulement Commune', 5, '#222222', null, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"common","weight":1},{"position":5,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as bc \gset
delete from public.{{P}}user_boosters where user_id = :A; insert into public.{{P}}user_boosters (user_id, booster_type_id, quantity) values (:A, :bu, 6), (:A, :bc, 20);
create temp table du as select (c ->> 'type_id')::int as type_id, c ->> 'base_rarity' as base, (c ->> 'series')::int as series, c ->> 'rarity_id' as rid from (select public.{{P}}open_booster_of_type(:bu) as j from generate_series(1, 6)) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('booster « seulement Unique » : 6 tirages = les 6 Art Rare 1/1 (rareté de base Art Rare, série 1), aucune Commune 1/1 même si 7 existent et sont libres', (select count(*) from du) = 6 and (select count(*) from du where base = 'artrare' and series = 1 and rid = :'uniq') = 6 and (select count(distinct type_id) from du) = 6);
create temp table dc as select (c ->> 'type_id')::int as type_id, c ->> 'base_rarity' as base, (c ->> 'series')::int as series, c ->> 'rarity_id' as rid from (select public.{{P}}open_booster_of_type(:bc) as j from generate_series(1, 20)) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('booster « seulement Commune » : 100 des 105 cartes Commune, toutes affichées Commune ; au moins 2 des 7 cartes 1/1 sont sorties (cartes ordinaires), jamais une Unique', (select count(*) from dc) = 100 and (select count(*) from dc where rid = 'common') = 100 and (select count(*) from dc where series = 1) >= 2 and not exists (select 1 from dc where rid = :'uniq'));

\echo '--- journal des Unique gagnées'
select count(*) as wins0 from public.{{P}}unique_wins \gset
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:y, 'common', 1, 1, :B) on conflict do nothing;
select pg_temp.expect('une 1/1 à numéro masqué n''est pas une « Unique gagnée »', (select count(*) from public.{{P}}unique_wins) = :wins0);
delete from public.{{P}}cards where type_id = :y and series = 1 and number = 1;
select count(*) as wins1 from public.{{P}}unique_wins \gset
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:x1, 'artrare', 1, 1, :B) on conflict do nothing;
select pg_temp.expect('une 1/1 à numéro visible l''est', (select count(*) from public.{{P}}unique_wins) = :wins1 + 1 or exists (select 1 from public.{{P}}cards where type_id = :x1 and base_rarity = 'artrare' and series = 1 and number = 1 and owner_id = :B) is not null);
delete from public.{{P}}cards where owner_id = :B and type_id in (:x1, :y);

\echo '--- booster Gold : une Unique seulement sur une rareté à numéro visible'
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;   -- les cartes tirées plus haut libèrent leurs emplacements
create temp table gu as select c_type, c_base, c_series from (select (public.{{P}}gold_pick_card(:cat, 'unique', null, null, 0)).* from generate_series(1, 40)) q where c_type is not null;
select pg_temp.expect('tirage « unique » du Gold : uniquement des Art Rare 1/1 (jamais une Commune 1/1 à numéro masqué)', (select count(*) from gu) > 0 and not exists (select 1 from gu where c_base <> 'artrare' or c_series <> 1));
create temp table gp as select c_base, c_series from (select (public.{{P}}gold_pick_card(:cat, 'plain', 'common', null, 0)).* from generate_series(1, 120)) q where c_type is not null;
select pg_temp.expect('tirage « ordinaire Commune » du Gold : peut donner une 1/1 (carte ordinaire)', (select count(*) from gp) > 0 and exists (select 1 from gp where c_series = 1));

\echo '--- mise à jour des albums existants'
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:y, 'common', 1, 1, :A);
-- état d'avant : la 1/1 était rangée dans l'emplacement « Unique »
insert into public.{{P}}album_picks (user_id, type_id, rarity_id, base_rarity, series, number) values (:A, :y, :'uniq', 'common', 1, 1);
delete from public.{{P}}album_picks p where public.{{P}}rarity_id(p.number, p.series, p.type_id, p.base_rarity) <> p.rarity_id;
select public.{{P}}auto_place_album(c.owner_id, c.type_id, c.base_rarity, c.series, c.number) from public.{{P}}cards c where c.series = 1 and c.owner_id is not null and not public.{{P}}number_visible(c.type_id, c.base_rarity, 1);
select pg_temp.expect('l''ancien rangement « Unique » est retiré et la carte (ordinaire) prend l''emplacement Commune', not exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = :y and rarity_id = :'uniq') and exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = :y and rarity_id = 'common' and series = 1 and number = 1));
select pg_temp.expect('rejouer la mise à jour ne change plus rien', (select count(*) from public.{{P}}album_picks where user_id = :A) = 1);

-- nettoyage
delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks where user_id = :A;
delete from public.{{P}}categories where name = 'Vis Param';
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
delete from public.{{P}}rarities where id = 'artrare' and not :'had_art'::boolean;
update public.{{P}}categories set closed = false;
