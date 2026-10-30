-- Vente rapide des DOUBLES d'une rareté dans une collection : réservée aux membres Pro.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
create temp table rar_backup as select * from public.{{P}}rarities;
delete from public.{{P}}pro_members; delete from public.{{P}}offers; delete from public.{{P}}notifications; delete from public.{{P}}listings; delete from public.{{P}}favorites;
delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Doubles Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Autre Param', 2, 100, '#fff', '#ccc', '#000', true) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'D' || g, 'x', g, false from generate_series(1, 5) g;
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'O1', 'x', 1, false);
select min(id) as t1 from public.{{P}}types where category_id = :cat \gset
select :t1 + 1 as t2, :t1 + 2 as t3, :t1 + 3 as t4, :t1 + 4 as t5 \gset
select id as t6 from public.{{P}}types where category_id = :cat2 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
  select t, 'common', 10, 0, 'simple' from unnest(array[:t1, :t2, :t3, :t4, :t6]) t;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t5, 'rare', 10, 10, 'simple');
update public.{{P}}rarities set sell_price = 4 where id = 'common';
update public.{{P}}rarities set sell_price = 9 where id = 'rare';
-- D1 : 4 copies dont une dans l'album ; D2 : 3 copies ; D3 : 2 copies dont une en vente ; D4 : 1 copie ; D5 (Rare visible) : 3 copies numérotées ; O1 (autre collection) : 2 copies
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:t1, 'common', 5, 1, :A), (:t1, 'common', 5, 2, :A), (:t1, 'common', 5, 3, :A), (:t1, 'common', 5, 4, :A),
  (:t2, 'common', 5, 1, :A), (:t2, 'common', 5, 2, :A), (:t2, 'common', 5, 3, :A),
  (:t3, 'common', 5, 1, :A), (:t3, 'common', 5, 2, :A),
  (:t4, 'common', 5, 1, :A),
  (:t5, 'rare', 5, 2, :A), (:t5, 'rare', 5, 3, :A), (:t5, 'rare', 5, 4, :A),
  (:t6, 'common', 5, 1, :A), (:t6, 'common', 5, 2, :A),
  (:t2, 'common', 6, 1, :B);
insert into public.{{P}}album_picks (user_id, type_id, rarity_id, base_rarity, series, number) values (:A, :t1, 'common', 'common', 5, 2);
insert into public.{{P}}listings (type_id, base_rarity, series, number, seller_id, kind, price) values (:t3, 'common', 5, 1, :A, 'buy_now', 9);
insert into public.{{P}}favorites (user_id, type_id, base_rarity, series, number) values (:B, :t2, 'common', 5, 3);
insert into public.{{P}}offers (type_id, base_rarity, series, number, buyer_id, seller_id, amount, status, proposed_by) values (:t2, 'common', 5, 2, :B, :A, 5, 'pending', :B);
insert into public.{{P}}pro_members (user_id, stripe_session_id, stripe_payment_intent, amount_cents, currency) values (:A, 'cs_dup_a', 'pi_dup_a', 999, 'eur');
create or replace function pg_temp.owned(t int, s int, n int) returns uuid language sql as $$ select owner_id from public.{{P}}cards where type_id = t and series = s and number = n and base_rarity in ('common', 'rare') and series <> 6 $$;
create or replace function pg_temp.coins() returns bigint language sql as $$ select coins from public.{{P}}profiles where id = '11111111-1111-1111-1111-111111111111' $$;

\echo '--- aperçu : ce qui serait vendu'
set request.jwt.claim.sub = :A;
create temp table sm as select * from public.{{P}}duplicates_summary(:cat);
select pg_temp.expect('Commune : 5 doubles (3 de D1 sans l''exemplaire de l''album, 2 de D2), 2 cartes, 4 pièces chacun = 20 ; Rare : 2 doubles (D5), 9 pièces chacun = 18', (select (doubles, type_count, price, coins) from sm where rarity_id = 'common') = (5, 2, 4, 20::bigint) and (select (doubles, type_count, price, coins) from sm where rarity_id = 'rare') = (2, 1, 9, 18::bigint));
select pg_temp.expect('D3 (une copie en vente, l''autre gardée) et D4 (une seule copie) ne proposent rien ; l''autre collection n''est pas comptée ; rien d''autre dans l''aperçu', (select count(*) from sm) = 2);
set request.jwt.claim.sub = :B;
select pg_temp.expect('un joueur sans pass Pro ne voit rien de tout cela (pro_required), ni l''aperçu ni la vente', pg_temp.err('select * from public.{{P}}duplicates_summary(' || :cat || ')') like '%pro_required%' and pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''common'')') like '%pro_required%');

