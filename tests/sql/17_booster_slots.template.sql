-- Tirage d'un booster : composition par poids de rareté (Commune, Peu commune, puis 5e carte), indépendante des identifiants, option Unique,
-- repli quand une rareté est épuisée, chances annoncées, album automatique, semis des poids selon le nom.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

\echo '--- semis des poids selon le NOM (identifiants permutés, comme dans la vraie vie) et jamais sur une base déjà réglée'
create temp table w_backup as select id, weight_slots_1_3 as a, weight_slot_4 as b, weight_slot_5 as c from public.{{P}}rarities;
update public.{{P}}rarities set weight_slots_1_3 = 0, weight_slot_4 = 0, weight_slot_5 = 0;
delete from public.{{P}}rarities where id in ('zz_a', 'zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f');
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('zz_a', 'Commune', 'range', 1500, 9, '#ddd', '#bbb', '#000'), ('zz_b', 'Peu Commune', 'range', 1000, 8, '#aaa', '#888', '#000'), ('zz_c', 'Rare', 'range', 250, 7, '#0a0', '#060', '#fff'),
  ('zz_d', 'Super Rare', 'range', 100, 6, '#00f', '#008', '#fff'), ('zz_e', 'Ultra Rare', 'range', 35, 5, '#f04', '#a02', '#fff'), ('zz_f', 'Art Rare', 'range', 50, 4, '#fc0', '#a80', '#000');
select public.{{P}}seed_rarity_weights();
select pg_temp.expect('Commune (id zz_a) : cartes 1 à 3 seulement ; Peu Commune (id zz_b) : carte 4 et 10 sur la carte 5',
  (select (weight_slots_1_3, weight_slot_4, weight_slot_5) = (1, 0, 0) from public.{{P}}rarities where id = 'zz_a')
  and (select (weight_slots_1_3, weight_slot_4, weight_slot_5) = (0, 1, 10) from public.{{P}}rarities where id = 'zz_b'));
select pg_temp.expect('carte 5 : Rare 55, Super Rare 29, Ultra Rare 5, Art Rare 0,8',
  (select weight_slot_5 from public.{{P}}rarities where id = 'zz_c') = 55 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_d') = 29
  and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_e') = 5 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_f') = 0.8);
select pg_temp.expect('les poids de départ de la carte 5 totalisent 100 (Peu Commune 10 + Rare 55 + Super 29 + Ultra 5 + Art Rare 0,8 + Unique 0,2)',
  abs((select sum(weight_slot_5) from public.{{P}}rarities where id in ('zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f') or kind = 'unique') - 100) < 0.000001);
select pg_temp.expect('Unique 0,2 sur la carte 5 ; Alpha et Omega jamais tirées par poids', (select weight_slot_5 from public.{{P}}rarities where kind = 'unique') = 0.2
  and (select count(*) from public.{{P}}rarities where kind in ('alpha', 'omega') and (weight_slots_1_3 + weight_slot_4 + weight_slot_5) > 0) = 0);
update public.{{P}}rarities set weight_slot_5 = 7 where id = 'zz_c';
select public.{{P}}seed_rarity_weights();
select pg_temp.expect('une base déjà réglée n''est jamais modifiée par le semis', (select weight_slot_5 from public.{{P}}rarities where id = 'zz_c') = 7);

\echo '--- anciens poids de départ (50 / 35 / 11 / 3) : remplacés par 10 / 55 / 29 / 5 seulement s''ils n''ont jamais été modifiés'
-- (la base de test contient aussi les vraies raretés « Rare », « Super Rare », « Ultra Rare » : elles doivent avoir les anciens poids elles aussi)
update public.{{P}}rarities set weight_slot_5 = 35 where id = 'rare';
update public.{{P}}rarities set weight_slot_5 = 11 where id = 'super';
update public.{{P}}rarities set weight_slot_5 = 3 where id = 'ultra';
update public.{{P}}rarities set weight_slot_5 = 50 where id = 'zz_b';
update public.{{P}}rarities set weight_slot_5 = 35 where id = 'zz_c';
update public.{{P}}rarities set weight_slot_5 = 11 where id = 'zz_d';
update public.{{P}}rarities set weight_slot_5 = 3 where id = 'zz_e';
select public.{{P}}seed_rarity_weights();
select pg_temp.expect('anciens poids intacts : passage à Peu Commune 10, Rare 55, Super Rare 29, Ultra Rare 5',
  (select weight_slot_5 from public.{{P}}rarities where id = 'zz_b') = 10 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_c') = 55
  and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_d') = 29 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_e') = 5);
