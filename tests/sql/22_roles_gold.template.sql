-- Booster Gold paramétrable dans le module Boosters (rôle « card_reward »), boosters OneMore (abonnés) et cadeau des abonnés, protections des rôles.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'aucune erreur'; exception when others then return sqlerrm; end $$;

set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
create temp table ub_backup as select * from public.{{P}}user_boosters;
create temp table rn_backup as select id, name from public.{{P}}rarities;
create temp table cf_backup as select * from public.{{P}}config where key like 'gold_reward_weight_%';
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
set request.jwt.claim.sub = :A;
select id as std from public.{{P}}booster_types where is_standard \gset

\echo '--- les trois boosters de rôle existent après le schéma'
select pg_temp.expect('un seul booster par rôle : Gold (récompense), OneMore (abonnés), Art Rare assuré (cadeau)', (select string_agg(role || ':' || name, ',' order by role) from public.{{P}}booster_types where role is not null) = 'card_reward:Gold,subscriber:OneMore,subscription_gift:Art Rare assuré');
select pg_temp.expect('jamais en vente ni actifs par défaut en stock : prix nul, activés, 5 cartes avec une répartition par carte', (select bool_and(price_coins is null and enabled and cards = 5) from public.{{P}}booster_types where role is not null)
  and (select bool_and(n = 5) from (select count(distinct s.position) n from public.{{P}}booster_type_slots s join public.{{P}}booster_types b on b.id = s.booster_type_id where b.role is not null group by b.id) z));
select pg_temp.expect('les anciens réglages gold_reward_weight_* ont disparu', not exists (select 1 from public.{{P}}config where key like 'gold_reward_weight_%'));
select pg_temp.expect('halo de départ : Standard sans halo, OneMore et Gold dorés, cadeau des abonnés violet', (select glow from public.{{P}}booster_types where is_standard) = 'none'
  and (select string_agg(role || ':' || glow, ',' order by role) from public.{{P}}booster_types where role is not null) = 'card_reward:gold,subscriber:gold,subscription_gift:purple');

\echo '--- semis d''après les NOMS des raretés (identifiants permutés), anciens poids du Gold repris'
delete from public.{{P}}booster_types where role is not null;
update public.{{P}}rarities set name = name || ' (origine)' where kind = 'range';
delete from public.{{P}}rarities where id like 'zz_%';
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values
  ('zz_a', 'Commune', 'range', 1500, 9, '#ddd', '#bbb', '#000'), ('zz_b', 'Peu Commune', 'range', 1000, 8, '#aaa', '#888', '#000'), ('zz_c', 'Rare', 'range', 250, 7, '#0a0', '#060', '#fff'),
  ('zz_d', 'Super Rare', 'range', 100, 6, '#00f', '#008', '#fff'), ('zz_e', 'Ultra Rare', 'range', 35, 5, '#f04', '#a02', '#fff'), ('zz_f', 'Art Rare', 'range', 50, 4, '#fc0', '#a80', '#000');
insert into public.{{P}}config (key, value, description) values ('gold_reward_weight_numbered', 3, 'x'), ('gold_reward_weight_artrare', 2, 'x'), ('gold_reward_weight_alpha', 1, 'x'), ('gold_reward_weight_omega', 1, 'x'), ('gold_reward_weight_unique', 4, 'x');
insert into public.{{P}}booster_types (name, cards, color, position) values ('Gold', 3, '#111111', 99);   -- un nom déjà pris par un booster ordinaire
select public.{{P}}seed_role_boosters();
select pg_temp.expect('le nom « Gold » étant déjà pris, le booster de récompense s''appelle « Gold 2 » (jamais de doublon de nom)', (select count(*) from public.{{P}}booster_types where role = 'card_reward' and name = 'Gold 2') = 1 and (select count(*) from public.{{P}}booster_types where lower(name) = 'gold') = 1);
select pg_temp.expect('Gold semé : halo doré', (select glow from public.{{P}}booster_types where role = 'card_reward') = 'gold' and (select glow from public.{{P}}booster_types where role = 'subscriber') = 'gold' and (select glow from public.{{P}}booster_types where role = 'subscription_gift') = 'purple');
select pg_temp.expect('Gold : cartes 1 à 3 Rare (zz_c), carte 4 Super Rare (zz_d), cartes 1 à 4 à 100',
  (select string_agg(position || ':' || rarity_id || ':' || weight, ',' order by position) from public.{{P}}booster_type_slots where booster_type_id = (select id from public.{{P}}booster_types where role = 'card_reward') and position <= 4) = '1:zz_c:100,2:zz_c:100,3:zz_c:100,4:zz_d:100');
