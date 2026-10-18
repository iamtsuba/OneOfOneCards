-- Boosters paramétrables : Standard de départ semé d'après les NOMS des raretés, répartition carte par carte, Unique en option, jamais deux cartes identiques dans
-- une même rareté d'un booster, repli quand une rareté est épuisée, chances annoncées, album automatique.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

-- sauvegarde des boosters existants : tout est remis en place à la fin
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
create temp table ub_backup as select * from public.{{P}}user_boosters;
create temp table rn_backup as select id, name from public.{{P}}rarities;
select id as std from public.{{P}}booster_types where is_standard \gset

\echo '--- Standard de départ : semé d''après les NOMS des raretés (identifiants permutés comme dans la vraie vie), jamais sur une base déjà réglée'
select pg_temp.expect('un seul Standard existe après le schéma, à 5 cartes, avec des répartitions pour les 5 cartes', (select count(*) from public.{{P}}booster_types where is_standard) = 1 and (select cards from public.{{P}}booster_types where id = :std) = 5
  and (select count(distinct position) from public.{{P}}booster_type_slots where booster_type_id = :std) = 5);
delete from public.{{P}}booster_types;
update public.{{P}}rarities set name = name || ' (origine)' where kind = 'range';
delete from public.{{P}}rarities where id in ('zz_a', 'zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f');
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('zz_a', 'Commune', 'range', 1500, 9, '#ddd', '#bbb', '#000'), ('zz_b', 'Peu Commune', 'range', 1000, 8, '#aaa', '#888', '#000'), ('zz_c', 'Rare', 'range', 250, 7, '#0a0', '#060', '#fff'),
  ('zz_d', 'Super Rare', 'range', 100, 6, '#00f', '#008', '#fff'), ('zz_e', 'Ultra Rare', 'range', 35, 5, '#f04', '#a02', '#fff'), ('zz_f', 'Art Rare', 'range', 50, 4, '#fc0', '#a80', '#000');
select public.{{P}}seed_standard_booster();
select pg_temp.expect('Standard créé : 5 cartes, activé, jamais en vente', (select (name, cards, is_standard, enabled, price_coins is null) = ('Standard', 5, true, true, true) from public.{{P}}booster_types));
select pg_temp.expect('carte 1 et carte 2 : Commune 100 % (identifiant zz_a)', (select string_agg(rarity_id || ':' || weight, ',' order by position, rarity_id) from public.{{P}}booster_type_slots where position <= 2) = 'zz_a:100,zz_a:100');
select pg_temp.expect('carte 3 : Commune 80 %, Peu Commune 20 % ; carte 4 : Peu Commune 80 %, Rare 20 %',
  (select string_agg(rarity_id || ':' || weight, ',' order by rarity_id) from public.{{P}}booster_type_slots where position = 3) = 'zz_a:80,zz_b:20'
  and (select string_agg(rarity_id || ':' || weight, ',' order by rarity_id) from public.{{P}}booster_type_slots where position = 4) = 'zz_b:80,zz_c:20');
select pg_temp.expect('carte 5 : Rare 60, Super Rare 30, Ultra Rare 9, Art Rare 0,8, Unique 0,2 (total 100)',
  (select string_agg(rarity_id || ':' || weight, ',' order by rarity_id) from public.{{P}}booster_type_slots where position = 5) = 'unique:0.2,zz_c:60,zz_d:30,zz_e:9,zz_f:0.8'
  and abs((select sum(weight) from public.{{P}}booster_type_slots where position = 5) - 100) < 0.000001);