update public.{{P}}rarities set weight_slot_5 = 50 where id = 'zz_b';
update public.{{P}}rarities set weight_slot_5 = 40 where id = 'zz_c';   -- l'admin a changé la Rare : plus aucune mise à jour automatique
update public.{{P}}rarities set weight_slot_5 = 11 where id = 'zz_d';
update public.{{P}}rarities set weight_slot_5 = 3 where id = 'zz_e';
select public.{{P}}seed_rarity_weights();
select pg_temp.expect('un seul réglage modifié par l''admin : rien n''est remplacé (50 / 40 / 11 / 3 conservés)',
  (select weight_slot_5 from public.{{P}}rarities where id = 'zz_b') = 50 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_c') = 40
  and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_d') = 11 and (select weight_slot_5 from public.{{P}}rarities where id = 'zz_e') = 3);

\echo '--- poids de test : cartes 1 à 3 = Commune ; carte 4 = Peu Commune ; carte 5 = Peu Commune 50, Rare 30, Super 11, Ultra 4, Unique 3, Art Rare 2'
update public.{{P}}rarities set weight_slots_1_3 = 0, weight_slot_4 = 0, weight_slot_5 = 0;
update public.{{P}}rarities set weight_slots_1_3 = 1 where id = 'zz_a';
update public.{{P}}rarities set weight_slot_4 = 1, weight_slot_5 = 50 where id = 'zz_b';
update public.{{P}}rarities set weight_slot_5 = 30 where id = 'zz_c';
update public.{{P}}rarities set weight_slot_5 = 11 where id = 'zz_d';
update public.{{P}}rarities set weight_slot_5 = 4 where id = 'zz_e';
update public.{{P}}rarities set weight_slot_5 = 2 where id = 'zz_f';
update public.{{P}}rarities set weight_slot_5 = 3 where kind = 'unique';
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
select pg_temp.expect('emplacements annoncés : 3 / 1 / 1', (select j -> 'slots' from odds0) = '{"common": 3, "uncommon": 1, "premium": 1}'::jsonb);
select pg_temp.expect('cartes 1 à 3 : 100 % Commune ; carte 4 : 100 % Peu Commune',
  (select j -> 'slot_options' -> 'common' from odds0) = '[{"id": "zz_a", "p": 1}]'::jsonb and (select j -> 'slot_options' -> 'uncommon' from odds0) = '[{"id": "zz_b", "p": 1}]'::jsonb);
select pg_temp.expect('carte 5 : Peu Commune 50 %, Rare 30 %, Super Rare 11 %, Ultra Rare 4 %, Unique 3 %, Art Rare 2 % (dans l''ordre des chances)',
  (select string_agg(o ->> 'id', ',' order by (o ->> 'p')::float desc, o ->> 'id') from odds0, jsonb_array_elements(j -> 'slot_options' -> 'premium') o) = 'zz_b,zz_c,zz_d,zz_e,unique,zz_f'
  and abs((select (o ->> 'p')::float from odds0, jsonb_array_elements(j -> 'slot_options' -> 'premium') o where o ->> 'id' = 'zz_f') - 0.02) < 0.00001
  and abs((select (o ->> 'p')::float from odds0, jsonb_array_elements(j -> 'slot_options' -> 'premium') o where o ->> 'id' = 'unique') - 0.03) < 0.00001);
select pg_temp.expect('Art Rare plus rare que Ultra Rare, plus rare que Super Rare, plus rare que Rare, plus rare que Peu Commune (chances annoncées)',
  (select max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_f') < max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_e')
      and max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_e') < max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_d')
      and max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_d') < max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_c')
      and max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_c') < max((o ->> 'p')::float) filter (where o ->> 'id' = 'zz_b')
   from odds0, jsonb_array_elements(j -> 'slot_options' -> 'premium') o));
select pg_temp.expect('la somme des parts par rareté affichée vaut 1', abs((select sum((r ->> 'share')::float) from odds0, jsonb_array_elements(j -> 'by_rarity') r) - 1) < 0.0001);
create or replace function pg_temp.mixp(cls text, rid text) returns float language sql as $$
  select coalesce((select (o ->> 'p')::float from odds0, jsonb_array_elements(j -> 'slot_mix' -> cls) o where o ->> 'id' = rid), 0) $$;
select pg_temp.expect('répartition réelle par emplacement : la somme des chances vaut 1 pour cartes 1 à 3, carte 4 et carte 5',
  (select bool_and(abs(s - 1) < 0.000001) and count(*) = 3 from (select k, (select sum((o ->> 'p')::float) from jsonb_array_elements(v) o) as s from odds0, jsonb_each(j -> 'slot_mix') as e(k, v)) z));
select pg_temp.expect('cartes 1 à 3 : presque 100 % Commune (le reste vient du même stock : Alpha, Omega, Unique) ; carte 4 : presque 100 % Peu Commune',
  pg_temp.mixp('common', 'zz_a') > 0.9 and pg_temp.mixp('common', 'zz_a') < 1 and pg_temp.mixp('common', 'alpha') > 0 and pg_temp.mixp('common', 'zz_a') + pg_temp.mixp('common', 'alpha') + pg_temp.mixp('common', 'omega') + pg_temp.mixp('common', 'unique') > 0.999999
  and pg_temp.mixp('uncommon', 'zz_b') > 0.9);