select pg_temp.expect('Gold carte 5 : poids repris des anciens réglages (numérotée 3, Art Rare 2, Alpha 1, Omega 1, Unique 4)',
  (select string_agg(rarity_id || ':' || weight, ',' order by rarity_id) from public.{{P}}booster_type_slots where booster_type_id = (select id from public.{{P}}booster_types where role = 'card_reward') and position = 5) = 'alpha:1,numbered:3,omega:1,unique:4,zz_f:2');
select pg_temp.expect('les anciens réglages sont supprimés après reprise', not exists (select 1 from public.{{P}}config where key like 'gold_reward_weight_%'));
select pg_temp.expect('OneMore : meilleures cartes que le Standard (carte 2 Commune/Peu Commune 50-50, carte 3 Peu Commune 70 / Rare 30, carte 5 Super Rare 55 / Ultra 30 / Art Rare 12 / Unique 3)',
  (select string_agg(position || ':' || rarity_id || ':' || weight, ',' order by position, rarity_id) from public.{{P}}booster_type_slots where booster_type_id = (select id from public.{{P}}booster_types where role = 'subscriber') and position in (2, 3, 5))
  = '2:zz_a:50,2:zz_b:50,3:zz_b:70,3:zz_c:30,5:unique:3,5:zz_d:55,5:zz_e:30,5:zz_f:12');
select pg_temp.expect('cadeau des abonnés : la carte 5 est une Art Rare à 100 %', (select string_agg(rarity_id || ':' || weight, ',') from public.{{P}}booster_type_slots where booster_type_id = (select id from public.{{P}}booster_types where role = 'subscription_gift') and position = 5) = 'zz_f:100');
select public.{{P}}seed_role_boosters();
select pg_temp.expect('relancer le semis ne crée rien de plus (une seule fois par rôle)', (select count(*) from public.{{P}}booster_types where role is not null) = 3);
delete from public.{{P}}booster_types where role = 'subscription_gift';
delete from public.{{P}}rarities where id = 'zz_f';
select public.{{P}}seed_role_boosters();
select pg_temp.expect('sans Art Rare dans la base, le cadeau des abonnés prend la rareté ordinaire la plus haute pour sa carte 5 (jamais une carte sans choix)',
  (select rarity_id from public.{{P}}booster_type_slots where booster_type_id = (select id from public.{{P}}booster_types where role = 'subscription_gift') and position = 5) = (select id from public.{{P}}rarities where kind = 'range' order by sort_order asc limit 1));
-- tout remettre
delete from public.{{P}}booster_types where id not in (select id from bt_backup) or role is not null;
delete from public.{{P}}config where key like 'gold_reward_weight_%';
update public.{{P}}rarities r set name = b.name from rn_backup b where b.id = r.id;
delete from public.{{P}}rarities where id like 'zz_%';
insert into public.{{P}}booster_types overriding system value select * from bt_backup where role is not null;
insert into public.{{P}}booster_type_slots select * from sl_backup where booster_type_id in (select id from bt_backup where role is not null) on conflict do nothing;
select id as gold from public.{{P}}booster_types where role = 'card_reward' \gset
select id as onemore from public.{{P}}booster_types where role = 'subscriber' \gset
select id as gift from public.{{P}}booster_types where role = 'subscription_gift' \gset

