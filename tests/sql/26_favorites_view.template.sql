-- Favoris : « il me manque encore cette carte ? » (i_own) et « c'est ma carte » (is_mine), propriétaire, annonce.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
delete from public.{{P}}favorites; delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Fav Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'T1', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'T2', '🐶', 2, false) returning id as t2 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t, r, 6, 6, 'simple' from (values (:t1), (:t2)) x(t) cross join (values ('common'), ('rare')) y(r);
-- T1 commune : A a déjà la 3/5 ; B a la 4/5. T2 rare : B a la 3/5, A n'a rien. T2 commune 3/5 : personne.
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:t1, 'common', 5, 3, :A), (:t1, 'common', 5, 4, :B), (:t2, 'rare', 5, 3, :B);
insert into public.{{P}}favorites (user_id, type_id, base_rarity, series, number) values (:A, :t1, 'common', 5, 4), (:A, :t2, 'rare', 5, 3), (:A, :t2, 'common', 5, 3), (:A, :t1, 'common', 5, 3);
set request.jwt.claim.sub = :A;
create temp table fav as select * from public.{{P}}list_favorites();
select pg_temp.expect('4 favoris renvoyés avec les deux nouveaux champs', (select count(*) from fav) = 4 and (select count(*) filter (where is_mine is not null and i_own is not null) from fav) = 4);
select pg_temp.expect('carte d''un autre joueur, dont j''ai déjà un exemplaire de l''emplacement (T1 commune) : i_own vrai, pas à moi, propriétaire connu', (select (i_own, is_mine, owner_name is not null) from fav where card_type = :t1 and card_number = 4) = (true, false, true));
select pg_temp.expect('carte d''un autre joueur qui me manque (T2 rare) : i_own FAUX (elle me manque), pas à moi', (select (i_own, is_mine) from fav where card_type = :t2 and card_base = 'rare') = (false, false));
select pg_temp.expect('carte encore dans les boosters (personne ne l''a) : elle me manque, pas de propriétaire', (select (i_own, is_mine, owner_id is null) from fav where card_type = :t2 and card_base = 'common') = (false, false, true));
select pg_temp.expect('ma propre carte en favori : is_mine vrai et i_own vrai', (select (i_own, is_mine) from fav where card_type = :t1 and card_number = 3) = (true, true));
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values (:t2, 'rare', 5, 4, :A);
create temp table fav2 as select * from public.{{P}}list_favorites();
select pg_temp.expect('après avoir obtenu une autre carte de l''emplacement T2 rare : la favorite n''est plus « manquante » (i_own vrai), elle reste à l''autre joueur', (select (i_own, is_mine, owner_name is not null) from fav2 where card_type = :t2 and card_base = 'rare') = (true, false, true));
set request.jwt.claim.sub = :B;
select public.{{P}}list_card(:t2, 'rare', 5, 3, 'buy_now', 9) ->> 'listing_id' as lid \gset
set request.jwt.claim.sub = :A;
create temp table fav3 as select * from public.{{P}}list_favorites();
select pg_temp.expect('quand le propriétaire met la carte en vente : l''annonce et son prix apparaissent, sans changer i_own', (select (listing_id is not null, listing_price, i_own) from fav3 where card_type = :t2 and card_base = 'rare') = (true, 9, true));
select pg_temp.expect('A voit ses 4 favoris', (select count(*) from public.{{P}}list_favorites()) = 4);
set request.jwt.claim.sub = :B;
select pg_temp.expect('B n''en voit aucun : chacun ne voit que SES favoris', (select count(*) from public.{{P}}list_favorites()) = 0);
select pg_temp.expect('droits : réservé aux joueurs connectés', has_function_privilege('authenticated', 'public.{{P}}list_favorites()', 'execute') and not has_function_privilege('anon', 'public.{{P}}list_favorites()', 'execute'));
-- nettoyage
delete from public.{{P}}favorites; delete from public.{{P}}listings where type_id in (:t1, :t2); delete from public.{{P}}cards where owner_id in (:A, :B); delete from public.{{P}}album_picks;
delete from public.{{P}}categories where name = 'Fav Param';
update public.{{P}}categories set closed = false;
