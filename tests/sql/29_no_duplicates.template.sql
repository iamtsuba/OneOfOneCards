-- Jamais deux fois la même carte (le même type) dans un booster, quelle que soit la rareté : boosters ordinaires, booster Gold, booster doré ; doublon seulement si plus aucune autre carte n'existe.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
create temp table ub_backup as select * from public.{{P}}user_boosters;
create temp table gc_backup as select * from public.{{P}}golden_contents;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Doublons Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
-- 12 types : le premier est GÉANT (125 000 communes, 31 000 rares…) et écraserait les autres sans la règle ; les 11 autres sont petits
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'D' || g, '🐱', g, false from generate_series(1, 12) g;
select min(id) as d1 from public.{{P}}types where category_id = :cat \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select t.id, r.rid, case when t.id = :d1 then r.big else r.small end, 0, 'simple'
from public.{{P}}types t cross join (values ('common', 500, 20), ('rare', 250, 10), ('super', 100, 8), ('ultra', 35, 6)) r(rid, big, small) where t.category_id = :cat;

\echo '--- boosters ordinaires : 5 cartes de 5 types différents, raretés mélangées'
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Mélange', 5, '#333333', null, true,
  '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"rare","weight":1},{"position":5,"rarity_id":"rare","weight":1}]'::jsonb) ->> 'id')::int as bt \gset
delete from public.{{P}}user_boosters where user_id = :A; insert into public.{{P}}user_boosters (user_id, booster_type_id, quantity) values (:A, :bt, 200);
create temp table ob as select b, (c ->> 'type_id')::int as type_id, c ->> 'base_rarity' as base from (select g as b, public.{{P}}open_booster_of_type(:bt) as j from generate_series(1, 150) g) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('150 boosters de 5 cartes', (select count(*) from ob) = 750 and (select count(distinct b) from ob) = 150);
select pg_temp.expect('JAMAIS deux fois le même type dans un booster (même entre une commune et une rare) : 0 booster avec un doublon', not exists (select 1 from ob group by b, type_id having count(*) > 1));
select pg_temp.expect('le type géant (le plus de cartes libres) sort une fois par booster au plus, et les 11 autres types sortent aussi : les 12 types apparaissent', (select max(n) from (select count(*) n from ob where type_id = :d1 group by b) z) = 1 and (select count(distinct type_id) from ob) = 12);
select pg_temp.expect('les raretés suivent toujours le booster : 3 communes et 2 rares par booster', (select count(*) from (select b from ob group by b having count(*) filter (where base = 'common') = 3 and count(*) filter (where base = 'rare') = 2) z) = 150);

\echo '--- catégorie minuscule (3 types seulement) : le booster reste complet, tous les types sortent'
update public.{{P}}categories set closed = true where name = 'Doublons Param';
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Doublons Mini', 1, 100, '#fff', '#ccc', '#000', true) returning id as catm \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :catm, 'M' || g, '🐶', g, false from generate_series(1, 3) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t.id, 'common', 20, 0, 'simple' from public.{{P}}types t where t.category_id = :catm;
create temp table mb as select b, (c ->> 'type_id')::int as type_id from (select g as b, public.{{P}}open_booster_of_type(:bt) as j from generate_series(1, 30) g) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('toujours 5 cartes par booster, même avec 3 types (un doublon plutôt qu''un booster incomplet)', (select count(*) from mb) = 150);
select pg_temp.expect('les 3 types apparaissent dans chaque booster (un doublon n''arrive que lorsqu''il n''y a plus aucune autre carte)', (select count(*) from (select b from mb group by b having count(distinct type_id) = 3) z) = 30);
update public.{{P}}categories set closed = true where name = 'Doublons Mini';
update public.{{P}}categories set closed = false where name = 'Doublons Param';

\echo '--- booster Gold : 5 cartes de 5 types différents'
select id as gold from public.{{P}}booster_types where role = 'card_reward' \gset
delete from public.{{P}}booster_type_slots where booster_type_id = :gold;
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) values (:gold, 1, 'rare', 100), (:gold, 2, 'rare', 100), (:gold, 3, 'rare', 100), (:gold, 4, 'super', 100), (:gold, 5, 'ultra', 100);
update public.{{P}}booster_types set cards = 5 where id = :gold;
create temp table gb as select b, (c ->> 'type_id')::int as type_id from (select g as b, public.{{P}}draw_gold_reward(:A, :d1) as j from generate_series(1, 80) g) x, jsonb_array_elements(x.j) c;
select pg_temp.expect('80 boosters Gold de 5 cartes', (select count(*) from gb) = 400);
select pg_temp.expect('JAMAIS deux fois la même carte dans un booster Gold (3 Rare + 1 Super Rare + 1 Ultra Rare, tous de types différents)', not exists (select 1 from gb group by b, type_id having count(*) > 1));
select pg_temp.expect('le type géant sort une fois par booster Gold au plus, et plusieurs autres types sortent', (select coalesce(max(n), 0) from (select count(*) n from gb where type_id = :d1 group by b) z) <= 1 and (select count(distinct type_id) from gb) >= 6);
delete from public.{{P}}cards where owner_id = :A;

\echo '--- booster doré (achat de pièces)'
delete from public.{{P}}golden_contents;
insert into public.{{P}}golden_contents (rarity_id, quantity) values ('common', 2), ('rare', 2), ('super', 1);
create temp table gd as select b, (c ->> 'type_id')::int as type_id from (select g as b, public.{{P}}draw_golden(:A, :cat) as j from generate_series(1, 60) g) x, jsonb_array_elements(x.j) c;
select pg_temp.expect('60 boosters dorés de 5 cartes', (select count(*) from gd) = 300);
select pg_temp.expect('JAMAIS deux fois la même carte dans un booster doré', not exists (select 1 from gd group by b, type_id having count(*) > 1));
select pg_temp.expect('le type géant sort une fois par booster doré au plus, et plusieurs autres types sortent', (select coalesce(max(n), 0) from (select count(*) n from gd where type_id = :d1 group by b) z) <= 1 and (select count(distinct type_id) from gd) >= 6);

-- nettoyage
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
delete from public.{{P}}categories where name in ('Doublons Param', 'Doublons Mini');
delete from public.{{P}}golden_contents; insert into public.{{P}}golden_contents select * from gc_backup;
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}booster_type_slots where booster_type_id in (select id from bt_backup); insert into public.{{P}}booster_type_slots select * from sl_backup;
update public.{{P}}booster_types b set cards = o.cards from bt_backup o where o.id = b.id;
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
update public.{{P}}categories set closed = false;
