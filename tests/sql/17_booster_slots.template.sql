-- Composition d'un booster (3 Communes, 1 Peu commune, 1 Premium), paliers Premium (Rare > Super Rare > Ultra Rare > Full Art), repli quand un
-- palier est épuisé, et album automatique pour les nouvelles cartes.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

\echo '--- réglages par défaut : 3 Communes, 1 Peu commune, Premium Rare 84 > Super 13 > Ultra 2,7 > Full Art 0,3'
select pg_temp.expect('réglages de composition et de paliers semés', (select count(*) from public.{{P}}config where (key, value) in (('booster_common_slots', 3), ('booster_uncommon_slots', 1), ('premium_weight_rare', 84), ('premium_weight_super', 13), ('premium_weight_ultra', 2.7), ('premium_weight_other', 1), ('premium_weight_fullart', 0.3))) = 7);
select pg_temp.expect('Full Art plus rare que Ultra Rare, plus rare que Super Rare, plus rare que Rare (poids par défaut)',
  (select public.{{P}}premium_weight('fullart') < public.{{P}}premium_weight('ultra') and public.{{P}}premium_weight('ultra') < public.{{P}}premium_weight('super') and public.{{P}}premium_weight('super') < public.{{P}}premium_weight('rare')));
select pg_temp.expect('palier d''une carte : Commune, Peu commune, Rare, Full Art quelle que soit la rareté Premium, autres raretés',
  public.{{P}}booster_tier('common', 'simple') = 'common' and public.{{P}}booster_tier('peu_commune', 'simple') = 'uncommon' and public.{{P}}booster_tier('rare', 'simple') = 'rare'
  and public.{{P}}booster_tier('super', 'fullart') = 'fullart' and public.{{P}}booster_tier('rare', 'fullart') = 'fullart' and public.{{P}}booster_tier('legende', 'simple') = 'other'
  and public.{{P}}booster_tier('common', 'fullart') = 'common');
select pg_temp.expect('emplacements : 1 à 3 Communes, 4 Peu commune, 5 et plus Premium',
  (select array_agg(public.{{P}}slot_class(i) order by i) from generate_series(1, 6) i) = array['common','common','common','uncommon','premium','premium']);

\echo '--- une catégorie dédiée : 2 types normaux (5 raretés) et 2 types Full Art (Super et Ultra en FullArt) ; poids de test 70 / 20 / 8 / 2'
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'rarity_exponent');
update public.{{P}}config set value = 100000 where key = 'max_boosters';
update public.{{P}}config set value = 70 where key = 'premium_weight_rare';
update public.{{P}}config set value = 20 where key = 'premium_weight_super';
update public.{{P}}config set value = 8 where key = 'premium_weight_ultra';
update public.{{P}}config set value = 2 where key = 'premium_weight_fullart';
update public.{{P}}profiles set boosters = 100000, bonus_boosters = 0 where id = :A;
delete from public.{{P}}album_picks; delete from public.{{P}}cards;
update public.{{P}}categories set closed = true;
select exists (select 1 from public.{{P}}rarities where id = 'peu_commune') as had_pc \gset
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('peu_commune', 'Peu commune', 'range', 400, 6, '#9ca3af', '#4b5563', '#ffffff') on conflict (id) do nothing;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Slots Test', 1, 100, '#ffffff', '#cccccc', '#000000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Normal 1', '🐱', 1, false) returning id as n1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Normal 2', '🐶', 2, false) returning id as n2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Full 1', '🦊', 3, false) returning id as f1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Full 2', '🐼', 4, false) returning id as f2 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty, r.rid, r.s, r.s, 'simple' from (values (:n1), (:n2)) t(ty) cross join (values ('common', 60), ('peu_commune', 45), ('rare', 40), ('super', 25), ('ultra', 14)) r(rid, s);
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty, r.rid, r.s, r.s, 'fullart' from (values (:f1), (:f2)) t(ty) cross join (values ('super', 20), ('ultra', 12)) r(rid, s);

\echo '--- 1 000 boosters ouverts'
create temp table drawn as
select x.b, t.ord::int as ord, (t.c ->> 'type_id')::int as type_id, t.c ->> 'base_rarity' as base, (t.c ->> 'series')::int as series, (t.c ->> 'number')::int as number,
       t.c ->> 'rarity_id' as rarity_id, (t.c ->> 'is_new')::boolean as is_new