\echo '--- le Gold se règle dans le module Boosters : contenu, nombre de cartes et poids lus par le tirage'
update public.{{P}}categories set closed = true;
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('artrare', 'Art Rare', 'range', 50, 4, '#fc0', '#a80', '#000') on conflict (id) do nothing;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Gold Param', 1, 100, '#fff', '#ccc', '#000', false) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Carte X', '🐱', 1, false) returning id as x \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Carte Z', '🐶', 2, false) returning id as z \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select ty, r.rid, r.s, r.s, 'simple' from (values (:x), (:z)) t(ty) cross join (values ('common', 30), ('rare', 60), ('super', 40), ('artrare', 30)) r(rid, s);
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 5, '#d4af37', null,  true,
  '[{"position":1,"rarity_id":"rare","weight":100},{"position":2,"rarity_id":"rare","weight":100},{"position":3,"rarity_id":"rare","weight":100},{"position":4,"rarity_id":"super","weight":100},{"position":5,"rarity_id":"alpha","weight":100}]'::jsonb, 'card_reward') ->> 'ok' as gold_regle;
create temp table d1 as select (t.c ->> 'rarity_id') as rid, t.ord::int as ord from (select public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 20)) x, jsonb_array_elements(x.j) with ordinality t(c, ord);
select pg_temp.expect('cartes 1 à 3 : des Rare, carte 4 : une Super Rare, carte 5 : une Alpha (100 %) — 20 boosters, 100 cartes', (select count(*) from d1) = 100 and (select count(*) from d1 where ord <= 3 and rid = 'rare') = 60 and (select count(*) from d1 where ord = 4 and rid = 'super') = 20 and (select count(*) from d1 where ord = 5 and rid = 'alpha') = 20);
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 3, '#d4af37', null, true,
  '[{"position":1,"rarity_id":"super","weight":100},{"position":2,"rarity_id":"super","weight":100},{"position":3,"rarity_id":"unique","weight":100}]'::jsonb, 'card_reward') ->> 'ok' as gold_3_cartes;
create temp table d2 as select (t.c ->> 'rarity_id') as rid, (t.c ->> 'series')::int as series, t.ord::int as ord from (select public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 6)) x, jsonb_array_elements(x.j) with ordinality t(c, ord);
select pg_temp.expect('le nombre de cartes se règle aussi : 3 cartes (Super Rare, Super Rare, Unique 1/1)', (select count(*) from d2) = 18 and (select count(*) from d2 where ord <= 2 and rid = 'super') = 12 and (select count(*) from d2 where ord = 3 and rid = 'unique' and series = 1) = 6);
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 1, '#d4af37', null, true, '[{"position":1,"rarity_id":"numbered","weight":100}]'::jsonb, 'card_reward') ->> 'ok' as gold_numerote;
create temp table d3 as select (t.c ->> 'type_id')::int as type_id, (t.c ->> 'number')::int as number, (t.c ->> 'series')::int as series, (t.c ->> 'rarity_id') as rid from (select public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 30)) x, jsonb_array_elements(x.j) t(c);
select pg_temp.expect('« numbered » : une carte à numéro visible de la carte complétée (X), jamais la première ni la dernière de sa série', (select count(*) from d3) = 30 and not exists (select 1 from d3 where type_id <> :x or number <= 1 or number >= series or rid in ('alpha', 'omega', 'unique')));
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 1, '#d4af37', null, true, '[{"position":1,"rarity_id":"alpha","weight":90},{"position":1,"rarity_id":"omega","weight":10}]'::jsonb, 'card_reward') ->> 'ok' as gold_poids;
create temp table d4 as select (t.c ->> 'rarity_id') as rid from (select public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 200)) x, jsonb_array_elements(x.j) t(c);
select rid, count(*) as nb from d4 group by rid order by count(*) desc;
select pg_temp.expect('poids Alpha 90 / Omega 10 : sur 200 cartes, environ 180 Alpha et 20 Omega (marge de 5 sigmas)', (select count(*) from d4 where rid = 'alpha') between 160 and 196 and (select count(*) from d4 where rid = 'omega') between 4 and 40 and (select count(*) from d4) = 200);
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 2, '#d4af37', null, true, '[{"position":1,"rarity_id":"rare","weight":100},{"position":2,"rarity_id":"common","weight":100}]'::jsonb, 'card_reward') ->> 'ok' as gold_ordinaires;
create temp table d5 as select (t.c ->> 'rarity_id') as rid, t.ord::int as ord from (select public.{{P}}draw_gold_reward(:A, :x) as j from generate_series(1, 60)) x, jsonb_array_elements(x.j) with ordinality t(c, ord);
select pg_temp.expect('une rareté ordinaire du Gold ne donne jamais d''Alpha, d''Omega ni d''Unique (carte « du milieu » seulement) : 60 Rare et 60 Commune',
  (select count(*) from d5 where ord = 1 and rid = 'rare') = 60 and (select count(*) from d5 where ord = 2 and rid = 'common') = 60);
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Gold', 5, '#d4af37', null, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"common","weight":1},{"position":5,"rarity_id":"common","weight":1}]'::jsonb, 'card_reward') ->> 'ok' as gold_remis;

