-- Booster Gold : récompense quand tous les emplacements d'une carte sont remplis dans l'album ; contenu 3 Rare + 1 Super Rare + une 5e carte au choix.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :A;
delete from public.{{P}}gold_rewards; delete from public.{{P}}album_picks; delete from public.{{P}}cards;
update public.{{P}}categories set closed = true;
update public.{{P}}config set value = 0 where key in ('rarity_exponent', 'series_reward_min_size');
select exists (select 1 from public.{{P}}rarities where id = 'artrare') as had_art \gset
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('artrare', 'Art Rare', 'range', 50, 4, '#fc0', '#a80', '#000') on conflict (id) do nothing;

\echo '--- une catégorie : deux cartes complètes en rareté (X, Z), une carte courte (Y), toutes à numéros visibles'
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Gold Test', 1, 100, '#fff', '#ccc', '#000', false) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Carte X', '🐱', 1, false) returning id as x \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Carte Z', '🐶', 2, false) returning id as z \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Carte Y', '🐭', 3, false) returning id as y \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty, r.rid, r.s, r.s, 'simple' from (values (:x), (:z)) t(ty) cross join (values ('common', 30), ('rare', 60), ('super', 40), ('artrare', 30)) r(rid, s);
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:y, 'common', 5, 0, 'simple');

\echo '--- les emplacements d''une carte : mêmes que ceux de l''album'
select pg_temp.expect('carte X : 7 emplacements (4 raretés ordinaires, Unique, Alpha, Omega)', (select count(*) from public.{{P}}type_album_slots(:x)) = 7);
select pg_temp.expect('carte Y (numéros masqués, une seule rareté) : 2 emplacements (Commune et Unique)', (select array_agg(rid order by rid) from public.{{P}}type_album_slots(:y)) = array['common', 'unique']);
select pg_temp.expect('mêmes emplacements que album_view pour X, Z et Y',
  (select array_agg(rarity_id order by rarity_id) from public.{{P}}album_view(:cat) where type_id = :x) = (select array_agg(rid order by rid) from public.{{P}}type_album_slots(:x))
  and (select array_agg(rarity_id order by rarity_id) from public.{{P}}album_view(:cat) where type_id = :z) = (select array_agg(rid order by rid) from public.{{P}}type_album_slots(:z))
  and (select array_agg(rarity_id order by rarity_id) from public.{{P}}album_view(:cat) where type_id = :y) = (select array_agg(rid order by rid) from public.{{P}}type_album_slots(:y)));
select pg_temp.expect('rarités reconnues par leur nom : Rare, Super Rare, Art Rare', public.{{P}}rarity_by_name('rare') = 'rare' and public.{{P}}rarity_by_name('super rare') = 'super' and public.{{P}}rarity_by_name('art rare') = 'artrare' and public.{{P}}rarity_by_name('inconnue') is null);

\echo '--- compléter la carte X : 6 emplacements sur 7 = rien ; le 7e = booster Gold'
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:x, 'common', 10, 5, :A), (:x, 'rare', 10, 5, :A), (:x, 'super', 10, 5, :A), (:x, 'artrare', 10, 5, :A),
  (:x, 'common', 10, 1, :A), (:x, 'common', 10, 10, :A), (:x, 'common', 1, 1, :A);
select public.{{P}}set_album_pick(:x, 'common', 10, 5) ->> 'ok' as p1;
select public.{{P}}set_album_pick(:x, 'rare', 10, 5) ->> 'ok' as p2;
select public.{{P}}set_album_pick(:x, 'super', 10, 5) ->> 'ok' as p3;
select public.{{P}}set_album_pick(:x, 'artrare', 10, 5) ->> 'ok' as p4;
select public.{{P}}set_album_pick(:x, 'common', 10, 1) ->> 'ok' as p5;
select public.{{P}}set_album_pick(:x, 'common', 10, 10) ->> 'ok' as p6;
select pg_temp.expect('6 emplacements sur 7 remplis : pas de booster Gold', (select count(*) from public.{{P}}gold_rewards) = 0);
select public.{{P}}set_album_pick(:x, 'common', 1, 1) ->> 'ok' as p7_unique;
select pg_temp.expect('7e emplacement rempli : un booster Gold pour la carte X', (select count(*) from public.{{P}}gold_rewards where user_id = :A and type_id = :x and opened_at is null and not seen) = 1);
select pg_temp.expect('le statut annonce le booster Gold (id, carte, annonce non vue)', (select (public.{{P}}status() -> 'gold_rewards' -> 0 ->> 'type_id')::int = :x and (public.{{P}}status() -> 'gold_rewards' -> 0 ->> 'seen')::boolean = false));
select public.{{P}}clear_album_pick(:x, 'rare') ->> 'ok' as vide;
select public.{{P}}set_album_pick(:x, 'rare', 10, 5) ->> 'ok' as remis;
select pg_temp.expect('vider puis remplir un emplacement ne donne pas un second booster Gold pour la même carte', (select count(*) from public.{{P}}gold_rewards where type_id = :x) = 1);

