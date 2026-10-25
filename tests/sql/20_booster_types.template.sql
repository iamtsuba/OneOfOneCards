-- Boosters paramétrables : création et validation dans l'admin, achat en pièces, stock, ouverture, dons, suppression, chances par type.
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
create temp table pf_backup as select id, username, coins, boosters, bonus_boosters, boosters_opened from public.{{P}}profiles where id in (:A, :B);
select id as std from public.{{P}}booster_types where is_standard \gset
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
update public.{{P}}profiles set username = 'Ami_Alpha' where id = :A;
update public.{{P}}profiles set username = 'Ami_Beta' where id = :B;
set request.jwt.claim.sub = :A;
delete from public.{{P}}user_boosters;

\echo '--- création : validations de l''admin (chaque erreur porte un code précis, rien n''est créé)'
select count(*) as nb_avant from public.{{P}}booster_types \gset
select pg_temp.expect('mauvais mot de passe : refusé', public.{{P}}admin_save_booster_type('mauvais', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb) ->> 'error' = 'admin_denied');
select pg_temp.expect('nom vide', pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, '  ', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster');
select pg_temp.expect('nom de plus de 40 caractères', pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, repeat('x', 41), 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster');
select pg_temp.expect('0 carte ou 11 cartes', pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 0, '#c0c0c0', 50, true, '[]'::jsonb)$q$) = 'invalid_booster' and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 11, '#c0c0c0', 50, true, '[]'::jsonb)$q$) = 'invalid_booster');
select pg_temp.expect('couleur invalide et prix négatif', pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, 'argent', 50, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster' and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', -1, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster');
select pg_temp.expect('répartitions : pas un tableau, rareté inconnue, rareté spéciale Alpha, poids nul ou négatif, carte hors du booster',
  pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '{}'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"inconnue","weight":100}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"alpha","weight":100}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":0}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":-5}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":2,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster_slots');
select pg_temp.expect('une carte sans répartition (2 cartes, répartition seulement pour la 1re) et un doublon (carte, rareté)',
  pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 2, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":100}]'::jsonb)$q$) = 'invalid_booster_slots'
  and pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 1, '#c0c0c0', 50, true, '[{"position":1,"rarity_id":"common","weight":50},{"position":1,"rarity_id":"common","weight":50}]'::jsonb)$q$) = 'invalid_booster_slots');
select pg_temp.expect('aucun type créé par les refus', (select count(*) from public.{{P}}booster_types) = :nb_avant);

\echo '--- créer Silver (5 cartes, 50 pièces) : cartes 1 à 4 Commune 100 %, carte 5 Rare 70 %, Super Rare 25 %, Unique 5 %'
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Silver', 5, '#c0c0c0', 50, true,
  '[{"position":1,"rarity_id":"common","weight":100},{"position":2,"rarity_id":"common","weight":100},{"position":3,"rarity_id":"common","weight":100},{"position":4,"rarity_id":"common","weight":100},
    {"position":5,"rarity_id":"rare","weight":70},{"position":5,"rarity_id":"super","weight":25},{"position":5,"rarity_id":"unique","weight":5}]'::jsonb) ->> 'id')::int as silver \gset
select pg_temp.expect('Silver créé : actif, en vente à 50 pièces, couleur, 7 répartitions', (select (name, cards, color, price_coins, enabled, is_standard) = ('Silver', 5, '#c0c0c0', 50, true, false) from public.{{P}}booster_types where id = :silver)
  and (select count(*) from public.{{P}}booster_type_slots where booster_type_id = :silver) = 7);
select pg_temp.expect('un nom déjà pris (casse ignorée) est refusé', pg_temp.err($q$select public.{{P}}admin_save_booster_type('thomarie', null, ' SILVER ', 1, '#000000', null, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb)$q$) = 'duplicate_booster_name');
select pg_temp.expect('l''admin voit les types avec leurs répartitions et le nombre de boosters détenus', (select count(*) from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'booster_types') t where t ->> 'name' = 'Silver' and jsonb_array_length(t -> 'slots') = 7 and (t ->> 'holders')::int = 0) = 1);
select public.{{P}}admin_save_booster_type('thomarie', :silver, 'Silver', 4, '#c0c0c0', 50, true,
  '[{"position":1,"rarity_id":"common","weight":100},{"position":2,"rarity_id":"common","weight":100},{"position":3,"rarity_id":"common","weight":100},{"position":4,"rarity_id":"rare","weight":100}]'::jsonb) ->> 'ok' as modifie;
