-- « Voir la collection » : nombre de détenteurs (joueurs distincts) de chaque type d'une catégorie.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
delete from public.{{P}}categories where name in ('Détenteurs Test', 'Détenteurs Autre');
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
set request.jwt.claim.sub = :A;

\echo '--- une catégorie de 4 types (dont un secret) et une autre catégorie'
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Détenteurs Test', 97, 300, '#ffffff', '#cccccc', '#000000', false) returning id as cat \gset
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Détenteurs Autre', 98, 300, '#ffffff', '#cccccc', '#000000', false) returning id as cat2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Premier', '🐱', 1, false) returning id as t1 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Deuxième', '🐶', 2, false) returning id as t2 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Troisième', '🐭', 3, false) returning id as t3 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'Secret', '🤫', 4, true) returning id as t4 \gset
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat2, 'Ailleurs', '🦊', 1, false) returning id as t5 \gset
-- A possède 20 cartes du premier type, B en possède 3 : cela fait 2 détenteurs, pas 23
insert into public.{{P}}cards (type_id, series, number, owner_id) select :t1, v.s, n, :A from (values (6, 6), (7, 7), (8, 7)) v(s, k) cross join lateral generate_series(1, v.k) n;
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:t1, 9, 1, :B), (:t1, 9, 2, :B), (:t1, 9, 3, :B);
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:t2, 9, 4, :C);                                  -- un seul détenteur
insert into public.{{P}}cards (type_id, series, number, owner_id, retired_at) values (:t3, 9, 5, null, now());              -- carte retirée du jeu : personne
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:t4, 9, 6, :A), (:t4, 9, 7, :B);                  -- type secret : 2 détenteurs
insert into public.{{P}}cards (type_id, series, number, owner_id) values (:t5, 12, 8, :A), (:t5, 12, 9, :B), (:t5, 12, 10, :C); -- autre catégorie
select count(*) filter (where owner_id = :A and type_id = :t1) as cartes_de_a, count(*) filter (where owner_id = :B and type_id = :t1) as cartes_de_b from public.{{P}}cards where type_id = :t1;   -- 20 / 3

\echo '--- détenteurs par type (type, détenteurs) : 2, 1, 0 (carte retirée), 2 (secret)'
select t.name, h.holders from public.{{P}}collection_holders(:cat) h join public.{{P}}types t on t.id = h.type_id order by t.position;
select count(*) as types_renvoyes, bool_and(h.type_id in (:t1, :t2, :t3, :t4)) as seulement_cette_categorie from public.{{P}}collection_holders(:cat) h;   -- 4 / t
select holders as autre_categorie from public.{{P}}collection_holders(:cat2);                                                  -- 3
select count(*) as categorie_inconnue from public.{{P}}collection_holders(999999);                                              -- 0
select proname, pg_get_function_result(oid) as forme from pg_proc where proname = '{{P}}collection_holders';                   -- table (type_id integer, holders bigint) : des nombres, pas de noms

\echo '--- ça suit la vie des cartes : B vend tout (1 détenteur), puis une carte de A passe à C (2 détenteurs)'
update public.{{P}}cards set owner_id = null, retired_at = now() where type_id = :t1 and owner_id = :B;
select holders as apres_la_vente_de_b from public.{{P}}collection_holders(:cat) where type_id = :t1;                           -- 1
update public.{{P}}cards set owner_id = :C where type_id = :t1 and owner_id = :A and series = 6 and number = 1;
select holders as apres_le_don_a_c from public.{{P}}collection_holders(:cat) where type_id = :t1;                              -- 2
select holders as avec_les_deux_a_c from public.{{P}}collection_holders(:cat) where type_id = :t2;                             -- 1 : C seule (inchangé)

\echo '--- il faut être connecté ; les joueurs anonymes ne peuvent pas appeler la fonction'
set request.jwt.claim.sub = '';
select pg_temp.try('select (select count(*) from public.{{P}}collection_holders(' || :cat || '))');                              -- not_authenticated
set request.jwt.claim.sub = :A;
select has_function_privilege('authenticated', 'public.{{P}}collection_holders(int)', 'execute') as joueur_connecte, has_function_privilege('anon', 'public.{{P}}collection_holders(int)', 'execute') as anonyme;   -- t / f

-- nettoyage
delete from public.{{P}}categories where name in ('Détenteurs Test', 'Détenteurs Autre');
select count(*) as reste from public.{{P}}types where name in ('Premier', 'Deuxième', 'Troisième', 'Secret', 'Ailleurs');       -- 0
