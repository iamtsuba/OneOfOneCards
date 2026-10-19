-- Pass Pro (achat unique, avantages à vie) : membre, recharge réduite, cadeau unique, remboursement, booster des membres à la place du Standard, réglage du nom, droits.
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
create temp table cf_backup as select * from public.{{P}}config;
create temp table tc_backup as select * from public.{{P}}text_config;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
delete from public.{{P}}pro_members; delete from public.{{P}}user_boosters;
select id as std from public.{{P}}booster_types where is_standard \gset
select id as onemore from public.{{P}}booster_types where role = 'subscriber' \gset
select id as gift from public.{{P}}booster_types where role = 'subscription_gift' \gset
create or replace function pg_temp.qty(uid uuid) returns int language sql as $$ select coalesce((select quantity from public.{{P}}user_boosters where user_id = uid and booster_type_id = (select id from public.{{P}}booster_types where role = 'subscription_gift')), 0) $$;
create or replace function pg_temp.pro(on_ boolean) returns boolean language plpgsql as $$
begin
  delete from public.{{P}}pro_members where user_id = '11111111-1111-1111-1111-111111111111';
  if on_ then insert into public.{{P}}pro_members (user_id, stripe_session_id, stripe_payment_intent, amount_cents, currency) values ('11111111-1111-1111-1111-111111111111', 'cs_test_pro_a', 'pi_pro_a', 999, 'eur'); end if;
  return public.{{P}}is_subscriber('11111111-1111-1111-1111-111111111111');
end $$;

\echo '--- réglages de départ'
select pg_temp.expect('pass Pro masqué par défaut, 9,99 € une seule fois, recharge de 5 minutes, 1 booster cadeau', (select string_agg(key || '=' || value::int, ',' order by key) from public.{{P}}config where key like 'subscri%') = 'subscriber_regen_minutes=5,subscription_enabled=0,subscription_gift_quantity=1,subscription_price_cents=999');
select pg_temp.expect('le nom du pass est un réglage texte, « OneMore » au départ', (select value from public.{{P}}text_config where key = 'subscription_name') = 'OneMore');
select pg_temp.expect('les descriptions des réglages parlent du pass Pro (achat unique), plus d''abonnement mensuel', (select bool_and(description ~* 'pass pro') from public.{{P}}config where key like 'subscri%') and not exists (select 1 from public.{{P}}config where description ~* 'mensuel|facturation|abonnés déjà'));
select pg_temp.expect('l''ancien abonnement mensuel a disparu de la base (tables, notification périodique)', to_regclass('public.{{P}}subscriptions') is null and to_regclass('public.{{P}}subscription_gifts') is null and not exists (select 1 from pg_proc where proname = '{{P}}subscription_sync'));

\echo '--- être membre : pass acheté et non remboursé, pour toujours'
select pg_temp.expect('personne n''est membre au départ', (select count(*) from public.{{P}}pro_members) = 0 and not public.{{P}}is_subscriber(:A) and not public.{{P}}is_subscriber(null));
select pg_temp.expect('pass acheté : membre', pg_temp.pro(true));
update public.{{P}}pro_members set granted_at = now() - interval '5 years' where user_id = :A;
select pg_temp.expect('aucune date de fin : membre même 5 ans après l''achat', public.{{P}}is_subscriber(:A));
update public.{{P}}pro_members set revoked_at = now() where user_id = :A;
select pg_temp.expect('pass remboursé : plus membre', not public.{{P}}is_subscriber(:A));
select pg_temp.expect('l''état d''un joueur ne déteint pas sur un autre', pg_temp.pro(true) and not public.{{P}}is_subscriber(:B));