select pg_temp.expect('modifier Silver (4 cartes) remplace toutes les répartitions : celles de la carte 5 disparaissent', (select cards from public.{{P}}booster_types where id = :silver) = 4 and (select count(*) from public.{{P}}booster_type_slots where booster_type_id = :silver) = 4 and not exists (select 1 from public.{{P}}booster_type_slots where booster_type_id = :silver and position = 5));
select public.{{P}}admin_save_booster_type('thomarie', :std, 'Standard', 5, '#e8452e', 99, false,
  (select jsonb_agg(jsonb_build_object('position', position, 'rarity_id', rarity_id, 'weight', weight)) from public.{{P}}booster_type_slots where booster_type_id = :std)) ->> 'ok' as std_modifie;
select pg_temp.expect('le Standard reste actif et jamais en vente, même si on essaie de le désactiver ou de le vendre', (select (enabled, price_coins is null) = (true, true) from public.{{P}}booster_types where id = :std));
select pg_temp.expect('supprimer le Standard est refusé ; un type inconnu aussi', pg_temp.err('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :std || ')') = 'booster_is_standard' and pg_temp.err($q$select public.{{P}}admin_delete_booster_type('thomarie', 999999)$q$) = 'not_found');

\echo '--- le joueur voit Silver (en vente) ; achat en pièces'
update public.{{P}}profiles set coins = 200 where id = :A;
select pg_temp.expect('statut : Silver proposé à 50 pièces, 0 en stock ; le Standard est annoncé à part', (select (b ->> 'price')::int = 50 and (b ->> 'quantity')::int = 0 and (b ->> 'cards')::int = 4 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where b ->> 'name' = 'Silver')
  and (public.{{P}}status() -> 'standard_booster' ->> 'name') = 'Standard' and not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where b ->> 'name' = 'Standard'));
select public.{{P}}buy_booster(:silver, 2) ->> 'ok' as achat;
select pg_temp.expect('2 Silver achetés : 100 pièces débitées, 2 en stock', (select coins from public.{{P}}profiles where id = :A) = 100 and (select quantity from public.{{P}}user_boosters where user_id = :A and booster_type_id = :silver) = 2);
select pg_temp.expect('pas assez de pièces (3 x 50 pour 100)', pg_temp.err('select public.{{P}}buy_booster(' || :silver || ', 3)') = 'not_enough_coins' and (select coins from public.{{P}}profiles where id = :A) = 100);
select pg_temp.expect('quantité invalide (0 ou 51)', pg_temp.err('select public.{{P}}buy_booster(' || :silver || ', 0)') = 'invalid_quantity' and pg_temp.err('select public.{{P}}buy_booster(' || :silver || ', 51)') = 'invalid_quantity');
select pg_temp.expect('le Standard et un type inconnu ne s''achètent pas', pg_temp.err('select public.{{P}}buy_booster(' || :std || ', 1)') = 'not_for_sale' and pg_temp.err($q$select public.{{P}}buy_booster(999999, 1)$q$) = 'not_for_sale');
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Gold test', 5, '#d4af37', null, true, '[{"position":1,"rarity_id":"common","weight":1},{"position":2,"rarity_id":"common","weight":1},{"position":3,"rarity_id":"common","weight":1},{"position":4,"rarity_id":"common","weight":1},{"position":5,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int as nonvente \gset
select pg_temp.expect('un type sans prix ne s''achète pas et n''est pas proposé au joueur', pg_temp.err('select public.{{P}}buy_booster(' || :nonvente || ', 1)') = 'not_for_sale' and not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where b ->> 'name' = 'Gold test'));
update public.{{P}}booster_types set enabled = false where id = :silver;
select pg_temp.expect('un type désactivé ne s''achète pas, ne s''ouvre pas et disparaît du statut', pg_temp.err('select public.{{P}}buy_booster(' || :silver || ', 1)') = 'not_for_sale' and pg_temp.err('select public.{{P}}open_booster_of_type(' || :silver || ')') = 'unknown_booster'
  and not exists (select 1 from jsonb_array_elements(public.{{P}}status() -> 'booster_types') b where b ->> 'name' = 'Silver'));
