-- Mes cartes : nombre de doublons (exemplaires du même type et de la même rareté, moins un) et tri « plus de doublons d'abord ».
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks; delete from public.{{P}}listings;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Dups Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'U' || g, '🐱', g, false from generate_series(1, 5) g;
select min(id) as u1 from public.{{P}}types where category_id = :cat \gset
select :u1 + 1 as u2, :u1 + 2 as u3, :u1 + 3 as u4, :u1 + 4 as u5 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values
  (:u1, 'common', 5, 0, 'simple'), (:u2, 'common', 5, 0, 'simple'), (:u3, 'rare', 5, 5, 'simple'), (:u4, 'rare', 5, 5, 'simple'), (:u5, 'rare', 5, 5, 'simple');
-- U1 : 3 communes (pile de 3) ; U2 : 1 commune ; U3 : 3 rares ; U4 : 2 rares + 1 Alpha ; U5 : 1 rare
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:u1, 'common', 5, 1, :A), (:u1, 'common', 5, 2, :A), (:u1, 'common', 4, 3, :A), (:u2, 'common', 5, 3, :A),
  (:u3, 'rare', 5, 2, :A), (:u3, 'rare', 5, 3, :A), (:u3, 'rare', 5, 4, :A),
  (:u4, 'rare', 5, 2, :A), (:u4, 'rare', 5, 3, :A), (:u4, 'rare', 5, 1, :A),
  (:u5, 'rare', 5, 3, :A),
  (:u3, 'rare', 4, 2, :B);
set request.jwt.claim.sub = :A;
create temp table c_def as select row_number() over () as pos, * from public.{{P}}list_collection(:cat, null, null, 'series', 60, 0);
create temp table c_dup as select row_number() over () as pos, * from public.{{P}}list_collection(:cat, null, null, 'dups', 60, 0);
select pg_temp.expect('9 tuiles : 2 piles (communes à numéro masqué) + 7 cartes à numéro visible', (select count(*) from c_def) = 9 and (select count(*) from c_def where is_stack) = 2 and (select max(total) from c_def) = 9 and (select max(cards_total) from c_def) = 11);
select pg_temp.expect('doublons d''une pile : U1 (3 exemplaires) = 2, U2 (1 exemplaire) = 0', (select dups from c_def where card_type = :u1) = 2 and (select dups from c_def where card_type = :u2) = 0);
select pg_temp.expect('doublons des cartes à numéro visible : 3 rares de U3 = 2 chacune ; 2 rares de U4 = 1 chacune ; l''Alpha de U4 = 0 (autre rareté) ; la rare seule de U5 = 0',
  (select array_agg(dups order by card_number) from c_def where card_type = :u3) = array[2, 2, 2]
  and (select array_agg(dups order by card_number) from c_def where card_type = :u4 and rarity_id = 'rare') = array[1, 1]
  and (select dups from c_def where card_type = :u4 and rarity_id = 'alpha') = 0 and (select dups from c_def where card_type = :u5) = 0);
select pg_temp.expect('tri « doublons » : le plus de doublons d''abord (2, 2, 2, 2, puis 1, 1, puis 0…), jamais dans le désordre', (select array_agg(dups order by pos) from c_dup) = array[2, 2, 2, 2, 1, 1, 0, 0, 0]);
select pg_temp.expect('à égalité de doublons, l''ordre habituel est gardé (pile U1 avant les rares U3 par position du type)', (select array_agg(card_type order by pos) from (select * from c_dup where dups = 2) z) = array[:u1, :u3, :u3, :u3]);
select pg_temp.expect('mêmes cartes qu''avec le tri par série : seul l''ordre change', (select count(*) from c_dup) = 9 and not exists (select 1 from c_def d full join c_dup e on e.card_type = d.card_type and e.card_series = d.card_series and e.card_number = d.card_number and e.is_stack = d.is_stack where d.pos is null or e.pos is null));
select pg_temp.expect('tri par série inchangé : par position du type puis série', (select array_agg(card_type order by pos) from c_def) = (select array_agg(card_type order by pos) from (select card_type, min(pos) as pos from c_def group by card_type, rarity_id, is_stack, card_series, card_number) z)
  and (select card_type from c_def where pos = 1) = :u1);
create temp table c_p1 as select * from public.{{P}}list_collection(:cat, null, null, 'dups', 4, 0);
create temp table c_p2 as select * from public.{{P}}list_collection(:cat, null, null, 'dups', 4, 4);
create temp table c_p3 as select * from public.{{P}}list_collection(:cat, null, null, 'dups', 4, 8);
select pg_temp.expect('pagination avec le tri par doublons : 4 + 4 + 1 tuiles, sans trou ni répétition, même ordre que la liste entière', (select count(*) from c_p1) = 4 and (select count(*) from c_p2) = 4 and (select count(*) from c_p3) = 1
  and (select array_agg(dups) from (select dups from c_p1 union all select dups from c_p2 union all select dups from c_p3) z) = (select array_agg(dups order by pos) from c_dup));
select pg_temp.expect('filtre de rareté et tri par doublons : les rares seulement, doublons conservés', (select array_agg(dups) from public.{{P}}list_collection(:cat, null, 'rare', 'dups', 60, 0)) = array[2, 2, 2, 1, 1, 0]);
select pg_temp.expect('filtre de type : les doublons sont comptés dans le type (U3 = 2 chacune)', (select array_agg(dups) from public.{{P}}list_collection(:cat, :u3, null, 'dups', 60, 0)) = array[2, 2, 2]);
set request.jwt.claim.sub = :B;
select pg_temp.expect('chaque joueur ne voit que ses propres doublons : B n''a qu''une rare de U3 (0 doublon)', (select array_agg(dups) from public.{{P}}list_collection(:cat, null, null, 'dups', 60, 0)) = array[0]);
set request.jwt.claim.sub = :A;
-- une carte en vente ou rangée dans l'album compte aussi : ce sont bien des exemplaires du même emplacement
select public.{{P}}list_card(:u3, 'rare', 5, 2, 'buy_now', 9) ->> 'listing_id' as lx \gset
select pg_temp.expect('une carte mise en vente reste comptée dans les doublons de son emplacement', (select array_agg(dups) from public.{{P}}list_collection(:cat, :u3, null, 'dups', 60, 0)) = array[2, 2, 2]);
select pg_temp.expect('droits : réservé aux joueurs connectés', has_function_privilege('authenticated', 'public.{{P}}list_collection(int, int, text, text, int, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}list_collection(int, int, text, text, int, int)', 'execute'));
-- nettoyage
delete from public.{{P}}listings; delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name = 'Dups Param';
update public.{{P}}categories set closed = false;
