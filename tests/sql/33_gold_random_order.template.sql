-- Hasard = booster Gold (même contenu que le booster Gold du module Boosters) ; ordre d'affichage des boosters réglable dans l'admin.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
create temp table cfg_backup as select * from public.{{P}}config where key in ('golden_booster_chance', 'card_reward_booster');
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Hasard Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'H' || g, '🐱', g, false from generate_series(1, 12) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t.id, r.rid, r.s, case when r.rid = 'common' then 0 else r.s end, 'simple' from public.{{P}}types t cross join (values ('common', 30), ('rare', 12), ('super', 10), ('ultra', 8)) r(rid, s) where t.category_id = :cat;
update public.{{P}}config set value = 0 where key = 'card_reward_booster';
update public.{{P}}profiles set boosters = 200, bonus_boosters = 0 where id = :A;
update public.{{P}}config set value = 1000 where key = 'max_boosters';
select id as std from public.{{P}}booster_types where is_standard \gset
select id as gold, cards as gold_cards, name as gold_name from public.{{P}}booster_types where role = 'card_reward' \gset

\echo '--- hasard : un booster Gold'
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
create temp table n0 as select public.{{P}}open_booster(:cat) as j from generate_series(1, 6);
select pg_temp.expect('chance à 0 : jamais de booster Gold (booster Standard de 5 cartes)', (select count(*) from n0 where (j ->> 'golden')::boolean) = 0 and (select bool_and(jsonb_array_length(j -> 'cards') = 5 and (j -> 'booster' ->> 'id')::int = :std) from n0));
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
create temp table n1 as select public.{{P}}open_booster(:cat) as j from generate_series(1, 6);
select pg_temp.expect('chance à 1 : toujours un booster Gold, annoncé avec son nom, de la taille du booster Gold', (select bool_and((j ->> 'golden')::boolean and jsonb_array_length(j -> 'cards') = :gold_cards and (j -> 'booster' ->> 'id')::int = :gold and j -> 'booster' ->> 'name' = :'gold_name') from n1));
select pg_temp.expect('ces boosters Gold tirés au hasard consomment un booster du stock gratuit chacun (200 - 12)', (select boosters from public.{{P}}profiles where id = :A) = 188);
select pg_temp.expect('toutes les cartes sont de la collection ouverte et jamais deux fois la même dans un booster', (select count(*) from n1, jsonb_array_elements(j -> 'cards') c where (c ->> 'type_id')::int not in (select id from public.{{P}}types where category_id = :cat)) = 0
  and not exists (select 1 from (select j, (c ->> 'type_id') t from n1, jsonb_array_elements(j -> 'cards') c) z group by j, t having count(*) > 1));