\echo '--- recharge : 10 minutes pour tous, 5 minutes pour un membre'
update public.{{P}}config set value = 1 where key = 'regen_amount'; update public.{{P}}config set value = 100 where key = 'max_boosters';
update public.{{P}}profiles set boosters = 0, bonus_boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id in (:A, :B);
select pg_temp.pro(false) as _ \gset
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as non_membre from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('non membre : 31 minutes / 10 = 3 boosters', :non_membre = 3);
select pg_temp.pro(true) as _ \gset
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as membre from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('membre Pro : 31 minutes / 5 = 6 boosters', :membre = 6);
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :B;
select (public.{{P}}sync(:B)).id as _sync \gset
select boosters as voisin from public.{{P}}profiles where id = :B \gset
select pg_temp.expect('le voisin non membre reste à 10 minutes (3 boosters)', :voisin = 3);
set request.jwt.claim.sub = :A;
select pg_temp.expect('le statut annonce 5 minutes au membre', (public.{{P}}status() ->> 'regen_minutes')::int = 5 and (public.{{P}}status() -> 'subscription' ->> 'regen_minutes')::int = 5);
set request.jwt.claim.sub = :B;
select pg_temp.expect('... et 10 au non membre', (public.{{P}}status() ->> 'regen_minutes')::int = 10 and (public.{{P}}status() -> 'subscription' ->> 'active')::bool = false);
update public.{{P}}config set value = 3 where key = 'subscriber_regen_minutes';
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
set request.jwt.claim.sub = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as trois from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('délai des membres réglable : 3 minutes = 10 boosters sur 31 minutes', :trois = 10);
update public.{{P}}config set value = 15 where key = 'subscriber_regen_minutes';
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as quinze from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('un délai « membre » plus long que le normal ne pénalise jamais : on garde le plus court (10 minutes = 3 boosters)', :quinze = 3);
update public.{{P}}config c set value = b.value from cf_backup b where b.key = c.key and c.key in ('regen_amount', 'max_boosters', 'subscriber_regen_minutes');

\echo '--- achat du pass confirmé par Stripe : membre à vie et UN booster cadeau'
delete from public.{{P}}pro_members; delete from public.{{P}}user_boosters;
select public.{{P}}pro_grant(:A, 'cs_test_1', 'pi_1', 999, 'eur') as r \gset ev_
select pg_temp.expect('achat : membre, un booster cadeau offert et mis dans le stock (Art Rare assuré x1)', (:'ev_r'::jsonb ->> 'gift_granted')::bool and (:'ev_r'::jsonb ->> 'active')::bool and pg_temp.qty(:A) = 1 and public.{{P}}is_subscriber(:A));
select pg_temp.expect('l''achat est enregistré (session, paiement, montant, date du cadeau)', (select (stripe_session_id, stripe_payment_intent, amount_cents, currency) = ('cs_test_1', 'pi_1', 999, 'eur') and gift_granted_at is not null and revoked_at is null from public.{{P}}pro_members where user_id = :A));
select public.{{P}}pro_grant(:A, 'cs_test_1', 'pi_1', 999, 'eur') as r \gset ev_
select pg_temp.expect('la même session rejouée (confirmation au retour puis webhook) : aucun second cadeau, pas de signalement de double paiement', (:'ev_r'::jsonb ->> 'already')::bool and not (:'ev_r'::jsonb ->> 'gift_granted')::bool and not (:'ev_r'::jsonb ->> 'extra_payment')::bool and pg_temp.qty(:A) = 1);
select public.{{P}}pro_grant(:A, 'cs_test_2', 'pi_2', 999, 'eur') as r \gset ev_
select pg_temp.expect('un second paiement d''une AUTRE session est signalé (« extra_payment », à rembourser), sans second cadeau ni changement du pass', (:'ev_r'::jsonb ->> 'extra_payment')::bool and not (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:A) = 1 and (select stripe_session_id from public.{{P}}pro_members where user_id = :A) = 'cs_test_1');
select pg_temp.expect('joueur inconnu : ignoré sans erreur, rien d''enregistré', (public.{{P}}pro_grant('99999999-9999-9999-9999-999999999999', 'cs_x', 'pi_x', 1, 'eur') ->> 'ignored')::bool and not exists (select 1 from public.{{P}}pro_members where stripe_session_id = 'cs_x'));
select pg_temp.expect('session vide ou trop courte refusée', pg_temp.err($q$select public.{{P}}pro_grant('22222222-2222-2222-2222-222222222222', null, 'pi', 1, 'eur')$q$) = 'invalid_session' and pg_temp.err($q$select public.{{P}}pro_grant('22222222-2222-2222-2222-222222222222', 'abc', 'pi', 1, 'eur')$q$) = 'invalid_session' and not public.{{P}}is_subscriber(:B));
update public.{{P}}config set value = 3 where key = 'subscription_gift_quantity';
select public.{{P}}pro_grant(:B, 'cs_test_b', 'pi_b', 999, 'eur') as r \gset ev_
select pg_temp.expect('quantité du cadeau réglable (3) : le pass d''un autre joueur donne 3 boosters', (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:B) = 3);
update public.{{P}}config set value = 1 where key = 'subscription_gift_quantity';