select pg_temp.expect('la part de chaque rareté affichée est la moyenne pondérée des emplacements (3 / 1 / 1 sur 5) : mêmes nombres que la liste par rareté',
  (select bool_and(abs((r ->> 'share')::float - (3 * pg_temp.mixp('common', r ->> 'id') + pg_temp.mixp('uncommon', r ->> 'id') + pg_temp.mixp('premium', r ->> 'id')) / 5) < 0.000001)
   from odds0, jsonb_array_elements(j -> 'by_rarity') r));
select pg_temp.expect('carte 5 : Peu Commune ≈ 50 %, Rare ≈ 30 % (chances réelles, un peu sous les poids : Alpha, Omega et Unique viennent du même stock)',
  pg_temp.mixp('premium', 'zz_b') between 0.4 and 0.5 and pg_temp.mixp('premium', 'zz_c') between 0.25 and 0.3);

\echo '--- 2 000 boosters ouverts'
create temp table drawn as
select x.b, t.ord::int as ord, (t.c ->> 'type_id')::int as type_id, t.c ->> 'base_rarity' as base, (t.c ->> 'series')::int as series, (t.c ->> 'number')::int as number,
       t.c ->> 'rarity_id' as rarity_id, (t.c ->> 'is_new')::boolean as is_new
from (select b, public.{{P}}open_booster() as j from generate_series(1, 2000) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('chaque booster contient 5 cartes', (select count(*) from drawn) = 10000 and (select min(c) from (select count(*) c from drawn group by b) z) = 5 and (select max(c) from (select count(*) c from drawn group by b) z) = 5);
select pg_temp.expect('les 3 premières cartes sont de la rareté « Commune » (identifiant zz_a, pas « common »)', (select count(*) from drawn where ord <= 3 and base = 'zz_a') = 6000);
select pg_temp.expect('les 3 Communes de chaque booster sont 3 cartes DIFFÉRENTES : jamais de doublon ni de triplon (2 000 boosters, 4 cartes possibles)',
  not exists (select 1 from drawn where ord <= 3 group by b having count(distinct type_id) < 3) and (select count(*) from (select b from drawn where ord <= 3 group by b having count(distinct type_id) = 3) z) = 2000);
select pg_temp.expect('la 4e carte est de la rareté « Peu Commune » (identifiant zz_b)', (select count(*) from drawn where ord = 4 and base = 'zz_b') = 2000);
select pg_temp.expect('aucune carte 1/1 (Unique) dans les 4 premiers emplacements', (select count(*) from drawn where ord <= 4 and series = 1) = 0);
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
update public.{{P}}rarities set weight_slot_5 = 0 where kind = 'unique';
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

\echo '--- réglage des poids par l''admin'
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
select (public.{{P}}admin_set_rarity_weights('thomarie', 'zz_c', 2, 3, 4) ->> 'ok')::bool as poids_regles;
select pg_temp.expect('poids enregistrés (2 / 3 / 4)', (select (weight_slots_1_3, weight_slot_4, weight_slot_5) = (2, 3, 4) from public.{{P}}rarities where id = 'zz_c'));
select pg_temp.try('select public.{{P}}admin_set_rarity_weights(''thomarie'', ''zz_c'', -1, 0, 0)');                       -- poids négatif refusé
select pg_temp.try('select public.{{P}}admin_set_rarity_weights(''thomarie'', ''alpha'', 1, 1, 1)');                       -- Alpha non réglable
select pg_temp.try('select public.{{P}}admin_set_rarity_weights(''thomarie'', ''inconnue'', 1, 1, 1)');                    -- rareté inconnue
select public.{{P}}admin_set_rarity_weights('mauvais', 'zz_c', 1, 1, 1) ->> 'error' as mauvais_mot_de_passe;               -- admin_denied
select pg_temp.expect('rien n''a changé après les refus', (select (weight_slots_1_3, weight_slot_4, weight_slot_5) = (2, 3, 4) from public.{{P}}rarities where id = 'zz_c'));
select pg_temp.expect('admin_data renvoie les poids de chaque rareté', (select count(*) from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'rarities') r where r ? 'weight_slot_5') = (select count(*) from public.{{P}}rarities));

\echo '--- deux cartes seulement ont des Communes : les 3 Communes sont complétées avec un doublon plutôt qu''un booster incomplet'
-- poids propres : les cartes 1 à 3 = Commune seulement (le réglage de l'admin testé plus haut avait donné un poids à « Rare »)
update public.{{P}}rarities set weight_slots_1_3 = 0, weight_slot_4 = 0, weight_slot_5 = 0;
update public.{{P}}rarities set weight_slots_1_3 = 1 where id = 'zz_a';
update public.{{P}}rarities set weight_slot_5 = 30 where id = 'zz_c';
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
delete from public.{{P}}rarities where id in ('zz_a', 'zz_b', 'zz_c', 'zz_d', 'zz_e', 'zz_f');
update public.{{P}}rarities r set weight_slots_1_3 = b.a, weight_slot_4 = b.b, weight_slot_5 = b.c from w_backup b where b.id = r.id;
update public.{{P}}categories set closed = false;