\echo '--- carte Y par placement automatique (comme un booster ou une offre)'
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:y, 'common', 4, 2, :A), (:y, 'common', 1, 1, :A);
select public.{{P}}auto_place_album(:A, :y, 'common', 4, 2);
select pg_temp.expect('Commune placée, Unique manquante : pas encore de récompense pour Y', (select count(*) from public.{{P}}gold_rewards where type_id = :y) = 0);
select public.{{P}}auto_place_album(:A, :y, 'common', 1, 1);
select pg_temp.expect('Unique placée : booster Gold pour la carte Y (placement automatique)', (select count(*) from public.{{P}}gold_rewards where type_id = :y) = 1);
select pg_temp.expect('deux boosters Gold à ouvrir dans le statut', jsonb_array_length(public.{{P}}status() -> 'gold_rewards') = 2);
select pg_temp.expect('un autre joueur n''a rien (B n''a aucune récompense)', (select count(*) from public.{{P}}gold_rewards where user_id = :B) = 0);

\echo '--- composition : 150 boosters Gold tirés pour la carte X'
update public.{{P}}config set value = 1 where key like 'gold_reward_weight_%';
create temp table gd as
select x.i, t.ord::int as ord, (t.c ->> 'type_id')::int as type_id, t.c ->> 'base_rarity' as base, t.c ->> 'rarity_id' as rid, (t.c ->> 'series')::int as series, (t.c ->> 'number')::int as number
from (select i, public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 150) i offset 0) x, jsonb_array_elements(x.j) with ordinality as t(c, ord);
select pg_temp.expect('chaque booster Gold contient 5 cartes', (select count(*) from gd) = 750 and (select min(c) from (select count(*) c from gd group by i) z) = 5);
select pg_temp.expect('cartes 1 à 3 : des Rare (rareté affichée Rare, jamais Alpha, Omega ni Unique)', (select count(*) from gd where ord <= 3 and rid = 'rare') = 450);
select pg_temp.expect('carte 4 : une Super Rare', (select count(*) from gd where ord = 4 and rid = 'super') = 150);
create temp table g5 as select *, case when rid in ('unique', 'alpha', 'omega') then rid else 'ordinaire' end as cls from gd where ord = 5;
select cls, count(*) as nb from g5 group by cls order by cls;
select pg_temp.expect('carte 5 : toujours une des possibilités (numérotée visible, Art Rare, Alpha, Omega ou Unique)', (select count(*) from g5) = 150 and not exists (select 1 from g5 where rid not in ('unique', 'alpha', 'omega', 'artrare', 'common', 'rare', 'super')));
select pg_temp.expect('carte 5 numérotée : toujours de la carte complétée X, à numéro visible du milieu (ni 1 ni dernier)', not exists (select 1 from g5 where rid in ('common', 'rare', 'super') and (type_id <> :x or number <= 1 or number >= series)));
select pg_temp.expect('carte 5 : Alpha, Omega et cartes ordinaires (numérotée ou Art Rare) apparaissent régulièrement', (select count(*) from g5 where rid = 'alpha') between 18 and 60 and (select count(*) from g5 where rid = 'omega') between 18 and 60 and (select count(*) from g5 where cls = 'ordinaire') between 45 and 100);
select pg_temp.expect('carte 5 : les Unique sortent (il y en a 7 de libres) et jamais plus', (select count(*) from g5 where rid = 'unique') between 3 and 7);
select pg_temp.expect('une carte Alpha tirée est bien le numéro 1 d''une série, une Omega le dernier', not exists (select 1 from g5 where rid = 'alpha' and number <> 1) and not exists (select 1 from g5 where rid = 'omega' and number <> series));
select pg_temp.expect('aucune carte tirée deux fois', (select count(*) from gd) = (select count(distinct (type_id, base, series, number)) from gd));