select public.{{P}}seed_standard_booster();
select pg_temp.expect('relancer le semis ne change rien (une seule fois)', (select count(*) from public.{{P}}booster_types) = 1 and (select count(*) from public.{{P}}booster_type_slots) = 11);
-- base sans « Peu Commune » ni « Art Rare » : les raretés absentes sont ignorées
delete from public.{{P}}booster_types;
delete from public.{{P}}rarities where id in ('zz_b', 'zz_f');
select public.{{P}}seed_standard_booster();
select pg_temp.expect('sans Peu Commune ni Art Rare : carte 3 = Commune seule, carte 4 = Rare seule, carte 5 sans Art Rare',
  (select string_agg(rarity_id, ',' order by rarity_id) from public.{{P}}booster_type_slots where position = 3) = 'zz_a' and (select string_agg(rarity_id, ',' order by rarity_id) from public.{{P}}booster_type_slots where position = 4) = 'zz_c'
  and not exists (select 1 from public.{{P}}booster_type_slots where rarity_id = 'zz_f'));
-- tout remettre
delete from public.{{P}}booster_types;
update public.{{P}}rarities r set name = b.name from rn_backup b where b.id = r.id;
delete from public.{{P}}rarities where id in ('zz_a', 'zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f');
insert into public.{{P}}booster_types overriding system value select * from bt_backup;
insert into public.{{P}}booster_type_slots select * from sl_backup;
insert into public.{{P}}user_boosters select * from ub_backup;

\echo '--- le Standard de test : cartes 1 à 3 = Commune ; carte 4 = Peu Commune ; carte 5 = Peu Commune 50, Rare 30, Super 11, Ultra 4, Unique 3, Art Rare 2'
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('zz_a', 'Commune test', 'range', 1500, 9, '#ddd', '#bbb', '#000'), ('zz_b', 'Peu Commune test', 'range', 1000, 8, '#aaa', '#888', '#000'), ('zz_c', 'Rare test', 'range', 250, 7, '#0a0', '#060', '#fff'),
  ('zz_d', 'Super Rare test', 'range', 100, 6, '#00f', '#008', '#fff'), ('zz_e', 'Ultra Rare test', 'range', 35, 5, '#f04', '#a02', '#fff'), ('zz_f', 'Art Rare test', 'range', 50, 4, '#fc0', '#a80', '#000');
delete from public.{{P}}booster_type_slots where booster_type_id = :std;
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) values
  (:std, 1, 'zz_a', 1), (:std, 2, 'zz_a', 1), (:std, 3, 'zz_a', 1), (:std, 4, 'zz_b', 1),
  (:std, 5, 'zz_b', 50), (:std, 5, 'zz_c', 30), (:std, 5, 'zz_d', 11), (:std, 5, 'zz_e', 4), (:std, 5, 'unique', 3), (:std, 5, 'zz_f', 2);
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'rarity_exponent');
update public.{{P}}config set value = 100000 where key = 'max_boosters';
update public.{{P}}profiles set boosters = 100000, bonus_boosters = 0 where id = :A;
delete from public.{{P}}album_picks; delete from public.{{P}}cards;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Slots Test', 1, 100, '#ffffff', '#cccccc', '#000000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'Type ' || i, '🐱', i, false from generate_series(1, 4) i;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty.id, r.rid, r.s, r.s, 'simple' from public.{{P}}types ty cross join (values ('zz_a', 60), ('zz_b', 45), ('zz_c', 40), ('zz_d', 25), ('zz_e', 14), ('zz_f', 10)) r(rid, s) where ty.category_id = :cat;
select count(*) as nb_types from public.{{P}}types where category_id = :cat \gset

\echo '--- chances annoncées AVANT les tirages (stock plein)'
create temp table odds0 as select public.{{P}}draw_odds(:cat) as j;
create or replace function pg_temp.mixp(n int, rid text) returns float language sql as $$
  select coalesce((select (o ->> 'p')::float from odds0, jsonb_array_elements(j -> 'positions') p, jsonb_array_elements(p -> 'mix') o where (p ->> 'n')::int = n and o ->> 'id' = rid), 0) $$;
