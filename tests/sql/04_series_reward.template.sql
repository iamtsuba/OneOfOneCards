\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
-- Profils des trois joueurs de test, créés comme dans l'application (au premier appel d'une fonction)
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ begin execute sql; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
delete from public.{{P}}cards; delete from public.{{P}}bids; delete from public.{{P}}listings; delete from public.{{P}}series_rewards;
update public.{{P}}categories set closed = false, series_count = 500;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
update public.{{P}}config set value = 2 where key = 'series_reward_min_size';
update public.{{P}}config set value = 100000 where key = 'max_boosters';
update public.{{P}}profiles set golden_packs = 0, boosters = 1000, coins = 100;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as c_profil;
update public.{{P}}profiles set coins = 100 where id = :C;
create or replace function pg_temp.packs() returns text language sql as $$ select string_agg(left(username,1) || '=' || golden_packs, '  ' order by username) from public.{{P}}profiles $$;

\echo '=== 1. série complète : le pack doré arrive à la dernière carte (type 1, série 3 = 3 cartes)'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 3, 1, :A), (1, 3, 2, :A);
select 'après 2 cartes sur 3', pg_temp.packs();
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 3, 3, :A);
select 'après 3 cartes sur 3', pg_temp.packs();
select 'récompense enregistrée', type_id, series, user_id = :A as a_a, seen from public.{{P}}series_rewards;

\echo '=== 2. séries trop petites : la 1/1 (taille 1) ne donne rien, la série de 2 donne un pack'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 1, 1, :A);
select 'après la 1/1', pg_temp.packs();
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 2, 1, :A), (1, 2, 2, :A);
select 'après série de 2', pg_temp.packs();
update public.{{P}}config set value = 10 where key = 'series_reward_min_size';
insert into public.{{P}}cards (type_id, series, number, owner_id) select 1, 5, g, :A from generate_series(1,5) g;
select 'série de 5 avec minimum 10 : pas de pack', pg_temp.packs();
update public.{{P}}config set value = 0 where key = 'series_reward_min_size';
insert into public.{{P}}cards (type_id, series, number, owner_id) select 1, 6, g, :A from generate_series(1,6) g;
select 'fonction désactivée (0) : pas de pack', pg_temp.packs();
update public.{{P}}config set value = 2 where key = 'series_reward_min_size';

\echo '=== 3. anti-exploit : A donne sa série à B, B possède tout -> aucun nouveau pack (déjà attribué)'
update public.{{P}}cards set owner_id = :B where type_id = 1 and series = 3;
select 'B a la série 3 complète, mais déjà récompensée', pg_temp.packs();
select 'décompte récompenses série 3', count(*) from public.{{P}}series_rewards where type_id = 1 and series = 3;

\echo '=== 4. un autre type, même série : récompense distincte'
insert into public.{{P}}cards (type_id, series, number, owner_id) select 2, 3, g, :B from generate_series(1,3) g;
select 'B après type 2 série 3', pg_temp.packs();

\echo '=== 5. complétion par ACHAT sur le marché (A a 2/3 du type 3, B vend la dernière)'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (3, 3, 1, :A), (3, 3, 2, :A), (3, 3, 3, :B);
select 'avant achat', pg_temp.packs();
set request.jwt.claim.sub = :B; select public.{{P}}list_card(3, 3, 3, 'buy_now', 5)->>'listing_id' as lid \gset
set request.jwt.claim.sub = :A; select pg_temp.try('select public.{{P}}buy_now(' || :lid || ')');
select 'après achat : A reçoit le pack', pg_temp.packs();

\echo '=== 6. complétion par ENCHÈRE (C a 2/4 du type 4, A vend la dernière en enchère, C gagne)'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (4, 4, 1, :C), (4, 4, 2, :C), (4, 4, 3, :C), (4, 4, 4, :A);
set request.jwt.claim.sub = :A; select public.{{P}}list_card(4, 4, 4, 'auction')->>'listing_id' as lid2 \gset
set request.jwt.claim.sub = :C; select pg_temp.try('select public.{{P}}place_bid(' || :lid2 || ', 3)');
update public.{{P}}listings set ends_at = now() - interval '1 second' where id = :lid2;
select public.{{P}}status()->>'golden_packs' as packs_de_C_apres_cloture, pg_temp.packs();

\echo '=== 7. statut : packs dorés et annonces non vues ; acquittement'
set request.jwt.claim.sub = :A;
select public.{{P}}status()->>'golden_packs' as packs, public.{{P}}status()->'unseen_rewards' as annonces;
select public.{{P}}ack_rewards()->'unseen_rewards' as apres_ack, public.{{P}}ack_rewards()->>'golden_packs' as packs_gardes;

\echo '=== 8. état d une série (album)'
select public.{{P}}type_state(1, 3)->>'reward' as vu_par_B_ou_A, public.{{P}}type_state(1, 3)->>'reward_eligible' as eligible;
set request.jwt.claim.sub = :C; select public.{{P}}type_state(1, 3)->>'reward' as vu_par_C, public.{{P}}type_state(1, 4)->>'reward' as serie_sans_recompense, public.{{P}}type_state(1, 1)->>'reward_eligible' as serie1_eligible;

\echo '=== 9. ouverture d un pack doré'
set request.jwt.claim.sub = :A;
select pg_temp.packs();
select jsonb_array_length(r->'cards') nb, r->>'golden' dore, r->>'category_id' cat,
  (select string_agg(c->>'rarity_id', ',' order by c->>'rarity_id') from jsonb_array_elements(r->'cards') c) raretes,
  r->'status'->>'golden_packs' as packs_restants, r->'status'->>'boosters' as boosters_intacts
from (select public.{{P}}open_golden_pack() r) x;
select 'boosters de A inchangés', boosters from public.{{P}}profiles where id = :A;
select pg_temp.try('select public.{{P}}open_golden_pack()');
select pg_temp.try('select public.{{P}}open_golden_pack()');
select pg_temp.try('select public.{{P}}open_golden_pack()');

\echo '=== 10. pas de pack : refus, rien n est consommé'
set request.jwt.claim.sub = :B; update public.{{P}}profiles set golden_packs = 0 where id = :B;
select pg_temp.try('select public.{{P}}open_golden_pack()');

\echo '=== 11. régressions : booster normal et booster doré aléatoire (chance 100 %) après la refonte'
set request.jwt.claim.sub = :A;
select jsonb_array_length(public.{{P}}open_booster()->'cards') as cartes_booster_normal;
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
select r->>'golden' dore, jsonb_array_length(r->'cards') nb, (select string_agg(c->>'rarity_id', ',' order by c->>'rarity_id') from jsonb_array_elements(r->'cards') c) raretes from (select public.{{P}}open_booster() r) x;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';

\echo '=== 12. relance du schéma : le rattrapage ne redonne rien'
select pg_temp.packs() as avant;
