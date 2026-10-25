-- Plusieurs collections actives en même temps ; boosters liés à une collection ; récompense « Premium » liée à la collection de la carte complétée.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.raises(q text, expected text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlerrm like '%' || expected || '%'; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table cfg_backup as select * from public.{{P}}config where key = 'card_reward_booster';
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;
delete from public.{{P}}user_boosters where user_id = :A; delete from public.{{P}}user_collection_boosters where user_id = :A;
update public.{{P}}categories set closed = true;
-- C1 et C2 : deux collections activées ; C3 : désactivée
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Multi A', 901, 100, '#fff', '#ccc', '#000', true) returning id as c1 \gset
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Multi B', 902, 100, '#fff', '#ccc', '#000', true) returning id as c2 \gset
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Multi C', 903, 100, '#fff', '#ccc', '#000', false) returning id as c3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :c1, 'A' || g, '🐱', g, false from generate_series(1, 4) g;
insert into public.{{P}}types (category_id, name, image, position, secret) select :c2, 'B' || g, '🐶', g, false from generate_series(1, 4) g;
insert into public.{{P}}types (category_id, name, image, position, secret) select :c3, 'C' || g, '🐭', g, false from generate_series(1, 2) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t.id, r.rid, r.s, 0, 'simple' from public.{{P}}types t cross join (values ('common', 20), ('rare', 5)) r(rid, s) where t.category_id in (:c1, :c2, :c3);   -- 2 emplacements par carte (commune et rare, numéros masqués)
select min(id) as a1 from public.{{P}}types where category_id = :c1 \gset
select min(id) as b1 from public.{{P}}types where category_id = :c2 \gset
select min(id) as k1 from public.{{P}}types where category_id = :c3 \gset
-- un booster « Premium » (5 cartes communes, 150 pièces), choisi comme récompense
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Premium Test', 5, '#9ca3af', 150, true,
  '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"common","weight":1},{"position":5,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as prem \gset
update public.{{P}}profiles set boosters = 50, bonus_boosters = 0, coins = 1000 where id = :A;

\echo '--- collections actives en même temps'
select pg_temp.expect('active_categories : Multi A et Multi B (Multi C désactivée), dans l''ordre des positions', (select array_agg(id order by id) from public.{{P}}active_categories() where id in (:c1, :c2, :c3)) = array[:c1, :c2]);
create temp table st1 as select public.{{P}}status() as j;
select pg_temp.expect('statut : liste des collections actives avec leurs cartes tirées et leur total ; « next_category » n''existe plus (null)',
  (select count(*) from st1, jsonb_array_elements(j -> 'active_categories') e where (e ->> 'id')::int in (:c1, :c2)) = 2
  and (select (e ->> 'total_cards')::bigint from st1, jsonb_array_elements(j -> 'active_categories') e where (e ->> 'id')::int = :c1) = 900
  and (select (j -> 'next_category') = 'null'::jsonb or (j -> 'next_category') is null from st1));

\echo '--- ouverture dans la collection choisie'
create temp table o2 as select public.{{P}}open_booster(:c2) as j;
select pg_temp.expect('open_booster(Multi B) : 5 cartes, toutes de Multi B, category_id = Multi B', (select (j ->> 'category_id')::int from o2) = :c2 and (select count(*) from o2, jsonb_array_elements(j -> 'cards') c where (c ->> 'type_id')::int in (select id from public.{{P}}types where category_id = :c2)) = 5);
create temp table o1 as select public.{{P}}open_booster(:c1) as j;
select pg_temp.expect('open_booster(Multi A) : toutes de Multi A', (select (j ->> 'category_id')::int from o1) = :c1 and (select count(*) from o1, jsonb_array_elements(j -> 'cards') c where (c ->> 'type_id')::int in (select id from public.{{P}}types where category_id = :c1)) = 5);
select pg_temp.expect('le stock gratuit a baissé de 2 (50 -> 48) quelle que soit la collection', (select boosters from public.{{P}}profiles where id = :A) = 48);
select pg_temp.expect('collection désactivée ou terminée : refusé (collection_closed), sans toucher au stock', pg_temp.raises('select public.{{P}}open_booster(' || :c3 || ')', 'collection_closed') and (select boosters from public.{{P}}profiles where id = :A) = 48);
select pg_temp.expect('collection inexistante : refusé', pg_temp.raises('select public.{{P}}open_booster(-7)', 'collection_closed'));
select pg_temp.expect('sans collection choisie : la première collection active (comportement d''avant)', (select (public.{{P}}open_booster() ->> 'category_id')::int) = (select min(id) from public.{{P}}active_categories()));
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;

\echo '--- récompense : un booster Premium lié à la collection de la carte complétée'
select public.{{P}}admin_set_config('thomarie', 'card_reward_booster', :prem);
select public.{{P}}auto_place_album(:A, :a1, 'common', 20, 1);
select pg_temp.expect('une seule des deux raretés rangée : la carte n''est pas encore complétée, pas de récompense', not exists (select 1 from public.{{P}}gold_rewards where user_id = :A and type_id = :a1));
select public.{{P}}auto_place_album(:A, :a1, 'rare', 5, 1);
select pg_temp.expect('carte de Multi A complétée : un Premium LIÉ à Multi A (1), rien pour Multi B', (select quantity from public.{{P}}user_collection_boosters where user_id = :A and booster_type_id = :prem and category_id = :c1) = 1 and not exists (select 1 from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c2));
select pg_temp.expect('la récompense est déjà « ouverte » (donnée en stock) et garde le booster offert ; plus aucun Gold à ouvrir', (select (granted_booster_type, opened_at is not null) from public.{{P}}gold_rewards where user_id = :A and type_id = :a1) = (:prem, true) and jsonb_array_length(public.{{P}}status() -> 'gold_rewards') = 0);
create temp table st2 as select public.{{P}}status() as j;
select pg_temp.expect('notice de récompense non vue : carte, collection (Multi A) et nom du booster (Premium Test) ; reward_booster_id = Premium', (select (e ->> 'type_id')::int = :a1 and (e ->> 'category_id')::int = :c1 and e ->> 'booster_name' = 'Premium Test' from st2, jsonb_array_elements(j -> 'reward_notices') e) and (select (j ->> 'reward_booster_id')::int from st2) = :prem);
select pg_temp.expect('statut : stock lié à Multi A (1) listé séparément, la quantité « sans collection » reste 0', (select (e ->> 'quantity')::int from st2, jsonb_array_elements(j -> 'linked_boosters') e where (e ->> 'category_id')::int = :c1 and (e ->> 'booster_type_id')::int = :prem) = 1 and (select (e ->> 'quantity')::int from st2, jsonb_array_elements(j -> 'booster_types') e where (e ->> 'id')::int = :prem) = 0);
select public.{{P}}ack_gold_rewards();
select pg_temp.expect('après lecture : plus de notice', jsonb_array_length(public.{{P}}status() -> 'reward_notices') = 0);
select public.{{P}}auto_place_album(:A, :b1, 'common', 20, 1);
select public.{{P}}auto_place_album(:A, :b1, 'rare', 5, 1);
select pg_temp.expect('carte de Multi B complétée : un Premium lié à Multi B, celui de Multi A inchangé', (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c2) = 1 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 1);
select public.{{P}}auto_place_album(:A, :a1, 'common', 20, 2);
select pg_temp.expect('une carte déjà récompensée ne rapporte pas deux fois', (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 1);

\echo '--- ouvrir le Premium : dans la collection d''où il vient'
create temp table pm1 as select public.{{P}}open_booster_of_type(:prem, :c2) as j;
select pg_temp.expect('Premium ouvert dans Multi B : il consomme celui de Multi B (pas celui de Multi A), cartes de Multi B', (select (j ->> 'category_id')::int from pm1) = :c2 and (select coalesce(sum(quantity), 0) from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c2) = 0 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 1
  and (select count(*) from pm1, jsonb_array_elements(j -> 'cards') c where (c ->> 'type_id')::int in (select id from public.{{P}}types where category_id = :c2)) = 5);
select pg_temp.expect('plus de Premium pour Multi B : refusé (no_boosters), celui de Multi A reste intact', pg_temp.raises('select public.{{P}}open_booster_of_type(' || :prem || ', ' || :c2 || ')', 'no_boosters') and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 1);
create temp table pm2 as select public.{{P}}open_booster_of_type(:prem, :c1) as j;
select pg_temp.expect('le Premium de Multi A s''ouvre dans Multi A (cartes de Multi A uniquement) et son stock tombe à 0', (select count(*) from pm2, jsonb_array_elements(j -> 'cards') c where (c ->> 'type_id')::int in (select id from public.{{P}}types where category_id = :c1)) = 5 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 0);
-- stock sans collection : utilisable dans n'importe quelle collection, après le stock lié
select username as ua from public.{{P}}profiles where id = :A \gset
select public.{{P}}admin_grant_boosters('thomarie', :prem, 1, :'ua');
select public.{{P}}grant_collection_booster(:A, :prem, :c1, 1);
create temp table pm3 as select public.{{P}}open_booster_of_type(:prem, :c1) as j;
select pg_temp.expect('stock lié PUIS stock sans collection : l''ouverture dans Multi A prend d''abord le lié', (select (j ->> 'category_id')::int from pm3) = :c1 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 0 and (select quantity from public.{{P}}user_boosters where user_id = :A and booster_type_id = :prem) = 1);
create temp table pm4 as select public.{{P}}open_booster_of_type(:prem, :c2) as j;
select pg_temp.expect('puis le stock sans collection, dans la collection choisie (Multi B)', (select (j ->> 'category_id')::int from pm4) = :c2 and (select coalesce(sum(quantity), 0) from public.{{P}}user_boosters where user_id = :A and booster_type_id = :prem) = 0);
select pg_temp.expect('type de booster inconnu ou collection fermée : refusés', pg_temp.raises('select public.{{P}}open_booster_of_type(-3, ' || :c1 || ')', 'unknown_booster') and pg_temp.raises('select public.{{P}}open_booster_of_type(' || :prem || ', ' || :c3 || ')', 'collection_closed'));

\echo '--- achat : lié à la collection choisie'
select public.{{P}}buy_booster(:prem, 1, :c2);
select pg_temp.expect('achat pour Multi B : 150 pièces débitées, un Premium lié à Multi B', (select coins from public.{{P}}profiles where id = :A) = 850 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c2 and booster_type_id = :prem) = 1);
select public.{{P}}buy_booster(:prem, 2);
select pg_temp.expect('achat sans collection : stock sans collection (2)', (select quantity from public.{{P}}user_boosters where user_id = :A and booster_type_id = :prem) = 2 and (select coins from public.{{P}}profiles where id = :A) = 550);
select pg_temp.expect('achat pour une collection fermée : refusé, pièces intactes', pg_temp.raises('select public.{{P}}buy_booster(' || :prem || ', 1, ' || :c3 || ')', 'collection_closed') and (select coins from public.{{P}}profiles where id = :A) = 550);

\echo '--- collection terminée : son stock lié reste utilisable ailleurs'
select public.{{P}}grant_collection_booster(:A, :prem, :c3, 1);
delete from public.{{P}}user_boosters where user_id = :A;
update public.{{P}}user_collection_boosters set quantity = 0 where user_id = :A and category_id in (:c1, :c2);
select pg_temp.expect('Premium lié à une collection désactivée : compté dans la quantité du statut (1) et plus dans les stocks liés actifs', (select (e ->> 'quantity')::int from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e where (e ->> 'id')::int = :prem) = 1 and not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'linked_boosters') e where (e ->> 'category_id')::int = :c3));
create temp table pm5 as select public.{{P}}open_booster_of_type(:prem, :c1) as j;
select pg_temp.expect('… et il s''ouvre dans une collection active', (select (j ->> 'category_id')::int from pm5) = :c1 and (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c3) = 0);