\echo '--- ouvrir un Gold gagné : le nom du booster vient du module'
delete from public.{{P}}gold_rewards where user_id = :A;
insert into public.{{P}}gold_rewards (user_id, type_id) values (:A, :x);
select public.{{P}}admin_save_booster_type('thomarie', :gold, 'Booster Or', 5, '#d4af37', null, true, '[{"position":1,"rarity_id":"rare","weight":100},{"position":2,"rarity_id":"rare","weight":100},{"position":3,"rarity_id":"rare","weight":100},{"position":4,"rarity_id":"super","weight":100},{"position":5,"rarity_id":"unique","weight":100}]'::jsonb, 'card_reward') ->> 'ok' as renomme;
select id as rid from public.{{P}}gold_rewards where user_id = :A \gset
create temp table og as select public.{{P}}open_gold_reward(:rid) as j;
select pg_temp.expect('le booster ouvert porte le nom réglé dans le module (« Booster Or ») et contient 5 cartes', (select j -> 'booster' ->> 'name' = 'Booster Or' and jsonb_array_length(j -> 'cards') = 5 from og));
select pg_temp.expect('le statut annonce le booster de récompense (nom, couleur)', (public.{{P}}status() -> 'reward_booster' ->> 'name') = 'Booster Or' and (public.{{P}}status() -> 'reward_booster' ->> 'color') = '#d4af37');

\echo '--- choix possibles : Alpha, Omega et « numbered » seulement pour le booster de récompense'
select pg_temp.expect('un booster ordinaire refuse Alpha, Omega et « numbered »',
  pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Test ordinaire', 1, '#000000', null, true, '[{"position":1,"rarity_id":"alpha","weight":1}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Test ordinaire', 1, '#000000', null, true, '[{"position":1,"rarity_id":"omega","weight":1}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Test ordinaire', 1, '#000000', null, true, '[{"position":1,"rarity_id":"numbered","weight":1}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Test abonnés', 1, '#000000', null, true, '[{"position":1,"rarity_id":"numbered","weight":1}]'::jsonb, 'subscriber')$q$) = 'invalid_booster_slots');
select pg_temp.expect('une rareté inconnue est refusée même pour le booster de récompense', pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :gold || ', ''Gold'', 1, ''#d4af37'', null, true, ''[{"position":1,"rarity_id":"mystere","weight":1}]''::jsonb, ''card_reward'')') = 'invalid_booster_slots');

\echo '--- rôles : un seul booster par rôle, le Gold ne peut ni perdre son rôle ni être supprimé'
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Silver rôle', 2, '#c0c0c0', 40, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as silver \gset
select pg_temp.expect('refus : retirer le rôle de récompense au seul booster qui l''a ; refus aussi de le supprimer', pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :gold || ', ''Gold'', 5, ''#d4af37'', null, true, ''[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"common","weight":1},{"position":5,"rarity_id":"common","weight":1}]''::jsonb)') = 'booster_protected'
  and pg_temp.err('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :gold || ')') = 'booster_protected');
select public.{{P}}admin_save_booster_type('thomarie', :silver, 'Silver rôle', 2, '#c0c0c0', 40, true, '[{"position":1,"rarity_id":"rare","weight":1},{"position":2,"rarity_id":"unique","weight":1}]'::jsonb, 'card_reward') ->> 'ok' as role_passe;
select pg_temp.expect('donner le rôle de récompense à un autre booster le lui enlève : un seul « card_reward », le prix est remis à zéro, il reste actif', (select count(*) from public.{{P}}booster_types where role = 'card_reward') = 1
  and (select (role, price_coins is null, enabled) = ('card_reward', true, true) from public.{{P}}booster_types where id = :silver) and (select role is null from public.{{P}}booster_types where id = :gold));