from (select b, public.{{P}}open_booster() as j from generate_series(1, 1000) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('chaque booster contient 5 cartes (5 000 cartes au total)', (select count(*) from drawn) = 5000 and (select min(c) from (select count(*) c from drawn group by b) z) = 5 and (select max(c) from (select count(*) c from drawn group by b) z) = 5);
select pg_temp.expect('les 3 premières cartes de chaque booster sont des Communes', (select count(*) from drawn where ord <= 3 and base <> 'common') = 0 and (select count(*) from drawn where ord <= 3) = 3000);
select pg_temp.expect('la 4e carte est une Peu commune', (select count(*) from drawn where ord = 4 and base = 'peu_commune') = 1000);
select pg_temp.expect('la 5e carte est une carte Premium (ni Commune ni Peu commune)', (select count(*) from drawn where ord = 5 and base in ('rare', 'super', 'ultra')) = 1000);
select pg_temp.expect('aucun Full Art dans les 4 premières cartes', (select count(*) from drawn where ord <= 4 and type_id in (:f1, :f2)) = 0);
create temp table prem as select case when type_id in (:f1, :f2) then 'fullart' else base end as tier from drawn where ord = 5;
select tier, count(*) as cartes, round(100.0 * count(*) / 1000, 1) as pct from prem group by tier order by count(*) desc;   -- rare ~70 %, super ~20 %, ultra ~8 %, fullart ~2 %
select pg_temp.expect('Premium : Rare > Super Rare > Ultra Rare > Full Art (ordre strict)',
  (select count(*) from prem where tier = 'rare') > (select count(*) from prem where tier = 'super')
  and (select count(*) from prem where tier = 'super') > (select count(*) from prem where tier = 'ultra')
  and (select count(*) from prem where tier = 'ultra') > (select count(*) from prem where tier = 'fullart'));
select pg_temp.expect('Premium : fréquences conformes aux poids 70 / 20 / 8 / 2 (marge de 5 sigmas)',
  (select count(*) from prem where tier = 'rare') between 620 and 780 and (select count(*) from prem where tier = 'super') between 140 and 260
  and (select count(*) from prem where tier = 'ultra') between 40 and 120 and (select count(*) from prem where tier = 'fullart') between 2 and 45);
select pg_temp.expect('des Full Art sortent bien (ils ne sont pas exclus du tirage)', (select count(*) from prem where tier = 'fullart') >= 1);

\echo '--- les chances annoncées par le serveur suivent la même règle'
select pg_temp.expect('emplacements annoncés : 3 / 1 / 1', public.{{P}}draw_odds() -> 'slots' = '{"common": 3, "uncommon": 1, "premium": 1}'::jsonb);
-- 3 emplacements sur 5 sont Communes (60 %) mais une partie de ces cartes s'affiche Alpha, Omega ou Unique (1/m, m/m, 1/1) : la part de la rareté
-- « Commune » affichée est donc un peu plus basse. Même chose pour la Peu commune (20 %).
select pg_temp.expect('Commune : un peu moins de 60 % des cartes tirées (le reste des emplacements Communes s''affiche Alpha, Omega, Unique)',
  (select (r ->> 'share')::float from jsonb_array_elements(public.{{P}}draw_odds() -> 'by_rarity') r where r ->> 'id' = 'common') between 0.5 and 0.5999);
select pg_temp.expect('Peu commune : un peu moins de 20 % des cartes tirées',
  (select (r ->> 'share')::float from jsonb_array_elements(public.{{P}}draw_odds() -> 'by_rarity') r where r ->> 'id' = 'peu_commune') between 0.17 and 0.1999);
select pg_temp.expect('Rare + Super Rare + Ultra Rare ne peuvent venir que de la carte Premium (20 % au plus) ; les autres raretés couvrent au moins les 4 premiers emplacements (80 %)',
  (select sum((r ->> 'share')::float) from jsonb_array_elements(public.{{P}}draw_odds() -> 'by_rarity') r where r ->> 'id' in ('rare', 'super', 'ultra')) <= 0.2 + 0.000001
  and (select sum((r ->> 'share')::float) from jsonb_array_elements(public.{{P}}draw_odds() -> 'by_rarity') r where r ->> 'id' in ('common', 'peu_commune', 'unique', 'alpha', 'omega')) >= 0.8 - 0.000001);
select pg_temp.expect('la somme des parts par rareté vaut 1',
  abs((select sum((r ->> 'share')::float) from jsonb_array_elements(public.{{P}}draw_odds() -> 'by_rarity') r) - 1) < 0.0001);
select pg_temp.expect('paliers Premium annoncés : 70 / 20 / 8 / 2 % dans cet ordre',
  (select string_agg(p ->> 'tier', ',' order by (p ->> 'p')::float desc) from jsonb_array_elements(public.{{P}}draw_odds() -> 'premium') p) = 'rare,super,ultra,fullart'
  and abs((select (p ->> 'p')::float from jsonb_array_elements(public.{{P}}draw_odds() -> 'premium') p where p ->> 'tier' = 'fullart') - 0.02) < 0.00001);

\echo '--- album automatique : chaque nouvelle carte est placée dans son emplacement ; les doublons ne changent rien'
select pg_temp.expect('une carte nouvelle par emplacement (type, rareté affichée) : autant d''annonces « nouvelle » que d''emplacements remplis',
  (select count(*) from drawn where is_new) = (select count(distinct (type_id, rarity_id)) from drawn));
select pg_temp.expect('autant de choix d''album que de cartes nouvelles', (select count(*) from public.{{P}}album_picks where user_id = :A) = (select count(*) from drawn where is_new));
select pg_temp.expect('chaque choix d''album est EXACTEMENT la carte nouvelle de cet emplacement (pas un doublon tiré plus tard)',
  not exists (select 1 from public.{{P}}album_picks p where p.user_id = :A and not exists (
    select 1 from drawn d where d.is_new and d.type_id = p.type_id and d.rarity_id = p.rarity_id and d.series = p.series and d.number = p.number and d.base = p.base_rarity)));
select pg_temp.expect('la rareté du choix est bien la rareté affichée de la carte', not exists (select 1 from public.{{P}}album_picks p where p.user_id = :A and p.rarity_id <> public.{{P}}rarity_id(p.number, p.series, p.type_id, p.base_rarity)));
select pg_temp.expect('l''emplacement existe donc dans l''album (album_view montre des choix)', (select count(*) from public.{{P}}album_view(:cat) where pick_series is not null) = (select count(*) from drawn where is_new));

\echo '--- booster doré : les nouvelles cartes vont aussi dans l''album'
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
select count(*) as picks_avant from public.{{P}}album_picks where user_id = :A \gset
with g as (select public.{{P}}open_booster() as j)
select (select count(*) from g, jsonb_array_elements(j -> 'cards') c where (c ->> 'is_new')::boolean) as nouvelles_cartes_dorees, (j ->> 'golden') as dore from g \gset
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
select pg_temp.expect('booster doré : une carte nouvelle = un choix d''album de plus', (select count(*) from public.{{P}}album_picks where user_id = :A) = :picks_avant + :nouvelles_cartes_dorees);

\echo '--- repli : une catégorie sans Peu commune et à stock minuscule se vide sans erreur, Communes d''abord'
delete from public.{{P}}cards; delete from public.{{P}}album_picks;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Slots Repli', 1, 10, '#ffffff', '#cccccc', '#000000', true) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'Mini', '🐭', 1, false) returning id as m1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:m1, 'common', 3, 3, 'simple'), (:m1, 'rare', 3, 3, 'simple');   -- 6 + 6 = 12 cartes
create temp table mini as
select x.b, t.ord::int as ord, t.c ->> 'base_rarity' as base from (select b, public.{{P}}open_booster() as j from generate_series(1, 2) b offset 0) x, jsonb_array_elements(x.j -> 'cards') with ordinality as t(c, ord);
select pg_temp.expect('1er booster : 3 Communes d''abord, puis (pas de Peu commune) des cartes tirées parmi toutes les restantes, une Rare en Premium', (select count(*) from mini where b = 1 and ord <= 3 and base = 'common') = 3 and (select count(*) from mini where b = 1) = 5 and (select base from mini where b = 1 and ord = 5) = 'rare');
select pg_temp.expect('2e booster : tire ce qui reste sans erreur', (select count(*) from mini where b = 2) >= 1);
select count(*) as cartes_tirees, (select closed from public.{{P}}categories where id = :cat2) as fermee from public.{{P}}cards where type_id = :m1;
do $$ declare n int := 0; begin
  -- on vide la catégorie : le dernier booster peut être incomplet, puis la catégorie se ferme et il n'y a plus de pool.
  -- Chaque ouverture est dans sa propre sous-transaction : l'erreur de fin de pool n'annule que la dernière tentative.
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
select pg_temp.expect('les 12 cartes de la catégorie ont toutes été tirées (aucune perdue, aucune en double)', (select count(*) from public.{{P}}cards where type_id = :m1) = 12);

-- nettoyage : on laisse la base comme on l'a trouvée
delete from public.{{P}}cards; delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name in ('Slots Test', 'Slots Repli');
\if :had_pc
\else
delete from public.{{P}}rarities where id = 'peu_commune';
\endif
update public.{{P}}categories set closed = false;
update public.{{P}}config set value = 84 where key = 'premium_weight_rare'; update public.{{P}}config set value = 13 where key = 'premium_weight_super';
update public.{{P}}config set value = 2.7 where key = 'premium_weight_ultra'; update public.{{P}}config set value = 0.3 where key = 'premium_weight_fullart';