\echo '--- anciens Gold non ouverts et repli'
insert into public.{{P}}gold_rewards (user_id, type_id, seen) values (:A, :k1, false);
do $$
declare v_bt int := nullif(coalesce(public.{{P}}cfg('card_reward_booster'), 0), 0)::int; r record;
begin
  if v_bt is null or not exists (select 1 from public.{{P}}booster_types where id = v_bt and enabled and not is_standard) then return; end if;
  for r in select g.id, g.user_id, ty.category_id from public.{{P}}gold_rewards g join public.{{P}}types ty on ty.id = g.type_id where g.opened_at is null loop
    perform public.{{P}}grant_collection_booster(r.user_id, v_bt, r.category_id, 1);
    update public.{{P}}gold_rewards set opened_at = now(), granted_booster_type = v_bt, seen = true where id = r.id;
  end loop;
end $$;
select pg_temp.expect('ancien Gold non ouvert converti : un Premium lié à la collection de sa carte (Multi C), récompense marquée donnée et vue', (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c3 and booster_type_id = :prem) = 1 and (select (granted_booster_type, opened_at is not null, seen) from public.{{P}}gold_rewards where user_id = :A and type_id = :k1) = (:prem, true, true));
do $$
declare v_bt int := nullif(coalesce(public.{{P}}cfg('card_reward_booster'), 0), 0)::int; r record;
begin
  for r in select g.id, g.user_id, ty.category_id from public.{{P}}gold_rewards g join public.{{P}}types ty on ty.id = g.type_id where g.opened_at is null loop
    perform public.{{P}}grant_collection_booster(r.user_id, v_bt, r.category_id, 1);
  end loop;
