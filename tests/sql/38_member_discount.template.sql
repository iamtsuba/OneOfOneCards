-- Remise du pass Pro (OneMore) sur les boosters achetés en pièces : le prix affiché est barré, le membre paie le prix réduit.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table cfg_backup as select * from public.{{P}}config where key = 'subscriber_discount_percent';
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}pro_members;
insert into public.{{P}}pro_members (user_id, stripe_session_id, stripe_payment_intent, amount_cents, currency) values (:A, 'cs_rem_a', 'pi_rem_a', 999, 'eur');
update public.{{P}}profiles set coins = 5000, bonus_boosters = 0 where id in (:A, :B);
update public.{{P}}config set value = 20 where key = 'subscriber_discount_percent';
create or replace function pg_temp.mk(n text, price int) returns int language plpgsql as $$
begin return (public.{{P}}admin_save_booster_type('thomarie', null, n, 1, '#123456', price, true, '[{"position":1,"rarity_id":"common","weight":1}]'::jsonb) ->> 'id')::int; end $$;
select pg_temp.mk('Remise 100', 100) as b100 \gset
select pg_temp.mk('Remise 125', 125) as b125 \gset
select pg_temp.mk('Remise 33', 33) as b33 \gset
select pg_temp.mk('Remise 1', 1) as b1 \gset
insert into public.{{P}}booster_types (name, cards, color, price_coins, enabled, position, role, glow) values ('Remise 0', 1, '#123456', 0, true, 999, null, 'none') returning id as b0 \gset
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) select :b0, 1, 'common', 1;
create or replace function pg_temp.coins(u uuid) returns bigint language sql as $$ select coins from public.{{P}}profiles where id = u $$;
create or replace function pg_temp.qty(u uuid, b int) returns bigint language sql as $$ select coalesce(sum(quantity), 0) from public.{{P}}user_boosters where user_id = u and booster_type_id = b $$;
create or replace function pg_temp.entry(b int, k text) returns text language sql as $$ select e ->> k from jsonb_array_elements(public.{{P}}status() -> 'booster_types') e where (e ->> 'id')::int = b $$;

\echo '--- ce que le statut annonce'
set request.jwt.claim.sub = :A;
select pg_temp.expect('membre : prix affiché inchangé, prix membre réduit de 20 % (100 -> 80, 125 -> 100, 33 -> 26, 1 -> 1 au minimum, 0 reste gratuit)', pg_temp.entry(:b100, 'price') = '100' and pg_temp.entry(:b100, 'member_price') = '80' and pg_temp.entry(:b125, 'member_price') = '100' and pg_temp.entry(:b33, 'member_price') = '26' and pg_temp.entry(:b1, 'member_price') = '1' and pg_temp.entry(:b0, 'member_price') = '0' and pg_temp.entry(:b0, 'price') = '0');
select pg_temp.expect('le pourcentage est annoncé dans le pass (20)', (public.{{P}}status() -> 'subscription' ->> 'discount_percent')::int = 20 and (public.{{P}}status() -> 'subscription' ->> 'active')::boolean);
set request.jwt.claim.sub = :B;
select pg_temp.expect('non-membre : le prix membre est le prix affiché (aucune remise), le pourcentage reste annoncé pour l''offre du pass', pg_temp.entry(:b100, 'member_price') = '100' and pg_temp.entry(:b125, 'member_price') = '125' and pg_temp.entry(:b33, 'member_price') = '33' and (public.{{P}}status() -> 'subscription' ->> 'discount_percent')::int = 20 and not (public.{{P}}status() -> 'subscription' ->> 'active')::boolean);

\echo '--- ce que l''achat débite vraiment'
set request.jwt.claim.sub = :A;
select pg_temp.coins(:A) as ca0, pg_temp.coins(:B) as cb0 \gset
select public.{{P}}buy_booster(:b100, 2);
select pg_temp.expect('membre : 2 boosters à 100 coûtent 160 (2 x 80), ajoutés au stock', pg_temp.coins(:A) = :ca0 - 160 and pg_temp.qty(:A, :b100) = 2);
select public.{{P}}buy_booster(:b125, 1); select public.{{P}}buy_booster(:b33, 3);
select pg_temp.expect('membre : 125 coûte 100 ; 3 x 33 coûtent 3 x 26 = 78', pg_temp.coins(:A) = :ca0 - 160 - 100 - 78);
set request.jwt.claim.sub = :B;
select public.{{P}}buy_booster(:b100, 2);
select pg_temp.expect('non-membre : 2 boosters à 100 coûtent 200, plein tarif', pg_temp.coins(:B) = :cb0 - 200 and pg_temp.qty(:B, :b100) = 2);
set request.jwt.claim.sub = :A;
select pg_temp.coins(:A) as ca1 \gset
select public.{{P}}buy_booster(:b0, 1);
select pg_temp.expect('un booster gratuit reste gratuit (0), un booster à 1 pièce reste à 1', pg_temp.coins(:A) = :ca1 and (select pg_temp.coins(:A) from (select public.{{P}}buy_booster(:b1, 1)) z) = :ca1 - 1);
update public.{{P}}categories set closed = false where id = (select min(id) from public.{{P}}categories where enabled);
select min(id) as cat from public.{{P}}categories where enabled and not closed \gset
select pg_temp.coins(:A) as ca2 \gset
select public.{{P}}buy_booster(:b100, 1, :cat);
select pg_temp.expect('achat pour une collection : 80 pièces aussi', pg_temp.coins(:A) = :ca2 - 80);