select pg_temp.err('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :gold || ')') as suppression \gset
\echo 'résultat de la suppression :' :suppression
select pg_temp.expect('l''ancien booster de récompense peut maintenant être supprimé', :'suppression' = 'aucune erreur' and not exists (select 1 from public.{{P}}booster_types where id = :gold));
select pg_temp.expect('rôle inconnu refusé ; le Standard ne garde jamais de rôle', pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :silver || ', ''Silver rôle'', 2, ''#c0c0c0'', 40, true, ''[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]''::jsonb, ''vip'')') = 'invalid_booster');
select public.{{P}}admin_save_booster_type('thomarie', :std, 'Standard', 5, '#e8452e', null, true, (select jsonb_agg(jsonb_build_object('position', position, 'rarity_id', rarity_id, 'weight', weight)) from public.{{P}}booster_type_slots where booster_type_id = :std), 'subscriber') ->> 'ok' as std_role;
select pg_temp.expect('essayer de donner un rôle au Standard ne marche pas (le rôle des abonnés reste à OneMore)', (select role is null from public.{{P}}booster_types where id = :std) and (select role from public.{{P}}booster_types where id = :onemore) = 'subscriber');

\echo '--- le stock : les boosters de rôle ne s''ouvrent ni ne s''achètent ni ne s''offrent comme des boosters ordinaires'
update public.{{P}}profiles set coins = 1000 where id = :A;
select pg_temp.expect('OneMore (abonnés) et Gold (récompense) : ouverture refusée', pg_temp.err('select public.{{P}}open_booster_of_type(' || :onemore || ')') = 'unknown_booster' and pg_temp.err('select public.{{P}}open_booster_of_type(' || :silver || ')') = 'unknown_booster');
select pg_temp.expect('dons refusés pour ces deux rôles, autorisés pour le cadeau des abonnés', pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :onemore || ', 1, null)') = 'unknown_booster' and pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :silver || ', 1, null)') = 'unknown_booster'
  and pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :gift || ', 1, ''ami_beta_inconnu'')') = 'user_not_found');
select pg_temp.expect('achat impossible (aucun prix) : OneMore et Gold', pg_temp.err('select public.{{P}}buy_booster(' || :onemore || ', 1)') = 'not_for_sale' and pg_temp.err('select public.{{P}}buy_booster(' || :silver || ', 1)') = 'not_for_sale');
select pg_temp.expect('le statut ne propose ni OneMore ni Gold dans « autres boosters »', not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where (b ->> 'id')::int in (:onemore, :silver)));
select pg_temp.expect('le cadeau des abonnés n''apparaît que si le joueur en a en stock', not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where (b ->> 'id')::int = :gift));
select public.{{P}}admin_grant_boosters('thomarie', :gift, 2, null) ->> 'players' as offerts;
select pg_temp.expect('offert, le cadeau des abonnés s''ouvre comme un booster de stock', (select (b ->> 'quantity')::int from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where (b ->> 'id')::int = :gift) = 2);

\echo '--- une rareté utilisée dans une répartition ne peut plus être supprimée'
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('zz_t', 'Test supprimable', 'range', 5, 3, '#111', '#222', '#fff');
select public.{{P}}admin_save_booster_type('thomarie', :silver, 'Silver rôle', 2, '#c0c0c0', null, true, '[{"position":1,"rarity_id":"zz_t","weight":1},{"position":2,"rarity_id":"unique","weight":1}]'::jsonb, 'card_reward') ->> 'ok' as utilise;
select pg_temp.expect('rareté utilisée par un booster : suppression refusée (plus de suppression silencieuse de la répartition)', pg_temp.err($q$select public.{{P}}admin_delete_rarity('thomarie', 'zz_t')$q$) = 'rarity_in_use' and exists (select 1 from public.{{P}}booster_type_slots where rarity_id = 'zz_t'));
select public.{{P}}admin_save_booster_type('thomarie', :silver, 'Silver rôle', 2, '#c0c0c0', null, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"unique","weight":1}]'::jsonb, 'card_reward') ->> 'ok' as libere;
select public.{{P}}admin_delete_rarity('thomarie', 'zz_t') ->> 'ok' as supprimee;
select pg_temp.expect('une fois retirée des répartitions, la rareté se supprime', not exists (select 1 from public.{{P}}rarities where id = 'zz_t'));