update public.{{P}}booster_types set enabled = true where id = :silver;

\echo '--- ouvrir un Silver : 3 Communes différentes puis une Rare ; le stock du Standard n''est pas touché'
update public.{{P}}config set value = 0 where key in ('golden_booster_chance', 'rarity_exponent');
update public.{{P}}categories set closed = false;
select boosters as std_avant, boosters_opened as ouverts_avant from public.{{P}}profiles where id = :A \gset
create temp table op as select public.{{P}}open_booster_of_type(:silver) as j;
select pg_temp.expect('4 cartes tirées', (select jsonb_array_length(j -> 'cards') = 4 from op));
select pg_temp.expect('cartes 1 à 3 : rareté de base Commune, 3 cartes différentes ; carte 4 : Rare', (select count(*) = 3 and count(distinct c ->> 'type_id') = 3 from op, jsonb_array_elements(j -> 'cards') with ordinality t(c, ord) where ord <= 3 and c ->> 'base_rarity' = 'common')
  and (select c ->> 'base_rarity' = 'rare' from op, jsonb_array_elements(j -> 'cards') with ordinality t(c, ord) where ord = 4));
select pg_temp.expect('le booster est nommé dans la réponse, le stock Silver passe de 2 à 1, le Standard est intact, un booster ouvert de plus',
  (select j -> 'booster' ->> 'name' = 'Silver' from op) and (select quantity from public.{{P}}user_boosters where user_id = :A and booster_type_id = :silver) = 1
  and (select boosters from public.{{P}}profiles where id = :A) = :std_avant and (select boosters_opened from public.{{P}}profiles where id = :A) = :ouverts_avant + 1);
select pg_temp.expect('les 4 cartes appartiennent au joueur', (select count(*) from op, jsonb_array_elements(j -> 'cards') c join public.{{P}}cards k on k.type_id = (c ->> 'type_id')::int and k.base_rarity = c ->> 'base_rarity' and k.series = (c ->> 'series')::int and k.number = (c ->> 'number')::int and k.owner_id = :A) = 4);
select public.{{P}}open_booster_of_type(:silver) ->> 'golden' as deuxieme;
select pg_temp.expect('plus de stock : refusé', pg_temp.err('select public.{{P}}open_booster_of_type(' || :silver || ')') = 'no_boosters');
select pg_temp.expect('le Standard et un type inconnu ne passent pas par cette fonction', pg_temp.err('select public.{{P}}open_booster_of_type(' || :std || ')') = 'unknown_booster' and pg_temp.err($q$select public.{{P}}open_booster_of_type(999999)$q$) = 'unknown_booster');

\echo '--- dons de l''admin'
select (public.{{P}}admin_grant_boosters('thomarie', :silver, 3, 'ami_BETA') ->> 'players')::int as joueurs_servis \gset
select pg_temp.expect('offrir 3 Silver à « ami_beta » (casse ignorée) : B en a 3, A pas plus', :joueurs_servis = 1
  and (select quantity from public.{{P}}user_boosters where user_id = :B and booster_type_id = :silver) = 3 and coalesce((select quantity from public.{{P}}user_boosters where user_id = :A and booster_type_id = :silver), 0) = 0);
select pg_temp.expect('pseudo inconnu : refusé, rien ne change', pg_temp.err($q$select public.{{P}}admin_grant_boosters('thomarie', 1, 1, 'personne')$q$) in ('unknown_booster', 'user_not_found')
  and pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :silver || ', 1, ''personne'')') = 'user_not_found' and (select quantity from public.{{P}}user_boosters where user_id = :B and booster_type_id = :silver) = 3);
select pg_temp.expect('offrir au Standard ou une quantité invalide : refusé', pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :std || ', 1, null)') = 'unknown_booster' and pg_temp.err('select public.{{P}}admin_grant_boosters(''thomarie'', ' || :silver || ', 0, null)') = 'invalid_quantity');
select count(*) as nb_joueurs from public.{{P}}profiles \gset
select (public.{{P}}admin_grant_boosters('thomarie', :silver, 1, null) ->> 'players')::int as offerts \gset
select pg_temp.expect('offrir sans pseudo : tous les joueurs en reçoivent 1', :offerts = :nb_joueurs and (select quantity from public.{{P}}user_boosters where user_id = :B and booster_type_id = :silver) = 4);
select pg_temp.expect('l''admin voit le nombre de boosters détenus', (select (t ->> 'holders')::int from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'booster_types') t where t ->> 'name' = 'Silver') = (select sum(quantity) from public.{{P}}user_boosters where booster_type_id = :silver));

