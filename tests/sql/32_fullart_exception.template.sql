-- Exception : la carte 1/1 d'une rareté nommée « Full Art Rare » reste une Full Art Rare (jamais Unique) ; les autres raretés visibles gardent leur Unique.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table ub_backup as select * from public.{{P}}user_boosters;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A; delete from public.{{P}}unique_wins;
select (select count(*) from public.{{P}}rarities where id in ('fartfull', 'fartvar', 'artcontrol')) as deja \gset
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('fartfull', 'Full Art Rare', 'range', 50, 3, '#d4a017', '#8a6410', '#fff'),
  ('fartvar', 'FULL-ART  rare', 'range', 50, 3, '#d4a017', '#8a6410', '#fff'),
  ('artcontrol', 'Art Rare', 'range', 50, 4, '#7c3aed', '#4c1d95', '#fff') on conflict (id) do nothing;
select id as uniq from public.{{P}}rarities where kind = 'unique' limit 1 \gset
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('FA Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'F' || g, '🐱', g, false from generate_series(1, 4) g;
select min(id) as f1 from public.{{P}}types where category_id = :cat \gset
select :f1 + 1 as f2, :f1 + 2 as f3, :f1 + 3 as f4 \gset
-- F1 : Full Art Rare, UNE seule carte 1/1 ; F2 : Full Art Rare 5 séries visibles ; F3 : Art Rare 1/1 (témoin : reste Unique) ; F4 : Full Art Rare à numéro masqué
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values
  (:f1, 'fartfull', 1, 1, 'fullart'), (:f2, 'fartfull', 5, 5, 'fullart'), (:f3, 'artcontrol', 1, 1, 'fullart'), (:f4, 'fartfull', 3, 0, 'fullart');

\echo '--- reconnaissance par le nom'
select pg_temp.expect('« Full Art Rare » reconnue (aussi « FULL-ART  rare ») ; pas l''Art Rare ni une rareté ordinaire', public.{{P}}is_fullart_rarity('fartfull') and public.{{P}}is_fullart_rarity('fartvar') and not public.{{P}}is_fullart_rarity('artcontrol') and not public.{{P}}is_fullart_rarity('common') and not public.{{P}}is_fullart_rarity('inconnue') and not public.{{P}}is_fullart_rarity(null));

\echo '--- rareté affichée'
select pg_temp.expect('LA carte 1/1 Full Art Rare (seule, sans non numérotée) reste une Full Art Rare : pas Unique, pas Alpha', public.{{P}}rarity_id(1, 1, :f1, 'fartfull') = 'fartfull');
select pg_temp.expect('une 1/1 d''une autre rareté visible garde son Unique (Art Rare, témoin) ; une 1/1 à numéro masqué reste ordinaire', public.{{P}}rarity_id(1, 1, :f3, 'artcontrol') = :'uniq' and public.{{P}}rarity_id(1, 1, :f4, 'fartfull') = 'fartfull');
select pg_temp.expect('séries de 5 cartes Full Art Rare : 1/5 Alpha, 5/5 Omega, 3/5 Full Art Rare, et la 1/1 de la série 1 reste Full Art Rare', public.{{P}}rarity_id(1, 5, :f2, 'fartfull') = 'alpha' and public.{{P}}rarity_id(5, 5, :f2, 'fartfull') = 'omega' and public.{{P}}rarity_id(3, 5, :f2, 'fartfull') = 'fartfull' and public.{{P}}rarity_id(1, 1, :f2, 'fartfull') = 'fartfull');

\echo '--- album'
select pg_temp.expect('album : F1 n''a qu''un emplacement, Full Art Rare (pas d''Unique) ; F3 (témoin) a son Unique ; F2 : Full Art Rare, Alpha, Omega', (select array_agg(rid) from public.{{P}}type_album_slots(:f1)) = array['fartfull'] and (select array_agg(rid) from public.{{P}}type_album_slots(:f3)) = array[:'uniq'] and (select array_agg(rid order by rid) from public.{{P}}type_album_slots(:f2)) = (select array_agg(id order by id) from public.{{P}}rarities where id = 'fartfull' or kind in ('alpha', 'omega')) and not exists (select 1 from public.{{P}}type_album_slots(:f2) where rid = :'uniq'));

\echo '--- statistiques'
create temp table st as select e ->> 'id' as id, (e ->> 'total')::bigint as total from jsonb_array_elements(public.{{P}}my_stats(:cat) -> 'by_rarity') e;
select pg_temp.expect('totaux : Full Art Rare 14 (F1 : 1 ; F2 : 6 du milieu + la 1/1 ; F4 : 6 cartes masquées), Unique 1 (F3 seulement), Alpha 4, Omega 4 ; Art Rare 0', (select total from st where id = 'fartfull') = 14 and (select total from st where id = :'uniq') = 1 and (select total from st where id = 'alpha') = 4 and (select total from st where id = 'omega') = 4 and coalesce((select total from st where id = 'artcontrol'), 0) = 0);
select pg_temp.expect('la somme des raretés égale le nombre de cartes de la catégorie (23)', (select sum(total) from st) = 23 and (select (e ->> 'total')::bigint from jsonb_array_elements(public.{{P}}my_stats(:cat) -> 'categories') e where (e ->> 'id')::int = :cat) = 23);

\echo '--- tirage'
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Full Art seulement', 1, '#111111', null, true, '[{"position":1,"rarity_id":"fartfull","weight":100}]'::jsonb) ->> 'id')::int as bf \gset
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Unique seulement', 1, '#222222', null, true, ('[{"position":1,"rarity_id":"' || :'uniq' || '","weight":100}]')::jsonb) ->> 'id')::int as bu \gset
delete from public.{{P}}user_boosters where user_id = :A; insert into public.{{P}}user_boosters (user_id, booster_type_id, quantity) values (:A, :bf, 22), (:A, :bu, 1);
create temp table df as select (c ->> 'type_id')::int as type_id, (c ->> 'series')::int as series, (c ->> 'number')::int as number, c ->> 'rarity_id' as rid from (select public.{{P}}open_booster_of_type(:bf) as j from generate_series(1, 22)) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('22 tirages « Full Art Rare » vident les 22 cartes de ces séries (jamais deux fois la même) : Full Art Rare ordinaires, Alpha et Omega selon leur place, aucune Unique', (select count(*) from df) = 22 and (select count(distinct (type_id, series, number)) from df) = 22 and not exists (select 1 from df where rid = :'uniq') and (select count(*) from df where rid = 'fartfull') = 14);
select pg_temp.expect('la carte 1/1 de F1 est sortie, affichée Full Art Rare (jamais Unique)', exists (select 1 from df where type_id = :f1 and series = 1 and number = 1 and rid = 'fartfull'));
select pg_temp.expect('ces tirages ne comptent pas parmi les Unique gagnées', (select count(*) from public.{{P}}unique_wins) = 0);
create temp table du as select (c ->> 'type_id')::int as type_id, c ->> 'rarity_id' as rid from (select public.{{P}}open_booster_of_type(:bu) as j) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('« Unique seulement » : la seule Unique possible est celle de F3 (Art Rare), jamais la 1/1 Full Art Rare de F1', (select type_id from du) = :f3 and (select rid from du) = :'uniq');
select pg_temp.expect('l''Unique de F3 est journalisée comme Unique gagnée (1), pas la Full Art Rare de F1', (select count(*) from public.{{P}}unique_wins) = 1);
delete from public.{{P}}cards where owner_id = :A;

\echo '--- collection, album et récompense'
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:f1, 'fartfull', 1, 1, :A);
select pg_temp.expect('collection : la carte 1/1 de F1 s''affiche Full Art Rare (pas Unique)', (select rarity_id from public.{{P}}list_collection(:cat, :f1, null, 'series', 10, 0)) = 'fartfull');
delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;
select public.{{P}}auto_place_album(:A, :f1, 'fartfull', 1, 1);
select pg_temp.expect('album : la carte se range dans l''emplacement Full Art Rare, ce qui complète F1 (un seul emplacement) et déclenche la récompense', (select rarity_id from public.{{P}}album_picks where user_id = :A and type_id = :f1) = 'fartfull' and exists (select 1 from public.{{P}}gold_rewards where user_id = :A and type_id = :f1));
delete from public.{{P}}cards where owner_id = :A;

\echo '--- booster Gold'
create temp table gu as select c_type from (select (public.{{P}}gold_pick_card(:cat, 'unique', null, null, 0)).* from generate_series(1, 40)) q where c_type is not null;
select pg_temp.expect('tirage « unique » du Gold : uniquement F3 (jamais la 1/1 Full Art Rare de F1)', (select count(*) from gu) > 0 and not exists (select 1 from gu where c_type <> :f3));
create temp table gp as select c_type, c_series, c_number from (select (public.{{P}}gold_pick_card(:cat, 'plain', 'fartfull', null, 0)).* from generate_series(1, 300)) q where c_type is not null;
select pg_temp.expect('tirage « Full Art Rare » du Gold : la 1/1 de F1 peut sortir comme carte ordinaire', exists (select 1 from gp where c_type = :f1 and c_series = 1 and c_number = 1));

-- nettoyage
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A; delete from public.{{P}}unique_wins;
delete from public.{{P}}categories where name = 'FA Param';
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
delete from public.{{P}}rarities where id in ('fartfull', 'fartvar', 'artcontrol') and :deja = 0;
update public.{{P}}categories set closed = false;