\echo '--- vente des doubles Commune'
set request.jwt.claim.sub = :A;
select pg_temp.coins() as c0 \gset
select public.{{P}}sell_duplicates(:cat, 'common') ->> 'sold' as sold \gset
select pg_temp.expect('5 cartes vendues, 5 x 4 = 20 pièces reçues', :sold::int = 5 and pg_temp.coins() = :c0 + 20);
select pg_temp.expect('D1 : l''exemplaire de l''album (5,2) est gardé, les 3 autres sont parties (retirées du jeu, sans propriétaire)', pg_temp.owned(:t1, 5, 2) = :A::uuid and pg_temp.owned(:t1, 5, 1) is null and pg_temp.owned(:t1, 5, 3) is null and pg_temp.owned(:t1, 5, 4) is null and (select count(*) from public.{{P}}cards where type_id = :t1 and owner_id is null and retired_at is not null) = 3);
select pg_temp.expect('D2 : on garde l''exemplaire au plus petit numéro (5,1), les deux autres sont vendus', pg_temp.owned(:t2, 5, 1) = :A::uuid and pg_temp.owned(:t2, 5, 2) is null and pg_temp.owned(:t2, 5, 3) is null);
select pg_temp.expect('D3 : la carte en vente est intacte, l''autre est gardée ; D4 intacte ; Rare D5 et autre collection intactes', pg_temp.owned(:t3, 5, 1) = :A::uuid and pg_temp.owned(:t3, 5, 2) = :A::uuid and pg_temp.owned(:t4, 5, 1) = :A::uuid and (select count(*) from public.{{P}}cards where type_id = :t5 and owner_id = :A::uuid) = 3 and (select count(*) from public.{{P}}cards where type_id = :t6 and owner_id = :A::uuid) = 2);
select pg_temp.expect('les favoris et offres en attente sur les cartes vendues sont supprimés / annulés', (select count(*) from public.{{P}}favorites) = 0 and (select status from public.{{P}}offers where number = 2 and type_id = :t2) = 'cancelled');
select pg_temp.expect('la carte de B (autre joueur) n''a pas bougé', (select owner_id from public.{{P}}cards where type_id = :t2 and series = 6) = :B::uuid);
select pg_temp.expect('refaire la même vente : plus rien à vendre (nothing_to_sell), rien ne bouge', pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''common'')') like '%nothing_to_sell%' and pg_temp.coins() = :c0 + 20);

\echo '--- vente des doubles Rare (cartes numérotées)'
select pg_temp.coins() as c1 \gset
select public.{{P}}sell_duplicates(:cat, 'rare') ->> 'coins' as got \gset
select pg_temp.expect('2 doubles Rare vendus 9 pièces chacun = 18 ; on garde le plus petit numéro (5,2)', :got::int = 18 and pg_temp.coins() = :c1 + 18 and pg_temp.owned(:t5, 5, 2) = :A::uuid and pg_temp.owned(:t5, 5, 3) is null and pg_temp.owned(:t5, 5, 4) is null);
select pg_temp.expect('l''aperçu est maintenant vide', (select count(*) from public.{{P}}duplicates_summary(:cat)) = 0);

\echo '--- refus'
select pg_temp.expect('rareté inconnue ou vide (invalid_rarity), collection inconnue (invalid_category)', pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''nope'')') like '%invalid_rarity%' and pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', null)') like '%invalid_rarity%' and pg_temp.err('select public.{{P}}sell_duplicates(999999, ''common'')') like '%invalid_category%');
update public.{{P}}categories set closed = true where id = :cat;
select pg_temp.expect('collection terminée : vente refusée (category_closed) et aperçu vide', pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''common'')') like '%category_closed%' and (select count(*) from public.{{P}}duplicates_summary(:cat)) = 0);
update public.{{P}}categories set closed = false where id = :cat;
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:t4, 'common', 5, 2, :A);
update public.{{P}}pro_members set revoked_at = now() where user_id = :A;
select pg_temp.expect('pass remboursé (révoqué) : l''accès est coupé aussitôt (pro_required)', pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''common'')') like '%pro_required%' and pg_temp.err('select * from public.{{P}}duplicates_summary(' || :cat || ')') like '%pro_required%');
update public.{{P}}pro_members set revoked_at = null where user_id = :A;
select pg_temp.expect('pass rétabli : la nouvelle carte en double de D4 est de nouveau proposée', (select doubles from public.{{P}}duplicates_summary(:cat) where rarity_id = 'common') = 1);
set request.jwt.claim.sub = '';
select pg_temp.expect('sans être connecté : refusé (not_authenticated)', pg_temp.err('select public.{{P}}sell_duplicates(' || :cat || ', ''common'')') like '%not_authenticated%' and pg_temp.err('select * from public.{{P}}duplicates_summary(' || :cat || ')') like '%not_authenticated%');
select pg_temp.expect('droits : aperçu et vente ouverts aux joueurs connectés (le contrôle Pro est dans la fonction), jamais aux anonymes ; le calcul interne est fermé à tous', has_function_privilege('authenticated', 'public.{{P}}sell_duplicates(int, text)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}duplicates_summary(int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}sell_duplicates(int, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}duplicates_summary(int)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}duplicates_plan(uuid, int, text)', 'execute'));
-- nettoyage
delete from public.{{P}}pro_members; delete from public.{{P}}offers; delete from public.{{P}}listings; delete from public.{{P}}favorites; delete from public.{{P}}album_picks;
delete from public.{{P}}cards where owner_id in (:A, :B) or owner_id is null and retired_at is not null and type_id in (select id from public.{{P}}types where category_id in (:cat, :cat2));
delete from public.{{P}}categories where name in ('Doubles Param', 'Autre Param');
update public.{{P}}rarities r set sell_price = b.sell_price from rar_backup b where b.id = r.id;
update public.{{P}}categories set closed = false;