select pg_temp.expect('le booster annoncé est le Standard à 5 cartes, avec une répartition par carte', (select j -> 'booster' ->> 'name' = 'Standard' and jsonb_array_length(j -> 'positions') = 5 from odds0));
select pg_temp.expect('pour chaque carte, la somme des chances vaut 1', (select bool_and(abs((select sum((o ->> 'p')::float) from jsonb_array_elements(p -> 'mix') o) - 1) < 0.000001) from odds0, jsonb_array_elements(j -> 'positions') p));
select pg_temp.expect('cartes 1 à 3 : presque 100 % Commune (le reste vient du même stock : Alpha, Omega, Unique) ; carte 4 : presque 100 % Peu Commune',
  pg_temp.mixp(1, 'zz_a') > 0.9 and pg_temp.mixp(1, 'zz_a') < 1 and pg_temp.mixp(2, 'zz_a') = pg_temp.mixp(3, 'zz_a') and pg_temp.mixp(4, 'zz_b') > 0.9
  and pg_temp.mixp(1, 'zz_a') + pg_temp.mixp(1, 'alpha') + pg_temp.mixp(1, 'omega') + pg_temp.mixp(1, 'unique') > 0.999999);
select pg_temp.expect('carte 5 : Peu Commune ≈ 50 %, Rare ≈ 30 %, Super Rare ≈ 11 % (un peu sous les poids : Alpha, Omega et Unique viennent du même stock)',
  pg_temp.mixp(5, 'zz_b') between 0.4 and 0.5 and pg_temp.mixp(5, 'zz_c') between 0.25 and 0.3 and pg_temp.mixp(5, 'zz_d') between 0.08 and 0.11);
select pg_temp.expect('Art Rare plus rare que Ultra Rare, que Super Rare, que Rare, que Peu Commune (carte 5)',
  pg_temp.mixp(5, 'zz_f') < pg_temp.mixp(5, 'zz_e') and pg_temp.mixp(5, 'zz_e') < pg_temp.mixp(5, 'zz_d') and pg_temp.mixp(5, 'zz_d') < pg_temp.mixp(5, 'zz_c') and pg_temp.mixp(5, 'zz_c') < pg_temp.mixp(5, 'zz_b'));
select pg_temp.expect('la part de chaque rareté affichée = moyenne des 5 cartes', (select bool_and(abs((r ->> 'share')::float - (pg_temp.mixp(1, r ->> 'id') + pg_temp.mixp(2, r ->> 'id') + pg_temp.mixp(3, r ->> 'id') + pg_temp.mixp(4, r ->> 'id') + pg_temp.mixp(5, r ->> 'id')) / 5) < 0.000001)
  from odds0, jsonb_array_elements(j -> 'by_rarity') r));
select pg_temp.expect('la somme des parts par rareté affichée vaut 1', abs((select sum((r ->> 'share')::float) from odds0, jsonb_array_elements(j -> 'by_rarity') r) - 1) < 0.0001);

\echo '--- 2 000 boosters Standard ouverts'
create temp table drawn as
select x.b, t.ord::int as ord, (t.c ->> 'type_id')::int as type_id, t.c ->> 'base_rarity' as base, (t.c ->> 'series')::int as series, (t.c ->> 'number')::int as number,
       t.c ->> 'rarity_id' as rarity_id, (t.c ->> 'is_new')::boolean as is_new
