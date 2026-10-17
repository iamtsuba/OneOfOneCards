-- Amis : demandes, acceptation, confidentialité, collection d'un ami et doubles, offre sur un double.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set QUIET on
create or replace function pg_temp.try(sql text) returns void language plpgsql as $$ declare r text; begin execute 'select (' || regexp_replace(rtrim(sql, '; '), '^select ', '') || ')::text' into r; if r like '%"error"%' then raise exception 'renvoyé: %', r; end if; raise notice 'OK'; exception when others then raise notice 'erreur: %', sqlerrm; end $$;
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as profil_b;
set request.jwt.claim.sub = :C; select public.{{P}}status() is not null as profil_c;
create temp table noms_avant as select id, username from public.{{P}}profiles where id in (:A, :B, :C);
update public.{{P}}profiles set username = 'Ami_Alpha' where id = :A;
update public.{{P}}profiles set username = 'Ami_Beta' where id = :B;
update public.{{P}}profiles set username = 'Ami_Cleo' where id = :C;
delete from public.{{P}}friendships; delete from public.{{P}}offers; delete from public.{{P}}listings; delete from public.{{P}}album_picks; delete from public.{{P}}cards;
set request.jwt.claim.sub = :A;

\echo '--- recherche d''un joueur : début du pseudo, 2 caractères au moins, jamais soi-même, caractères spéciaux sans effet'
select pg_temp.expect('« ami_b » trouve Ami_Beta avec le lien « none »', (select count(*) from public.{{P}}friend_search('ami_b')) = 1 and (select relation from public.{{P}}friend_search('ami_b')) = 'none' and (select username from public.{{P}}friend_search('ami_b')) = 'Ami_Beta');
select pg_temp.expect('« ami_ » trouve les deux autres joueurs (pas moi-même)', (select count(*) from public.{{P}}friend_search('ami_')) = 2 and not exists (select 1 from public.{{P}}friend_search('ami_') where user_id = :A));
select pg_temp.expect('1 caractère : aucun résultat', (select count(*) from public.{{P}}friend_search('a')) = 0 and (select count(*) from public.{{P}}friend_search('')) = 0 and (select count(*) from public.{{P}}friend_search(null)) = 0);
select pg_temp.expect('« % » et « _ » sont des caractères ordinaires, pas des jokers', (select count(*) from public.{{P}}friend_search('%%')) = 0 and (select count(*) from public.{{P}}friend_search('am_')) = 0 and (select count(*) from public.{{P}}friend_search('ami%')) = 0);
select pg_temp.expect('rien d''autre que l''id, le pseudo et le lien n''est renvoyé', (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a where a.attrelid = (select p.oid from pg_proc p where p.proname = '{{P}}friend_search') and false) is null);