\echo '--- halo de lumière : réglage par booster, visible dans le statut et les résultats d''ouverture'
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Halo test', 1, '#112233', 10, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb, null, 'rainbow') ->> 'id')::int as halo \gset
select pg_temp.expect('un booster enregistré avec le halo « rainbow » le garde', (select glow from public.{{P}}booster_types where id = :halo) = 'rainbow');
select public.{{P}}admin_save_booster_type('thomarie', :halo, 'Halo test', 1, '#112233', 10, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb, null, 'silver') ->> 'ok' as modif;
select pg_temp.expect('modifier le halo (argenté) le change', (select glow from public.{{P}}booster_types where id = :halo) = 'silver');
select public.{{P}}admin_save_booster_type('thomarie', :halo, 'Halo test', 1, '#112233', 10, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb) ->> 'ok' as sans_halo;
select pg_temp.expect('sans halo précisé (appel ancien) : « none », jamais une valeur au hasard', (select glow from public.{{P}}booster_types where id = :halo) = 'none');
select pg_temp.expect('halo inconnu refusé (invalid_booster) ; halo nul = aucun', pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :halo || ', ''Halo test'', 1, ''#112233'', 10, true, ''[{"position":1,"rarity_id":"common","weight":1}]''::jsonb, null, ''arc'')') = 'invalid_booster'
  and pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :halo || ', ''Halo test'', 1, ''#112233'', 10, true, ''[{"position":1,"rarity_id":"common","weight":1}]''::jsonb, null, null)') = 'aucune erreur' and (select glow from public.{{P}}booster_types where id = :halo) = 'none');