\echo '--- les poids de la 5e carte se règlent'
delete from public.{{P}}cards where owner_id = :A and number not in (1, 5, 10) or (owner_id = :A and series > 10);
update public.{{P}}config set value = 0 where key like 'gold_reward_weight_%';
update public.{{P}}config set value = 1 where key = 'gold_reward_weight_alpha';
create temp table g5a as select (t.c ->> 'rarity_id') as rid from (select public.{{P}}draw_gold_reward(:A, :z) as j from generate_series(1, 25)) x, jsonb_array_elements(x.j) with ordinality as t(c, ord) where t.ord = 5;
select pg_temp.expect('seul le poids Alpha est positif : la 5e carte est toujours une Alpha (25 sur 25)', (select count(*) from g5a where rid = 'alpha') = 25);
update public.{{P}}config set value = 0 where key = 'gold_reward_weight_alpha';
update public.{{P}}config set value = 1 where key = 'gold_reward_weight_artrare';
create temp table g5b as select (t.c ->> 'rarity_id') as rid from (select public.{{P}}draw_gold_reward(:A, :z) as j from generate_series(1, 25)) x, jsonb_array_elements(x.j) with ordinality as t(c, ord) where t.ord = 5;
select pg_temp.expect('seul le poids Art Rare est positif : la 5e carte est toujours une Art Rare (25 sur 25)', (select count(*) from g5b where rid = 'artrare') = 25);
update public.{{P}}config set value = 1 where key like 'gold_reward_weight_%';

\echo '--- ouvrir le booster Gold de X : une seule fois, par son propriétaire'
delete from public.{{P}}cards k where k.owner_id = :A and k.type_id in (:x, :z) and not exists (select 1 from public.{{P}}album_picks p where p.user_id = :A and p.type_id = k.type_id and p.series = k.series and p.number = k.number and p.base_rarity = k.base_rarity);
select id as rid_x from public.{{P}}gold_rewards where user_id = :A and type_id = :x \gset
select id as rid_y from public.{{P}}gold_rewards where user_id = :A and type_id = :y \gset
select count(*) as cartes_avant from public.{{P}}cards where owner_id = :A \gset
create temp table opened as select public.{{P}}open_gold_reward(:rid_x) as j;
select pg_temp.expect('l''ouverture renvoie 5 cartes et un statut, annoncée comme booster doré', (select jsonb_array_length(j -> 'cards') = 5 and (j ->> 'gold')::boolean and (j ->> 'golden')::boolean and (j -> 'status') is not null from opened));
select pg_temp.expect('les 5 cartes sont maintenant à A', (select count(*) from public.{{P}}cards where owner_id = :A) = :cartes_avant + 5);
select pg_temp.expect('la récompense est consommée (une seule restante : celle de Y)', (select opened_at is not null from public.{{P}}gold_rewards where id = :rid_x) and (select jsonb_array_length((j -> 'status') -> 'gold_rewards') = 1 from opened));
select pg_temp.try('select public.{{P}}open_gold_reward(' || :rid_x || ')');                                  -- no_gold_reward : déjà ouvert
set request.jwt.claim.sub = :B;
select pg_temp.try('select public.{{P}}open_gold_reward(' || :rid_y || ')');                                  -- no_gold_reward : ce n'est pas la sienne
set request.jwt.claim.sub = :A;
select pg_temp.expect('compléter de nouveau la carte X ne redonne pas de booster Gold (déjà gagné)', (select count(*) from public.{{P}}gold_rewards where type_id = :x) = 1);

\echo '--- annonce vue'
select pg_temp.expect('annonce non vue avant', exists (select 1 from public.{{P}}gold_rewards where user_id = :A and not seen));
select (public.{{P}}ack_gold_rewards() -> 'gold_rewards') is not null as accuse;
select pg_temp.expect('annonce marquée vue', not exists (select 1 from public.{{P}}gold_rewards where user_id = :A and not seen));