from (select b, public.{{P}}open_booster() as j from generate_series(1, 2000) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('chaque booster contient 5 cartes', (select count(*) from drawn) = 10000 and (select min(c) from (select count(*) c from drawn group by b) z) = 5 and (select max(c) from (select count(*) c from drawn group by b) z) = 5);
select pg_temp.expect('cartes 1 à 3 : la rareté « Commune » (identifiant zz_a, pas « common »)', (select count(*) from drawn where ord <= 3 and base = 'zz_a') = 6000);
select pg_temp.expect('les 3 premières cartes de chaque booster sont 3 cartes DIFFÉRENTES (2 000 boosters, 4 cartes possibles)',
  not exists (select 1 from drawn where ord <= 3 group by b having count(distinct type_id) < 3));
select pg_temp.expect('JAMAIS deux cartes identiques dans une même rareté d''un booster (Peu Commune de la carte 4 et de la carte 5 comprises)',
  not exists (select 1 from drawn group by b, case when series = 1 then 'unique' else base end, type_id having count(*) > 1));
select pg_temp.expect('la 4e carte est de la rareté « Peu Commune » (identifiant zz_b)', (select count(*) from drawn where ord = 4 and base = 'zz_b') = 2000);
select pg_temp.expect('aucune carte 1/1 (Unique) dans les 4 premières cartes', (select count(*) from drawn where ord <= 4 and series = 1) = 0);
create temp table prem as select case when series = 1 then 'unique' else base end as opt from drawn where ord = 5;
select opt, count(*) as cartes, round(100.0 * count(*) / 2000, 1) as pct from prem group by opt order by count(*) desc;
select pg_temp.expect('carte 5 : Peu Commune ≈ 50 %, Rare ≈ 30 %, Super Rare ≈ 11 % (marge de 5 sigmas)',
  (select count(*) from prem where opt = 'zz_b') between 890 and 1110 and (select count(*) from prem where opt = 'zz_c') between 500 and 700 and (select count(*) from prem where opt = 'zz_d') between 150 and 290);
select pg_temp.expect('carte 5 : Ultra Rare ≈ 4 %, Art Rare ≈ 2 % (marge de 5 sigmas)', (select count(*) from prem where opt = 'zz_e') between 36 and 124 and (select count(*) from prem where opt = 'zz_f') between 8 and 72);
select pg_temp.expect('carte 5 : ordre strict Peu Commune > Rare > Super Rare > Ultra Rare > Art Rare',
  (select count(*) from prem where opt = 'zz_b') > (select count(*) from prem where opt = 'zz_c') and (select count(*) from prem where opt = 'zz_c') > (select count(*) from prem where opt = 'zz_d')
  and (select count(*) from prem where opt = 'zz_d') > (select count(*) from prem where opt = 'zz_e') and (select count(*) from prem where opt = 'zz_e') > (select count(*) from prem where opt = 'zz_f'));
select pg_temp.expect('les Unique ne sortent que par leur poids, en carte 5 : tous les 1/1 de la catégorie ont été tirés (24 = 4 types x 6 raretés) et seulement en carte 5',
  (select count(*) from drawn where series = 1) = :nb_types * 6 and (select count(*) from drawn where series = 1 and ord <> 5) = 0);
select pg_temp.expect('les cartes 1/1 tirées s''affichent « Unique »', (select count(*) from drawn where series = 1 and rarity_id = 'unique') = :nb_types * 6);

\echo '--- album automatique : chaque nouvelle carte est placée dans son emplacement ; les doublons ne changent rien'
select pg_temp.expect('autant d''annonces « nouvelle » que d''emplacements (type, rareté affichée) remplis', (select count(*) from drawn where is_new) = (select count(distinct (type_id, rarity_id)) from drawn));
select pg_temp.expect('autant de choix d''album que de cartes nouvelles', (select count(*) from public.{{P}}album_picks where user_id = :A) = (select count(*) from drawn where is_new));
select pg_temp.expect('chaque choix d''album est EXACTEMENT la carte nouvelle de cet emplacement',
  not exists (select 1 from public.{{P}}album_picks p where p.user_id = :A and not exists (
    select 1 from drawn d where d.is_new and d.type_id = p.type_id and d.rarity_id = p.rarity_id and d.series = p.series and d.number = p.number and d.base = p.base_rarity)));
select pg_temp.expect('la rareté du choix est bien la rareté affichée de la carte', not exists (select 1 from public.{{P}}album_picks p where p.user_id = :A and p.rarity_id <> public.{{P}}rarity_id(p.number, p.series, p.type_id, p.base_rarity)));

\echo '--- booster doré : les nouvelles cartes vont aussi dans l''album'
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
select count(*) as picks_avant from public.{{P}}album_picks where user_id = :A \gset
with g as (select public.{{P}}open_booster() as j)
select (select count(*) from g, jsonb_array_elements(j -> 'cards') c where (c ->> 'is_new')::boolean) as nouvelles_cartes_dorees, (j ->> 'golden') as dore from g \gset
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
select pg_temp.expect('booster doré : une carte nouvelle = un choix d''album de plus', (select count(*) from public.{{P}}album_picks where user_id = :A) = :picks_avant + :nouvelles_cartes_dorees);

\echo '--- repli : une catégorie sans Peu Commune et à stock minuscule se vide sans erreur, Communes d''abord'
delete from public.{{P}}booster_type_slots where booster_type_id = :std;
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) values (:std, 1, 'zz_a', 1), (:std, 2, 'zz_a', 1), (:std, 3, 'zz_a', 1), (:std, 4, 'zz_b', 1), (:std, 5, 'zz_c', 1);
delete from public.{{P}}cards; delete from public.{{P}}album_picks;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Slots Repli', 1, 10, '#ffffff', '#cccccc', '#000000', true) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'Mini', '🐭', 1, false) returning id as m1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:m1, 'zz_a', 3, 3, 'simple'), (:m1, 'zz_c', 3, 3, 'simple');   -- 6 + 6 = 12 cartes
create temp table mini as
select x.b, t.ord::int as ord, t.c ->> 'base_rarity' as base from (select b, public.{{P}}open_booster() as j from generate_series(1, 2) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('1er booster : 3 Communes d''abord, puis (pas de Peu Commune) des cartes tirées parmi toutes les restantes, une Rare en carte 5',
  (select count(*) from mini where b = 1 and ord <= 3 and base = 'zz_a') = 3 and (select count(*) from mini where b = 1) = 5 and (select base from mini where b = 1 and ord = 5) = 'zz_c');
select pg_temp.expect('2e booster : tire ce qui reste sans erreur', (select count(*) from mini where b = 2) >= 1);
do $$ declare n int := 0; begin
  loop
    begin
      perform public.{{P}}open_booster();
    exception when others then
      if sqlerrm = 'pool_empty' then exit; end if;
      raise exception 'ATTENDU : fin du pool par pool_empty, obtenu : %', sqlerrm;
    end;
    n := n + 1;
    if n > 10 then raise exception 'ATTENDU : la catégorie aurait dû se vider en quelques boosters'; end if;
  end loop;
end $$;
select pg_temp.expect('les 12 cartes de la catégorie ont toutes été tirées (aucune perdue, aucune en double), 1/1 compris', (select count(*) from public.{{P}}cards where type_id = :m1) = 12);

\echo '--- deux cartes seulement ont des Communes : les 3 Communes sont complétées avec un doublon plutôt qu''un booster incomplet'
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Slots Deux', 1, 10, '#ffffff', '#cccccc', '#000000', true) returning id as cat4 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat4, 'Duo ' || i, '🐭', i, false from generate_series(1, 2) i;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty.id, r.rid, r.s, r.s, 'simple' from public.{{P}}types ty cross join (values ('zz_a', 6), ('zz_c', 4)) r(rid, s) where ty.category_id = :cat4;
create temp table duo as
select x.b, t.ord::int as ord, (t.c ->> 'type_id')::int as type_id, t.c ->> 'base_rarity' as base from (select b, public.{{P}}open_booster() as j from generate_series(1, 3) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('booster complet (5 cartes) même avec seulement 2 cartes différentes', (select count(*) from duo where b = 1) = 5);
select pg_temp.expect('les 3 Communes du 1er booster : les 2 cartes différentes y sont, la 3e est forcément un doublon', (select count(*) from duo where b = 1 and ord <= 3 and base = 'zz_a') = 3 and (select count(distinct type_id) from duo where b = 1 and ord <= 3) = 2);

-- nettoyage : on laisse la base comme on l'a trouvée
delete from public.{{P}}cards; delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name in ('Slots Test', 'Slots Repli', 'Slots Deux');
delete from public.{{P}}booster_type_slots where booster_type_id = :std;
insert into public.{{P}}booster_type_slots select * from sl_backup where booster_type_id = :std;
delete from public.{{P}}rarities where id in ('zz_a', 'zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f');
update public.{{P}}categories set closed = false;