\echo '--- chances d''un type de booster'
create temp table od as select public.{{P}}draw_odds(null, :silver) as j;
select pg_temp.expect('chances de Silver : 4 cartes, cartes 1 à 3 presque 100 % Commune, carte 4 presque 100 % Rare', (select jsonb_array_length(j -> 'positions') = 4 and j -> 'booster' ->> 'name' = 'Silver' and (j ->> 'cards_per_booster')::int = 4 from od)
  and (select (o ->> 'id') = 'common' and (o ->> 'p')::float > 0.9 from od, jsonb_array_elements(j -> 'positions' -> 0 -> 'mix') o limit 1)
  and (select (o ->> 'id') = 'rare' and (o ->> 'p')::float > 0.9 from od, jsonb_array_elements(j -> 'positions' -> 3 -> 'mix') o limit 1));
select pg_temp.expect('le booster Gold tiré au hasard n''est annoncé que pour le Standard', (select j -> 'gold' = 'null'::jsonb or j -> 'gold' is null from od) and (public.{{P}}draw_odds(null, :std) -> 'gold') is not null);
select pg_temp.expect('type inconnu : pas de répartition, pas d''erreur', (select jsonb_array_length(public.{{P}}draw_odds(null, 999999) -> 'by_rarity') = 0));

\echo '--- suppression : refusée tant que des joueurs en détiennent'
select pg_temp.expect('Silver est détenu : suppression refusée', pg_temp.err('select public.{{P}}admin_delete_booster_type(''thomarie'', ' || :silver || ')') = 'booster_has_holders' and exists (select 1 from public.{{P}}booster_types where id = :silver));
delete from public.{{P}}user_boosters where booster_type_id = :silver;
select public.{{P}}admin_delete_booster_type('thomarie', :silver) ->> 'ok' as supprime;
select pg_temp.expect('plus de détenteur : supprimé, répartitions et stocks avec lui', not exists (select 1 from public.{{P}}booster_types where id = :silver) and not exists (select 1 from public.{{P}}booster_type_slots where booster_type_id = :silver));

\echo '--- droits'
select pg_temp.expect('joueur connecté : acheter, ouvrir, administrer (avec le mot de passe) ; anonyme : rien ; tables fermées',
  has_function_privilege('authenticated', 'public.{{P}}buy_booster(int, int, int)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}open_booster_of_type(int, int)', 'execute')
  and has_function_privilege('authenticated', 'public.{{P}}admin_save_booster_type(text, int, text, int, text, int, boolean, jsonb, text, text, int)', 'execute')
  and not has_function_privilege('anon', 'public.{{P}}buy_booster(int, int, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_grant_boosters(text, int, int, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}draw_booster_cards(uuid, int, int)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}pick_series(int, int, int, double precision, jsonb)', 'execute')
  and not has_table_privilege('authenticated', 'public.{{P}}booster_types', 'select') and not has_table_privilege('authenticated', 'public.{{P}}user_boosters', 'select') and not has_table_privilege('authenticated', 'public.{{P}}booster_type_slots', 'select'));

-- nettoyage : on laisse la base comme on l'a trouvée
delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks where user_id in (:A, :B);
delete from public.{{P}}booster_types where id not in (select id from bt_backup);   -- seulement ceux créés par ce test (les boosters de rôle restent)
delete from public.{{P}}booster_type_slots where booster_type_id = :std;
insert into public.{{P}}booster_type_slots select * from sl_backup where booster_type_id = :std;
update public.{{P}}booster_types b set name = o.name, cards = o.cards, color = o.color, price_coins = o.price_coins, enabled = o.enabled from bt_backup o where o.id = b.id and b.id = :std;
delete from public.{{P}}user_boosters;
insert into public.{{P}}user_boosters select * from ub_backup;
update public.{{P}}profiles p set username = f.username, coins = f.coins, boosters = f.boosters, bonus_boosters = f.bonus_boosters, boosters_opened = f.boosters_opened from pf_backup f where f.id = p.id;
update public.{{P}}categories set closed = false;