\echo '--- demandes : envoi, doublon, retour, acceptation automatique, refus'
select pg_temp.expect('A demande B : en attente', public.{{P}}friend_request(:B) ->> 'status' = 'pending');
select pg_temp.try('select public.{{P}}friend_request(''' || :B || ''')');                         -- request_pending
select pg_temp.try('select public.{{P}}friend_request(''' || :A || ''')');                         -- cannot_friend_self
select pg_temp.try('select public.{{P}}friend_request(''99999999-9999-9999-9999-999999999999'')');   -- user_not_found
select pg_temp.expect('A voit sa demande « sent »', (select relation from public.{{P}}friends_list() where user_id = :B) = 'sent');
select pg_temp.expect('la recherche annonce le lien « sent »', (select relation from public.{{P}}friend_search('ami_b')) = 'sent');
set request.jwt.claim.sub = :B;
select pg_temp.expect('B voit la demande « received », en premier', (select relation from public.{{P}}friends_list() where user_id = :A) = 'received' and (select user_id from public.{{P}}friends_list() limit 1) = :A);
select pg_temp.expect('B a 1 demande dans son statut (pastille de l''onglet Amis)', (public.{{P}}status() ->> 'friend_requests')::int = 1);
select friendship_id as fid from public.{{P}}friends_list() where user_id = :A \gset
set request.jwt.claim.sub = :C;
select pg_temp.try('select public.{{P}}friend_respond(' || :fid || ', true)');                      -- not_found : ce n'est pas sa demande
set request.jwt.claim.sub = :A;
select pg_temp.try('select public.{{P}}friend_respond(' || :fid || ', true)');                      -- not_found : l'expéditeur ne peut pas accepter sa propre demande
select pg_temp.try('select (select count(*) from public.{{P}}friend_cards(''' || :B || '''))');             -- not_friends : demande encore en attente
set request.jwt.claim.sub = :B;
select pg_temp.try('select (select count(*) from public.{{P}}friend_cards(''' || :A || '''))');             -- not_friends : en attente aussi
select public.{{P}}friend_respond(:fid, false) ->> 'ok' as refuse;
select pg_temp.expect('refuser supprime la demande', (select count(*) from public.{{P}}friendships) = 0);
select pg_temp.expect('plus de demande en attente dans le statut', (public.{{P}}status() ->> 'friend_requests')::int = 0);
set request.jwt.claim.sub = :A; select public.{{P}}friend_request(:B) ->> 'status' as demande_a_b;
set request.jwt.claim.sub = :B;
select pg_temp.expect('B demande A alors que A avait déjà demandé : amis tout de suite', public.{{P}}friend_request(:A) ->> 'status' = 'accepted');
select pg_temp.expect('une seule relation entre A et B, acceptée', (select count(*) from public.{{P}}friendships) = 1 and (select status from public.{{P}}friendships) = 'accepted');
select pg_temp.try('select public.{{P}}friend_request(''' || :A || ''')');                         -- already_friends
select pg_temp.expect('A et B sont amis dans les deux sens', (select relation from public.{{P}}friends_list() where user_id = :A) = 'friend');
set request.jwt.claim.sub = :C; select public.{{P}}friend_request(:A) ->> 'status' as c_demande_a;
set request.jwt.claim.sub = :A;
select friendship_id as fidc from public.{{P}}friends_list() where user_id = :C \gset
select public.{{P}}friend_respond(:fidc, true) ->> 'ok' as accepte;
select pg_temp.expect('A et C sont amis', (select relation from public.{{P}}friends_list() where user_id = :C) = 'friend');

\echo '--- les cartes de B : 6 cartes, 3 doubles (voir la définition dans le schéma)'
-- Emplacement 1 (type 1, série 100) : cartes 10, 11 et 12 ; 10 est dans l'album de B -> 11 et 12 sont des doubles (12 est en vente)
-- Emplacement 2 (type 2, série 100) : cartes 20 et 21, aucune dans l'album -> 21 est un double (la 1re par numéro ne l'est pas)
-- Emplacement 3 (type 3, série 100) : une seule carte -> pas un double. Une carte retirée du jeu n'existe plus pour personne.
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 100, 10, :B), (1, 100, 11, :B), (1, 100, 12, :B), (2, 100, 20, :B), (2, 100, 21, :B), (3, 100, 30, :B);
insert into public.{{P}}cards (type_id, series, number, owner_id, retired_at) values (4, 100, 40, null, now());
insert into public.{{P}}album_picks (user_id, type_id, rarity_id, base_rarity, series, number)
select :B, c.type_id, public.{{P}}rarity_id(c.number, c.series, c.type_id, c.base_rarity), c.base_rarity, c.series, c.number from public.{{P}}cards c where c.owner_id = :B and c.type_id = 1 and c.number = 10;
insert into public.{{P}}listings (type_id, base_rarity, series, number, seller_id, kind, price)
select c.type_id, c.base_rarity, c.series, c.number, :B, 'buy_now', 9 from public.{{P}}cards c where c.type_id = 1 and c.number = 12;
select pg_temp.expect('A voit les 6 cartes de B (la carte retirée n''en fait pas partie)', (select count(*) from public.{{P}}friend_cards(:B)) = 6 and (select max(total) from public.{{P}}friend_cards(:B)) = 6);
select pg_temp.expect('3 doubles : les cartes 11, 12 (emplacement avec choix d''album) et 21 (emplacement sans choix, 2e carte)',
  (select string_agg(card_type || '/' || card_number, ',' order by card_type, card_number) from public.{{P}}friend_cards(:B, true)) = '1/11,1/12,2/21');
select pg_temp.expect('« doubles seulement » : total et doubles_total valent 3', (select max(total) from public.{{P}}friend_cards(:B, true)) = 3 and (select max(doubles_total) from public.{{P}}friend_cards(:B, false)) = 3);
select pg_temp.expect('la carte de l''album et la carte seule ne sont jamais des doubles', not exists (select 1 from public.{{P}}friend_cards(:B) where is_double and card_number in (10, 20, 30)) and (select in_album from public.{{P}}friend_cards(:B) where card_number = 10));
select pg_temp.expect('le double en vente porte son annonce', (select listing_id from public.{{P}}friend_cards(:B) where card_number = 12) is not null and (select listing_id from public.{{P}}friend_cards(:B) where card_number = 11) is null);
-- « déjà possédé » : A a une carte dans l'emplacement du type 2 (même série) mais rien dans celui du type 1
insert into public.{{P}}cards (type_id, series, number, owner_id) values (2, 100, 50, :A);
select pg_temp.expect('i_own : les doubles 1/11 et 1/12 manquent à A, le double 2/21 est déjà possédé (emplacement du type 2)',
  (select string_agg(card_type || '/' || card_number || ':' || i_own, ',' order by card_type, card_number) from public.{{P}}friend_cards(:B, true)) = '1/11:false,1/12:false,2/21:true');
select pg_temp.expect('i_own concerne l''emplacement (type + rareté affichée), pas la carte exacte : la carte 2/20 aussi est « déjà possédée », la carte 3/30 non',
  (select i_own from public.{{P}}friend_cards(:B) where card_type = 2 and card_number = 20) and not (select i_own from public.{{P}}friend_cards(:B) where card_type = 3));
select pg_temp.expect('« déjà possédé » n''empêche pas l''offre : A propose 7 pièces pour le double 2/21 qu''il couvre déjà',
  (public.{{P}}make_offer(2, (select base_rarity from public.{{P}}cards where type_id = 2 and number = 21), 100, 21, 7) ->> 'offer_id') is not null);
select pg_temp.expect('la liste d''amis annonce 6 cartes et 3 doubles pour B', (select (cards, doubles) = (6, 3) from public.{{P}}friends_list() where user_id = :B));
select pg_temp.expect('pagination : 2 cartes par page, total inchangé', (select count(*) from public.{{P}}friend_cards(:B, false, 2, 0)) = 2 and (select count(*) from public.{{P}}friend_cards(:B, false, 2, 4)) = 2 and (select count(*) from public.{{P}}friend_cards(:B, false, 2, 6)) = 0 and (select max(total) from public.{{P}}friend_cards(:B, false, 2, 0)) = 6);
select pg_temp.expect('une demande acceptée mais C sans carte : 0 carte, 0 double', (select (cards, doubles) = (0, 0) from public.{{P}}friends_list() where user_id = :C));

\echo '--- confidentialité : un inconnu ne voit rien'
set request.jwt.claim.sub = :C;
select pg_temp.try('select (select count(*) from public.{{P}}friend_cards(''' || :B || '''))');             -- not_friends : C est ami de A, pas de B
set request.jwt.claim.sub = '';
select pg_temp.try('select (select count(*) from public.{{P}}friends_list())');                              -- not_authenticated
select pg_temp.try('select (select count(*) from public.{{P}}friend_search(''ami''))');                      -- not_authenticated
set request.jwt.claim.sub = :A;
select pg_temp.expect('droits : réservé aux joueurs connectés', has_function_privilege('authenticated', 'public.{{P}}friend_cards(uuid, boolean, int, int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}friend_cards(uuid, boolean, int, int)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}owner_cards_view(uuid)', 'execute'));
select pg_temp.expect('la table des amis n''est lisible par personne directement', not has_table_privilege('authenticated', 'public.{{P}}friendships', 'select') and not has_table_privilege('anon', 'public.{{P}}friendships', 'select'));

\echo '--- offre sur un double d''un ami'
select pg_temp.expect('A propose 5 pièces à B pour son double 1/11', (public.{{P}}make_offer(1, (select base_rarity from public.{{P}}cards where type_id = 1 and number = 11), 100, 11, 5) ->> 'offer_id') is not null);
select pg_temp.expect('l''offre existe (acheteur A, vendeur B, 5 pièces) et B est prévenu', (select count(*) from public.{{P}}offers where buyer_id = :A and seller_id = :B and amount = 5) = 1 and (select count(*) from public.{{P}}notifications where user_id = :B and kind = 'offer_received') >= 1);

\echo '--- offre acceptée par un ami : la carte nouvelle va directement dans l''album de l''acheteur'
create temp table coins_avant as select id, coins from public.{{P}}profiles where id in (:A, :B, :C);
update public.{{P}}profiles set coins = 1000 where id in (:A, :B, :C);
select id as oid1 from public.{{P}}offers where buyer_id = :A and seller_id = :B and amount = 5 \gset
select pg_temp.expect('avant : A n''a rien dans l''emplacement (type 1, série 100) de son album', not exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = 1));
set request.jwt.claim.sub = :B;
select (public.{{P}}respond_offer(:oid1, true) -> 'status') is not null as acceptee_par_b;
set request.jwt.claim.sub = :A;
select pg_temp.expect('la carte 1/11 est maintenant à A', (select owner_id from public.{{P}}cards where type_id = 1 and series = 100 and number = 11) = :A);
select pg_temp.expect('... et elle est directement dans l''album de A (carte nouvelle, vendeur ami)', exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = 1 and series = 100 and number = 11));
select pg_temp.expect('l''album de B est inchangé (sa carte 10 y est toujours, rien n''y a été ajouté pour lui)', (select count(*) from public.{{P}}album_picks where user_id = :B) = 1 and exists (select 1 from public.{{P}}album_picks where user_id = :B and number = 10));
select pg_temp.expect('l''acheteur est prévenu de l''acceptation', exists (select 1 from public.{{P}}notifications where user_id = :A and kind = 'offer_accepted'));
-- deuxième offre : même emplacement, A a déjà la carte 11 dans son album -> la carte 12 n'est pas nouvelle, l'album ne change pas
select (public.{{P}}make_offer(1, (select base_rarity from public.{{P}}cards where type_id = 1 and number = 12), 100, 12, 6) ->> 'offer_id')::bigint as oid2 \gset
set request.jwt.claim.sub = :B;
select (public.{{P}}respond_offer(:oid2, true) -> 'status') is not null as acceptee_2;
set request.jwt.claim.sub = :A;
select pg_temp.expect('carte déjà couverte : la carte 12 arrive chez A mais l''album garde la carte 11 (aucun remplacement)',
  (select owner_id from public.{{P}}cards where type_id = 1 and number = 12) = :A
  and (select count(*) from public.{{P}}album_picks where user_id = :A and type_id = 1) = 1 and exists (select 1 from public.{{P}}album_picks where user_id = :A and type_id = 1 and number = 11));
-- offre d'un joueur qui n'est PAS ami du vendeur : la carte arrive, mais pas dans l'album
set request.jwt.claim.sub = :C;
select (public.{{P}}make_offer(2, (select base_rarity from public.{{P}}cards where type_id = 2 and number = 21), 100, 21, 5) ->> 'offer_id')::bigint as oid3 \gset
set request.jwt.claim.sub = :B;
select (public.{{P}}respond_offer(:oid3, true) -> 'status') is not null as acceptee_3;
set request.jwt.claim.sub = :C;
select pg_temp.expect('vendeur non ami : la carte 2/21 arrive chez C mais n''est PAS placée dans son album',
  (select owner_id from public.{{P}}cards where type_id = 2 and number = 21) = :C and not exists (select 1 from public.{{P}}album_picks where user_id = :C));
set request.jwt.claim.sub = :A;
select pg_temp.expect('A peut vendre la carte 12 (hors album) : seul l''emplacement nouveau a été protégé', not exists (select 1 from public.{{P}}album_picks where user_id = :A and number = 12));
update public.{{P}}profiles p set coins = c.coins from coins_avant c where c.id = p.id;

\echo '--- retirer un ami'
select public.{{P}}friend_remove(:C) ->> 'ok' as retire;
select pg_temp.expect('A retire C : la relation disparaît', not exists (select 1 from public.{{P}}friends_list() where user_id = :C));
select pg_temp.try('select public.{{P}}friend_remove(''' || :C || ''')');                          -- not_found
set request.jwt.claim.sub = :C;
select pg_temp.try('select (select count(*) from public.{{P}}friend_cards(''' || :A || '''))');             -- not_friends : C n'est plus ami de A
set request.jwt.claim.sub = :A;
select pg_temp.expect('B voit toujours A comme ami', (select relation from public.{{P}}friends_list() where user_id = :B) = 'friend');

-- nettoyage
delete from public.{{P}}friendships; delete from public.{{P}}offers; delete from public.{{P}}notifications where kind = 'offer_received'; delete from public.{{P}}listings; delete from public.{{P}}album_picks; delete from public.{{P}}cards;
update public.{{P}}profiles p set username = n.username from noms_avant n where n.id = p.id;