select pg_temp.expect('tous les halos de la liste sont acceptés', (select bool_and(pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :halo || ', ''Halo test'', 1, ''#112233'', 10, true, ''[{"position":1,"rarity_id":"common","weight":1}]''::jsonb, null, ''' || g || ''')') = 'aucune erreur') from unnest(array['none', 'gold', 'silver', 'red', 'blue', 'green', 'purple', 'rainbow']) g));
select public.{{P}}admin_save_booster_type('thomarie', :halo, 'Halo test', 1, '#112233', 10, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb, null, 'rainbow') ->> 'ok' as remis;
select public.{{P}}admin_grant_boosters('thomarie', :halo, 2, null) ->> 'players' as offerts;
select pg_temp.expect('le statut donne le halo de chaque booster du joueur (liste des autres boosters, booster standard, booster de récompense)', (select b ->> 'glow' from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where (b ->> 'id')::int = :halo) = 'rainbow'
  and (public.{{P}}status() -> 'standard_booster' ->> 'glow') = 'none' and (public.{{P}}status() -> 'reward_booster' ->> 'glow') = (select glow from public.{{P}}booster_types where role = 'card_reward'));
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Halo Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat4 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat4, 'Halo ' || g, '🐱', g, false from generate_series(1, 3) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t.id, 'common', 40, 40, 'simple' from public.{{P}}types t where t.category_id = :cat4;
create temp table og2 as select public.{{P}}open_booster_of_type(:halo) as j;
select pg_temp.expect('l''ouverture d''un booster de stock renvoie son nom et son halo (pour l''animation)', (select j -> 'booster' ->> 'name' = 'Halo test' and j -> 'booster' ->> 'glow' = 'rainbow' from og2));
select pg_temp.expect('l''ouverture d''un Gold renvoie le halo du booster de récompense', (select (j -> 'booster' ->> 'glow') = (select glow from public.{{P}}booster_types where role = 'card_reward') from og));

\echo '--- Art Rare : tirée au hasard parmi TOUTES les cartes qui ont cette rareté (pas toujours la même)'
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Art Rare Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat3, 'Art ' || g, '🎨', g, false from generate_series(1, 6) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select t.id, r.rid, 50, 50, 'simple' from public.{{P}}types t cross join (values ('common'), ('artrare')) r(rid) where t.category_id = :cat3;
select public.{{P}}admin_save_booster_type('thomarie', :gift, 'Art Rare assuré', 5, '#f59e0b', null, true,
  '[{"position":1,"rarity_id":"artrare","weight":100},{"position":2,"rarity_id":"artrare","weight":100},{"position":3,"rarity_id":"artrare","weight":100},{"position":4,"rarity_id":"artrare","weight":100},{"position":5,"rarity_id":"artrare","weight":100}]'::jsonb, 'subscription_gift', 'purple') ->> 'ok' as gift_regle;
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
delete from public.{{P}}user_boosters where user_id = :A and booster_type_id = :gift;
insert into public.{{P}}user_boosters (user_id, booster_type_id, quantity) values (:A, :gift, 40);
create temp table ar as select (c ->> 'type_id')::int as type_id, (c ->> 'base_rarity') as base, (c ->> 'rarity_id') as rid, (c ->> 'number')::int as num from (select public.{{P}}open_booster_of_type(:gift) as j from generate_series(1, 30)) x, jsonb_array_elements(x.j -> 'cards') c;
select type_id, count(*) as nb from ar group by type_id order by type_id;
select pg_temp.expect('30 boosters « Art Rare assuré » (6 cartes possibles) : 150 cartes, toutes de la rareté Art Rare (la 1re et la dernière d''une série s''affichent Alpha et Omega)', (select count(*) from ar) = 150 and (select count(*) from ar where base = 'artrare') = 150);
select pg_temp.expect('l''Art Rare est répartie sur les 6 cartes (chacune environ 25 fois sur 150), jamais toujours la même', (select count(distinct type_id) from ar) = 6 and (select min(n) from (select count(*) n from ar group by type_id) z) >= 6 and (select max(n) from (select count(*) n from ar group by type_id) z) <= 48);
create temp table arb as select x.b, (c ->> 'type_id')::int as type_id from (select g as b, public.{{P}}open_booster_of_type(:gift) as j from generate_series(1, 6) g) x, jsonb_array_elements(x.j -> 'cards') c;
select pg_temp.expect('dans un même booster, jamais deux fois la même carte pour une même rareté (6 boosters de 5 cartes différentes)', (select count(*) from arb) = 30 and not exists (select 1 from arb group by b, type_id having count(*) > 1));
-- une seule carte porte l'Art Rare : c'est forcément toujours elle (c'est le comportement attendu, à vérifier dans les types de la catégorie)
delete from public.{{P}}type_rarities where rarity_id = 'artrare' and type_id <> (select min(id) from public.{{P}}types where category_id = :cat3) and type_id in (select id from public.{{P}}types where category_id = :cat3);
update public.{{P}}user_boosters set quantity = 40 where user_id = :A and booster_type_id = :gift;
create temp table ar1 as select (c ->> 'type_id')::int as type_id from (select public.{{P}}open_booster_of_type(:gift) as j from generate_series(1, 10)) x, jsonb_array_elements(x.j -> 'cards') c where (c ->> 'rarity_id') = 'artrare';
select pg_temp.expect('si une SEULE carte de la catégorie possède l''Art Rare, toutes les Art Rare tirées sont cette carte (le tirage ne peut pas en inventer d''autres)', (select count(*) from ar1) >= 40 and (select count(distinct type_id) from ar1) = 1);
update public.{{P}}categories set closed = false;
delete from public.{{P}}categories where name = 'Art Rare Param';

-- nettoyage : on laisse la base comme on l'a trouvée
delete from public.{{P}}gold_rewards; delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
delete from public.{{P}}categories where name = 'Gold Param';
delete from public.{{P}}categories where name = 'Halo Param';
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}booster_types where id in (select id from bt_backup);
insert into public.{{P}}booster_types overriding system value select * from bt_backup;
insert into public.{{P}}booster_type_slots select * from sl_backup;
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
delete from public.{{P}}rarities where id in ('artrare', 'zz_t') and id not in (select id from rn_backup);
update public.{{P}}profiles set coins = 0 where id = :A;
update public.{{P}}categories set closed = false;