\echo '--- solde juste suffisant'
update public.{{P}}profiles set coins = 79 where id = :A;
select pg_temp.expect('79 pièces ne suffisent pas pour un booster à 80 (not_enough_coins), rien n''est débité', pg_temp.err('select public.{{P}}buy_booster(' || :b100 || ', 1)') like '%not_enough_coins%' and pg_temp.coins(:A) = 79);
update public.{{P}}profiles set coins = 80 where id = :A;
select public.{{P}}buy_booster(:b100, 1);
select pg_temp.expect('80 pièces suffisent exactement (prix membre), le solde tombe à 0', pg_temp.coins(:A) = 0);
update public.{{P}}profiles set coins = 99 where id = :B;
select pg_temp.expect('un non-membre avec 99 pièces ne peut pas acheter le booster à 100', pg_temp.err('select public.{{P}}buy_booster(' || :b100 || ', 1)') like '%not_enough_coins%');

\echo '--- le réglage et le pass'
update public.{{P}}profiles set coins = 5000 where id in (:A, :B);
update public.{{P}}config set value = 35 where key = 'subscriber_discount_percent';
select pg_temp.expect('remise réglée à 35 % : 100 devient 65', pg_temp.entry(:b100, 'member_price') = '65' and (public.{{P}}status() -> 'subscription' ->> 'discount_percent')::int = 35);
select pg_temp.coins(:A) as ca3 \gset
select public.{{P}}buy_booster(:b100, 1);
select pg_temp.expect('l''achat suit le réglage (65)', pg_temp.coins(:A) = :ca3 - 65);
update public.{{P}}config set value = 0 where key = 'subscriber_discount_percent';
select pg_temp.expect('remise à 0 : plus de remise (100 reste 100)', pg_temp.entry(:b100, 'member_price') = '100' and (public.{{P}}status() -> 'subscription' ->> 'discount_percent')::int = 0);
update public.{{P}}config set value = 150 where key = 'subscriber_discount_percent';
select pg_temp.expect('remise absurde (150) plafonnée à 90 % : 100 devient 10', pg_temp.entry(:b100, 'member_price') = '10' and (public.{{P}}status() -> 'subscription' ->> 'discount_percent')::int = 90);
update public.{{P}}config set value = -5 where key = 'subscriber_discount_percent';
select pg_temp.expect('remise négative : traitée comme 0', pg_temp.entry(:b100, 'member_price') = '100');
update public.{{P}}config set value = 20 where key = 'subscriber_discount_percent';
update public.{{P}}pro_members set revoked_at = now() where user_id = :A;
select pg_temp.expect('pass remboursé : plein tarif tout de suite (100), au statut comme à l''achat', pg_temp.entry(:b100, 'member_price') = '100' and (public.{{P}}status() -> 'subscription' ->> 'active')::boolean = false);
select pg_temp.coins(:A) as ca4 \gset
select public.{{P}}buy_booster(:b100, 1);
select pg_temp.expect('achat au plein tarif après remboursement', pg_temp.coins(:A) = :ca4 - 100);
select pg_temp.expect('le calcul interne n''est pas appelable par les joueurs ; le booster Standard n''est toujours pas à vendre', not has_function_privilege('authenticated', 'public.{{P}}booster_price_for(uuid, int)', 'execute') and pg_temp.err('select public.{{P}}buy_booster(' || (select id from public.{{P}}booster_types where is_standard) || ', 1)') like '%not_for_sale%');
select pg_temp.expect('le réglage décrit bien la remise du pass Pro', (select description ~* 'remise' and description ~* 'pass pro' from public.{{P}}config where key = 'subscriber_discount_percent'));
-- nettoyage
delete from public.{{P}}pro_members; delete from public.{{P}}user_boosters; delete from public.{{P}}user_collection_boosters;
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