\echo '--- remboursement : le pass est retiré, les boosters reçus restent acquis'
select public.{{P}}pro_revoke('pi_1') as r \gset ev_
select pg_temp.expect('remboursement complet (identifiant de paiement) : le membre perd son pass', (:'ev_r'::jsonb ->> 'revoked')::int = 1 and not public.{{P}}is_subscriber(:A) and public.{{P}}is_subscriber(:B));
select pg_temp.expect('le cadeau déjà reçu reste dans le stock', pg_temp.qty(:A) = 1);
select pg_temp.expect('rembourser deux fois, un paiement inconnu, vide ou nul : rien (0)', (public.{{P}}pro_revoke('pi_1') ->> 'revoked')::int = 0 and (public.{{P}}pro_revoke('pi_inconnu') ->> 'revoked')::int = 0 and (public.{{P}}pro_revoke('') ->> 'revoked')::int = 0 and (public.{{P}}pro_revoke(null) ->> 'revoked')::int = 0);
select public.{{P}}pro_grant(:A, 'cs_test_3', 'pi_3', 999, 'eur') as r \gset ev_
select pg_temp.expect('rachat après remboursement : redevient membre et reçoit le cadeau de ce nouvel achat (2 en stock)', (:'ev_r'::jsonb ->> 'gift_granted')::bool and public.{{P}}is_subscriber(:A) and pg_temp.qty(:A) = 2
  and (select (stripe_session_id, stripe_payment_intent, revoked_at is null) = ('cs_test_3', 'pi_3', true) from public.{{P}}pro_members where user_id = :A));
