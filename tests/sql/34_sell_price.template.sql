-- Revente rapide à la banque : un prix par rareté (réglable dans l'admin), le prix général sinon.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table rar_backup as select * from public.{{P}}rarities;
create temp table cfg_backup as select * from public.{{P}}config where key = 'direct_sell_price';
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A; delete from public.{{P}}listings;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Prix Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'P1', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t1, 'common', 5, 0, 'simple'), (:t1, 'rare', 5, 5, 'simple');
-- common masquée : 5 cartes ; rare visible : (5,2) rare, (5,1) Alpha
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:t1, 'common', 5, 2, :A), (:t1, 'common', 5, 3, :A), (:t1, 'common', 4, 1, :A), (:t1, 'common', 3, 2, :A), (:t1, 'common', 5, 4, :A), (:t1, 'common', 2, 1, :A), (:t1, 'common', 2, 2, :A),
  (:t1, 'rare', 5, 2, :A), (:t1, 'rare', 5, 3, :A), (:t1, 'rare', 5, 1, :A);
update public.{{P}}config set value = 2 where key = 'direct_sell_price';
update public.{{P}}rarities set sell_price = null;
update public.{{P}}rarities set sell_price = 1 where id = 'common';
update public.{{P}}rarities set sell_price = 7 where id = 'rare';
create or replace function pg_temp.save_price(p_id text, p_price int, p_pw text default 'thomarie') returns text language plpgsql as $$
declare r public.{{P}}rarities;
begin
  select * into r from public.{{P}}rarities where id = p_id;
  return public.{{P}}admin_save_rarity(p_pw, r.id, r.name, r.max_series, r.color, r.color2, r.text_color, p_price) ->> 'ok';
end $$;
create or replace function pg_temp.coins() returns bigint language sql as $$ select coins from public.{{P}}profiles where id = '11111111-1111-1111-1111-111111111111' $$;

\echo '--- prix annoncé au joueur'
select pg_temp.expect('le statut donne le prix de chaque rareté : Commune 1, Rare 7, les autres (sans prix propre) le prix général 2', (public.{{P}}status() -> 'sell_prices' ->> 'common')::int = 1 and (public.{{P}}status() -> 'sell_prices' ->> 'rare')::int = 7
  and (select bool_and((public.{{P}}status() -> 'sell_prices' ->> r.id)::int = 2) from public.{{P}}rarities r where r.id not in ('common', 'rare')) and (public.{{P}}status() ->> 'direct_sell_price')::int = 2);

\echo '--- vente à l''unité : le prix de la rareté de la carte'
select pg_temp.coins() as c0 \gset
select public.{{P}}sell_direct(:t1, 'common', 5, 4);
select pg_temp.expect('une Commune rapporte 1 pièce', pg_temp.coins() = :c0 + 1);
select pg_temp.coins() as c1 \gset
select public.{{P}}sell_direct(:t1, 'rare', 5, 2);
select pg_temp.expect('une Rare (3/5 du milieu, affichée Rare) rapporte 7 pièces', pg_temp.coins() = :c1 + 7);
select pg_temp.coins() as c2 \gset
select public.{{P}}sell_direct(:t1, 'rare', 5, 1);
select pg_temp.expect('une carte 1/5 d''une série visible est une ALPHA (rareté spéciale sans prix propre) : le prix général, 2 pièces', public.{{P}}rarity_id(1, 5, :t1, 'rare') = (select id from public.{{P}}rarities where kind = 'alpha') and pg_temp.coins() = :c2 + 2);

\echo '--- vente en lot : le prix de la rareté, pour chaque carte'
select pg_temp.coins() as c3 \gset
select public.{{P}}sell_direct_many(:t1, 'common', 3);
select pg_temp.expect('3 Communes en lot : 3 pièces (1 chacune)', pg_temp.coins() = :c3 + 3);

\echo '--- réglage dans l''admin'
select pg_temp.save_price('common', 9) as ok9 \gset
select pg_temp.expect('prix de la Commune : 9 pièces (enregistré, annoncé aux joueurs)', :'ok9' = 'true' and (select sell_price from public.{{P}}rarities where id = 'common') = 9 and (public.{{P}}status() -> 'sell_prices' ->> 'common')::int = 9);
select pg_temp.coins() as c4 \gset
select public.{{P}}sell_direct_many(:t1, 'common', 1);
select pg_temp.expect('la vente suit le nouveau prix (9)', pg_temp.coins() = :c4 + 9);
select pg_temp.save_price('common', null) as oknull \gset
select pg_temp.expect('prix vide : retour au prix général (2), la Commune n''a plus de prix propre', :'oknull' = 'true' and (select sell_price from public.{{P}}rarities where id = 'common') is null and (public.{{P}}status() -> 'sell_prices' ->> 'common')::int = 2);
select pg_temp.expect('prix négatif ou énorme refusé (invalid_price)', pg_temp.err('select public.{{P}}admin_save_rarity(''thomarie'', ''common'', ''Commune'', 100, ''#ffffff'', ''#000000'', ''#000000'', -1)') like '%invalid_price%' and pg_temp.err('select public.{{P}}admin_save_rarity(''thomarie'', ''common'', ''Commune'', 100, ''#ffffff'', ''#000000'', ''#000000'', 1000001)') like '%invalid_price%' and (select sell_price from public.{{P}}rarities where id = 'common') is null);
select pg_temp.save_price('common', 0) as ok0 \gset
select pg_temp.expect('0 pièce accepté (revente gratuite) et annoncé', :'ok0' = 'true' and (public.{{P}}status() -> 'sell_prices' ->> 'common')::int = 0);
select pg_temp.coins() as c5 \gset
select public.{{P}}sell_direct_many(:t1, 'common', 1);
select pg_temp.expect('une Commune à 0 pièce : la vente rapporte 0, sans erreur', pg_temp.coins() = :c5);
select (public.{{P}}admin_save_rarity('mauvais', 'common', 'Commune', 100, '#ffffff', '#000000', '#000000', 5) ->> 'error') as errmdp \gset
select pg_temp.expect('mauvais mot de passe : refusé, rien ne change (0)', :'errmdp' is not null and :'errmdp' <> '' and (select sell_price from public.{{P}}rarities where id = 'common') = 0);
select pg_temp.save_price('rare', null) as okold \gset
select pg_temp.expect('anciens appels sans prix (7 paramètres) : acceptés ; le prix de la Rare est effacé (vide = général)', :'okold' = 'true' and (select sell_price from public.{{P}}rarities where id = 'rare') is null);
select pg_temp.expect('droits : sell_price_of fermée aux joueurs, admin_save_rarity ouverte (mot de passe), ventes ouvertes aux connectés', not has_function_privilege('authenticated', 'public.{{P}}sell_price_of(text)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}admin_save_rarity(text, text, text, int, text, text, text, int)', 'execute') and has_function_privilege('authenticated', 'public.{{P}}sell_direct(int, text, int, int)', 'execute'));
-- nettoyage
delete from public.{{P}}cards where owner_id = :A; delete from public.{{P}}album_picks where user_id = :A;
delete from public.{{P}}categories where name = 'Prix Param';
update public.{{P}}rarities r set sell_price = b.sell_price from rar_backup b where b.id = r.id;
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
update public.{{P}}categories set closed = false;