select pg_temp.expect('le booster Gold tiré au hasard suit SA répartition : 3 Rare, 1 Super Rare puis une carte numérotée (par défaut) : au moins une Rare et une Super Rare par booster', (select bool_and(exists (select 1 from jsonb_array_elements(j -> 'cards') c where c ->> 'base_rarity' = 'rare') and exists (select 1 from jsonb_array_elements(j -> 'cards') c where c ->> 'base_rarity' = 'super')) from n1));
select pg_temp.expect('les chances de tirage annoncent le booster Gold tiré au hasard (sa chance et son nom), plus de « booster doré »', (select (public.{{P}}draw_odds(:cat) -> 'gold' ->> 'name') = :'gold_name' and (public.{{P}}draw_odds(:cat) -> 'gold' ->> 'chance')::float = 1 and not (public.{{P}}draw_odds(:cat) ? 'golden')));
-- booster Gold indisponible (état impossible depuis l'admin, simulé en retirant son rôle) : repli sur un booster normal, sans erreur
update public.{{P}}booster_types set role = null where id = :gold;
create temp table n2 as select public.{{P}}open_booster(:cat) as j from generate_series(1, 3);
update public.{{P}}booster_types set role = 'card_reward' where id = :gold;
select pg_temp.expect('booster Gold introuvable : repli sur un booster normal (pas d''erreur, pas de booster Gold annoncé)', (select bool_and(not (j ->> 'golden')::boolean and jsonb_array_length(j -> 'cards') = 5 and (j -> 'booster' ->> 'id')::int = :std) from n2));
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';

\echo '--- ordre d''affichage des boosters'
update public.{{P}}profiles set boosters = 5 where id = :A;
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Ordre A', 2, '#111111', 30, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as oa \gset
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Ordre B', 2, '#222222', 40, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as ob \gset
create or replace function pg_temp.ordre() returns text language sql as $$
  select string_agg(e ->> 'name', ' > ' order by ord) from jsonb_array_elements(public.{{P}}status() -> 'booster_types') with ordinality t(e, ord) where e ->> 'name' like 'Ordre %' $$;
select pg_temp.expect('nouveaux boosters : ajoutés à la suite (A puis B), leur position est dans le statut', pg_temp.ordre() = 'Ordre A > Ordre B' and (select (e ->> 'position')::int from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e where e ->> 'name' = 'Ordre B') > (select (e ->> 'position')::int from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e where e ->> 'name' = 'Ordre A'));
select public.{{P}}admin_save_booster_type('thomarie', :oa, 'Ordre A', 2, '#111111', 30, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb, null, 'none', 1);
select pg_temp.expect('position 1 pour A : A passe avant tout le monde', (select (e ->> 'position')::int from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e where e ->> 'name' = 'Ordre A') = 1 and (select e ->> 'name' from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e order by (e ->> 'position')::int, (e ->> 'id')::int limit 1) = 'Ordre A');
select public.{{P}}admin_save_booster_type('thomarie', :ob, 'Ordre B', 2, '#222222', 40, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb, null, 'none', 1);
select pg_temp.expect('A et B à la position 1 : à égalité, le plus ancien (A) d''abord ; la liste du statut suit (position puis identifiant)', pg_temp.ordre() = 'Ordre A > Ordre B');
select public.{{P}}admin_save_booster_type('thomarie', :oa, 'Ordre A', 2, '#111111', 30, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb, null, 'none', 50);
select pg_temp.expect('A à la position 50 : B passe avant A', pg_temp.ordre() = 'Ordre B > Ordre A');
select public.{{P}}admin_save_booster_type('thomarie', :oa, 'Ordre A renommé', 2, '#111111', 30, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]'::jsonb);
select pg_temp.expect('enregistrer sans préciser l''ordre le conserve (50)', (select position from public.{{P}}booster_types where id = :oa) = 50);
select pg_temp.expect('ordre invalide (0 ou 10000) refusé ; admin_data renvoie la position de chaque booster', pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :oa || ', ''X'', 2, ''#111111'', 30, true, ''[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]''::jsonb, null, ''none'', 0)') like '%invalid_booster%'
  and pg_temp.err('select public.{{P}}admin_save_booster_type(''thomarie'', ' || :oa || ', ''X'', 2, ''#111111'', 30, true, ''[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1}]''::jsonb, null, ''none'', 10000)') like '%invalid_booster%'
  and (select bool_and(e ? 'position') from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'booster_types') e));
-- le Standard et le booster Gold ont aussi leur ordre
select (select jsonb_build_object('c', cards, 'k', color, 'g', glow) from public.{{P}}booster_types where id = :std) as std_cfg \gset
select pg_temp.expect('le statut donne la position du booster Standard (celui du stock gratuit) et du booster Gold', (public.{{P}}status() -> 'standard_booster' -> 'position') is not null and (public.{{P}}status() -> 'standard_booster' ->> 'position')::int = (select position from public.{{P}}booster_types where id = :std)
  and (public.{{P}}status() -> 'reward_booster' ->> 'position')::int = (select position from public.{{P}}booster_types where id = :gold));
select pg_temp.expect('droits : l''ordre ne se règle que par l''admin (fonction fermée aux joueurs sans mot de passe)', has_function_privilege('authenticated', 'public.{{P}}admin_save_booster_type(text, int, text, int, text, int, boolean, jsonb, text, text, int)', 'execute') and (public.{{P}}admin_save_booster_type('mauvais', :oa, 'X', 2, '#111111', 30, true, '[]'::jsonb) ->> 'error') is not null);

-- nettoyage
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;
delete from public.{{P}}categories where name = 'Hasard Param';
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}booster_type_slots where booster_type_id in (select id from bt_backup); insert into public.{{P}}booster_type_slots select * from sl_backup;
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
update public.{{P}}categories set closed = false;