update public.{{P}}config set value = 0 where key = 'subscription_gift_quantity';
delete from public.{{P}}pro_members where user_id = :B;
select public.{{P}}pro_grant(:B, 'cs_test_b2', 'pi_b2', 999, 'eur') as r \gset ev_
select pg_temp.expect('quantité 0 : membre sans cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and public.{{P}}is_subscriber(:B) and pg_temp.qty(:B) = 3);
update public.{{P}}config set value = 1 where key = 'subscription_gift_quantity';
update public.{{P}}booster_types set enabled = false where id = :gift;
delete from public.{{P}}pro_members where user_id = :B;
select public.{{P}}pro_grant(:B, 'cs_test_b3', 'pi_b3', 999, 'eur') as r \gset ev_
select pg_temp.expect('booster cadeau désactivé : membre sans cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and public.{{P}}is_subscriber(:B) and pg_temp.qty(:B) = 3);
update public.{{P}}booster_types set enabled = true where id = :gift;

\echo '--- ouverture : le membre ouvre le booster des membres à la place du Standard'
delete from public.{{P}}pro_members; delete from public.{{P}}cards;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Pro Test', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'Carte ' || g, '🐱', g, false from generate_series(1, 12) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select t.id, r.rid, 40, 40, 'simple' from public.{{P}}types t cross join (values ('common'), ('rare'), ('super'), ('ultra')) r(rid) where t.category_id = :cat;
delete from public.{{P}}booster_type_slots where booster_type_id in (:std, :onemore);
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) select :std, p, 'common', 100 from generate_series(1, 5) p;
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight) select :onemore, p, 'super', 100 from generate_series(1, 5) p;
update public.{{P}}profiles set boosters = 30, bonus_boosters = 0 where id in (:A, :B);
set request.jwt.claim.sub = :B;
create temp table nb as select public.{{P}}open_booster() as j;
select pg_temp.expect('non membre : Standard (5 Communes), le résultat porte le nom « Standard » et aucun halo', (select count(*) = 5 and bool_and(c ->> 'base_rarity' = 'common') from nb, jsonb_array_elements(j -> 'cards') c) and (select j -> 'booster' ->> 'name' = 'Standard' and j -> 'booster' ->> 'glow' = 'none' from nb));
select pg_temp.pro(true) as _ \gset
update public.{{P}}profiles set boosters = 30 where id = :A;
set request.jwt.claim.sub = :A;
create temp table ab as select public.{{P}}open_booster() as j;
select pg_temp.expect('membre : booster des membres (5 Super Rare), le résultat porte son nom « OneMore »', (select count(*) = 5 and bool_and(c ->> 'base_rarity' = 'super') from ab, jsonb_array_elements(j -> 'cards') c) and (select j -> 'booster' ->> 'name' = 'OneMore' from ab));
select pg_temp.expect('le résultat porte le halo du booster des membres (doré)', (select j -> 'booster' ->> 'glow' = 'gold' from ab));
select pg_temp.expect('même stock : une seule unité consommée (29 restants)', (select boosters from public.{{P}}profiles where id = :A) = 29);
select pg_temp.expect('le statut annonce le booster des membres comme « booster standard » du joueur, avec son halo', (public.{{P}}status() -> 'standard_booster' ->> 'name') = 'OneMore' and (public.{{P}}status() -> 'standard_booster' ->> 'glow') = 'gold');
select pg_temp.expect('les chances affichées sont celles du booster des membres (carte 1 : Super Rare 100 %)', (public.{{P}}draw_odds(:cat) -> 'booster' ->> 'name') = 'OneMore' and (public.{{P}}draw_odds(:cat) #>> '{positions,0,mix,0,id}') = 'super');
set request.jwt.claim.sub = :B;
select pg_temp.expect('... et pour un non membre, celles du Standard', (public.{{P}}draw_odds(:cat) -> 'booster' ->> 'name') = 'Standard' and (public.{{P}}draw_odds(:cat) #>> '{positions,0,mix,0,id}') = 'common');
set request.jwt.claim.sub = :A;
select pg_temp.expect('en désignant un type précis, les chances sont celles de ce type même pour un membre', (public.{{P}}draw_odds(:cat, :std) -> 'booster' ->> 'name') = 'Standard');
update public.{{P}}booster_types set enabled = false where id = :onemore;
create temp table ab2 as select public.{{P}}open_booster() as j;
select pg_temp.expect('booster des membres désactivé : le membre retombe sur le Standard', (select bool_and(c ->> 'base_rarity' = 'common') from ab2, jsonb_array_elements(j -> 'cards') c));
update public.{{P}}booster_types set enabled = true where id = :onemore;
update public.{{P}}pro_members set revoked_at = now() where user_id = :A;
create temp table ab3 as select public.{{P}}open_booster() as j;
select pg_temp.expect('pass remboursé : de nouveau le Standard', (select bool_and(c ->> 'base_rarity' = 'common') from ab3, jsonb_array_elements(j -> 'cards') c));

\echo '--- statut : ce que voit le joueur'
select pg_temp.pro(true) as _ \gset
update public.{{P}}config set value = 1 where key = 'subscription_enabled'; update public.{{P}}config set value = 1299 where key = 'subscription_price_cents';
select pg_temp.expect('pass : proposé, prix, nom, membre actif, date d''achat, avantages, aucune notion de période ni de renouvellement',
  (select (s ->> 'enabled', s ->> 'name', s ->> 'price_cents', s ->> 'active', s ->> 'booster_name', s ->> 'booster_color', s ->> 'gift_name', s ->> 'gift_quantity') = ('true', 'OneMore', '1299', 'true', 'OneMore', '#7c3aed', 'Art Rare assuré', '1')
     and s ->> 'since' is not null and gift_ok and not (s ? 'period_end') and not (s ? 'cancel_at_period_end')
     from (select public.{{P}}status() -> 'subscription' as s, (public.{{P}}status() -> 'subscription' ->> 'gift_id')::int = :gift as gift_ok) z));
set request.jwt.claim.sub = :B;
select pg_temp.expect('pour un non membre : pas de date d''achat (null)', (public.{{P}}status() -> 'subscription' -> 'since') = 'null'::jsonb and (public.{{P}}status() -> 'subscription' ->> 'active') = 'false');
set request.jwt.claim.sub = :A;
update public.{{P}}config set value = 0 where key = 'subscription_enabled';
select pg_temp.expect('pass masqué : le statut l''indique (enabled = false) mais le membre reste membre', (public.{{P}}status() -> 'subscription' ->> 'enabled') = 'false' and (public.{{P}}status() -> 'subscription' ->> 'active') = 'true');

\echo '--- nom du pass (réglage texte de l''admin)'
select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', '  Premium  ') as r \gset t_
select pg_temp.expect('changer le nom (espaces retirés) : le statut le montre', (:'t_r'::jsonb ->> 'ok')::bool and (public.{{P}}status() -> 'subscription' ->> 'name') = 'Premium' and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('nom vide ou de plus de 60 caractères : refusé, rien ne change', pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', '   ')$q$) = 'invalid_value'
  and pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', repeat('x', 61))$q$) = 'invalid_value' and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('clé inconnue : introuvable ; mauvais mot de passe : refusé', pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'nimporte_quoi', 'x')$q$) = 'not_found'
  and (public.{{P}}admin_set_text_config('mauvais', 'subscription_name', 'Pirate') ->> 'error') is not null and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('l''admin voit les réglages texte', exists (select 1 from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'text_config') t where t ->> 'key' = 'subscription_name' and t ->> 'value' = 'Premium'));

\echo '--- droits : seul le serveur de paiement écrit les membres Pro'
select pg_temp.expect('attribution et retrait du pass : réservés à la clé de service (ni joueur, ni visiteur)', has_function_privilege('service_role', 'public.{{P}}pro_grant(uuid, text, text, int, text)', 'execute') and has_function_privilege('service_role', 'public.{{P}}pro_revoke(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}pro_grant(uuid, text, text, int, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}pro_grant(uuid, text, text, int, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}pro_revoke(text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}pro_revoke(text)', 'execute'));
select pg_temp.expect('la table des membres est fermée aux joueurs et aux visiteurs (un joueur ne peut pas se donner le pass)', not has_table_privilege('authenticated', 'public.{{P}}pro_members', 'select') and not has_table_privilege('authenticated', 'public.{{P}}pro_members', 'insert')
  and not has_table_privilege('authenticated', 'public.{{P}}pro_members', 'update') and not has_table_privilege('anon', 'public.{{P}}pro_members', 'select') and not has_table_privilege('authenticated', 'public.{{P}}text_config', 'update'));
select pg_temp.expect('fonctions internes fermées (est membre, délai, lecture des textes, semis)', not has_function_privilege('authenticated', 'public.{{P}}is_subscriber(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}regen_minutes_for(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}text_cfg(text)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}seed_role_boosters()', 'execute'));
select pg_temp.expect('réglage du nom : réservé aux connectés (puis mot de passe admin), pas aux visiteurs', has_function_privilege('authenticated', 'public.{{P}}admin_set_text_config(text, text, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_set_text_config(text, text, text)', 'execute'));

-- nettoyage
delete from public.{{P}}pro_members; delete from public.{{P}}cards;
delete from public.{{P}}categories where name = 'Pro Test';
update public.{{P}}categories set closed = false;
delete from public.{{P}}booster_type_slots where booster_type_id in (select id from bt_backup);
insert into public.{{P}}booster_type_slots select * from sl_backup;
update public.{{P}}booster_types b set enabled = o.enabled from bt_backup o where o.id = b.id;
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
update public.{{P}}config c set value = b.value from cf_backup b where b.key = c.key;
update public.{{P}}text_config t set value = b.value from tc_backup b where b.key = t.key;
update public.{{P}}profiles set boosters = 0, bonus_boosters = 0 where id in (:A, :B);