\echo '--- repli : une petite catégorie sans Super Rare ni Art Rare'
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Gold Mini', 2, 3, '#fff', '#ccc', '#000', false) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'Mini', '🐹', 1, false) returning id as m1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:m1, 'common', 3, 0, 'simple'), (:m1, 'rare', 3, 0, 'simple');
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:m1, 'common', 3, 2, :A), (:m1, 'rare', 3, 2, :A), (:m1, 'common', 1, 1, :A);
select public.{{P}}auto_place_album(:A, :m1, 'common', 3, 2);
select public.{{P}}auto_place_album(:A, :m1, 'rare', 3, 2);
select public.{{P}}auto_place_album(:A, :m1, 'common', 1, 1);
select id as rid_m from public.{{P}}gold_rewards where type_id = :m1 \gset
create temp table opened2 as select public.{{P}}open_gold_reward(:rid_m) as j;
select pg_temp.expect('petit stock : 5 cartes quand même (3 Rare, puis le repli), sans erreur', (select jsonb_array_length(j -> 'cards') = 5 from opened2));
select pg_temp.expect('cartes 1 à 3 : des Rare ; carte 4 : pas de Super Rare dans la catégorie, une carte ordinaire à la place', (select count(*) = 3 from opened2, jsonb_array_elements(j -> 'cards') with ordinality t(c, ord) where ord <= 3 and c ->> 'rarity_id' = 'rare')
  and (select c ->> 'rarity_id' from opened2, jsonb_array_elements(j -> 'cards') with ordinality t(c, ord) where ord = 4) <> 'super');
select pg_temp.expect('carte 5 : seule possibilité restante, la Unique (1/1 de la catégorie)', (select (c ->> 'rarity_id') = 'unique' from opened2, jsonb_array_elements(j -> 'cards') with ordinality t(c, ord) where ord = 5));

\echo '--- plus aucune carte à tirer : la récompense reste à ouvrir'
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Gold Vide', 3, 1, '#fff', '#ccc', '#000', false) returning id as cat3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat3, 'Seul', '🐰', 1, false) returning id as n1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:n1, 'common', 1, 0, 'simple');
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:n1, 'common', 1, 1, :A);
select public.{{P}}auto_place_album(:A, :n1, 'common', 1, 1);
select id as rid_n from public.{{P}}gold_rewards where type_id = :n1 \gset
select pg_temp.try('select public.{{P}}open_gold_reward(' || :rid_n || ')');                                  -- pool_empty
select pg_temp.expect('récompense intacte après l''erreur : toujours à ouvrir', (select opened_at is null from public.{{P}}gold_rewards where id = :rid_n));

\echo '--- rattrapage : les cartes déjà complètes avant la fonction reçoivent leur récompense une fois'
select count(*) as nb_avant from public.{{P}}gold_rewards \gset
delete from public.{{P}}gold_rewards;
select public.{{P}}gold_rewards_backfill() as recrees \gset
select pg_temp.expect('rattrapage : toutes les cartes complètes retrouvent leur récompense (4 sur 4)', :recrees = :nb_avant and (select count(*) from public.{{P}}gold_rewards) = :nb_avant);
select public.{{P}}gold_rewards_backfill() as recrees2 \gset
select pg_temp.expect('rattrapage idempotent : rien de plus au second passage', :recrees2 = 0 and (select count(*) from public.{{P}}gold_rewards) = :nb_avant);

\echo '--- droits'
select pg_temp.expect('joueur connecté : peut ouvrir et acquitter ; ni tirer, ni créer une récompense, ni lire la table',
  has_function_privilege('authenticated', 'public.{{P}}open_gold_reward(bigint)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}ack_gold_rewards()', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}draw_gold_reward(uuid, int)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}check_type_reward(uuid, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}gold_pick_card(int, text, text, int, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.{{P}}open_gold_reward(bigint)', 'execute') and not has_table_privilege('authenticated', 'public.{{P}}gold_rewards', 'select'));

-- nettoyage
delete from public.{{P}}gold_rewards; delete from public.{{P}}album_picks; delete from public.{{P}}cards;
delete from public.{{P}}categories where name in ('Gold Test', 'Gold Mini', 'Gold Vide');
\if :had_art
\else
delete from public.{{P}}rarities where id = 'artrare';
\endif
update public.{{P}}categories set closed = false;