end $$;
select pg_temp.expect('rejouer la conversion ne donne rien de plus', (select quantity from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c3 and booster_type_id = :prem) = 1);
-- sans booster de récompense choisi (0) : l'ancien Gold à ouvrir
select public.{{P}}admin_set_config('thomarie', 'card_reward_booster', 0);
select min(id) + 1 as a2 from public.{{P}}types where category_id = :c1 \gset
select public.{{P}}auto_place_album(:A, :a2, 'common', 20, 1);
select public.{{P}}auto_place_album(:A, :a2, 'rare', 5, 1);
select pg_temp.expect('config à 0 : l''ancien booster Gold à ouvrir est créé (opened_at nul, pas de booster offert), pas de stock lié en plus', (select (opened_at is null, granted_booster_type is null) from public.{{P}}gold_rewards where user_id = :A and type_id = :a2) = (true, true) and jsonb_array_length(public.{{P}}status() -> 'gold_rewards') = 1 and (select coalesce(sum(quantity), 0) from public.{{P}}user_collection_boosters where user_id = :A and category_id = :c1) = 0);
select pg_temp.expect('config à 0 : reward_booster_id absent (null)', (public.{{P}}status() -> 'reward_booster_id') = 'null'::jsonb or (public.{{P}}status() -> 'reward_booster_id') is null);
-- le booster de récompense est protégé
select public.{{P}}admin_set_config('thomarie', 'card_reward_booster', :prem);
select pg_temp.expect('le booster offert à la complétion ne peut pas être supprimé', pg_temp.raises('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :prem || ')', 'booster_protected'));
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Autre Test', 3, '#222222', 20, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as autre \gset
select public.{{P}}grant_collection_booster(:A, :autre, :c1, 1);
select pg_temp.expect('un booster dont des joueurs ont du stock LIÉ à une collection ne peut pas être supprimé (booster_has_holders) ; l''admin le compte parmi les détenteurs', pg_temp.raises('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :autre || ')', 'booster_has_holders') and (select (e ->> 'holders')::int from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'booster_types') e where (e ->> 'id')::int = :autre) = 1);
select pg_temp.expect('droits : stock lié fermé aux joueurs ; ouvertures et achat réservés aux connectés', not has_table_privilege('authenticated', 'public.{{P}}user_collection_boosters', 'select') and not has_function_privilege('authenticated', 'public.{{P}}grant_collection_booster(uuid, int, int, int)', 'execute')
  and has_function_privilege('authenticated', 'public.{{P}}open_booster(int)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}open_booster_of_type(int, int)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}buy_booster(int, int, int)', 'execute')
  and not has_function_privilege('anon', 'public.{{P}}open_booster(int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}buy_booster(int, int, int)', 'execute'));
-- nettoyage
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}gold_rewards where user_id = :A;
delete from public.{{P}}user_boosters where user_id = :A; delete from public.{{P}}user_collection_boosters where user_id = :A;
delete from public.{{P}}categories where name in ('Multi A', 'Multi B', 'Multi C');
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
update public.{{P}}config set value = (select value from cfg_backup) where key = 'card_reward_booster' and exists (select 1 from cfg_backup);
update public.{{P}}categories set closed = false;
