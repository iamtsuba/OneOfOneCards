-- Abonnement : état d'abonné, recharge réduite, cadeau mensuel unique, booster des abonnés à la place du Standard, réglages texte, droits.
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
delete from public.{{P}}subscriptions; delete from public.{{P}}subscription_gifts; delete from public.{{P}}user_boosters;
select id as std from public.{{P}}booster_types where is_standard \gset
select id as onemore from public.{{P}}booster_types where role = 'subscriber' \gset
select id as gift from public.{{P}}booster_types where role = 'subscription_gift' \gset

\echo '--- réglages de départ'
select pg_temp.expect('abonnement masqué par défaut, 4,99 € par mois, recharge de 5 minutes, 1 booster cadeau par période', (select string_agg(key || '=' || value::int, ',' order by key) from public.{{P}}config where key like 'subscri%') = 'subscriber_regen_minutes=5,subscription_enabled=0,subscription_gift_quantity=1,subscription_price_cents=499');
select pg_temp.expect('le nom de l''abonnement est un réglage texte, « OneMore » au départ', (select value from public.{{P}}text_config where key = 'subscription_name') = 'OneMore');

\echo '--- être abonné : actif ou en essai, jamais en retard de paiement ni résilié ; 2 jours de tolérance après la fin de période'
select pg_temp.expect('personne n''est abonné au départ', (select count(*) from public.{{P}}subscriptions) = 0);
create or replace function pg_temp.sub(st text, ends interval) returns boolean language plpgsql as $$
begin
  delete from public.{{P}}subscriptions where user_id = '11111111-1111-1111-1111-111111111111';
  insert into public.{{P}}subscriptions (user_id, status, current_period_start, current_period_end) values ('11111111-1111-1111-1111-111111111111', st, now() - interval '20 days', now() + ends);
  return public.{{P}}is_subscriber('11111111-1111-1111-1111-111111111111');
end $$;
select pg_temp.expect('active et trialing : abonné', pg_temp.sub('active', interval '10 days') and pg_temp.sub('trialing', interval '3 days'));
select pg_temp.expect('past_due, canceled, incomplete, unpaid, incomplete_expired : pas abonné', not pg_temp.sub('past_due', interval '10 days') and not pg_temp.sub('canceled', interval '10 days') and not pg_temp.sub('incomplete', interval '10 days')
  and not pg_temp.sub('unpaid', interval '10 days') and not pg_temp.sub('incomplete_expired', interval '10 days'));
select pg_temp.expect('période terminée depuis 1 jour : encore abonné (tolérance si le renouvellement tarde) ; depuis 3 jours : plus abonné', pg_temp.sub('active', interval '-1 day') and not pg_temp.sub('active', interval '-3 days'));
select pg_temp.expect('un autre joueur n''est pas abonné parce qu''un autre l''est', pg_temp.sub('active', interval '10 days') and not public.{{P}}is_subscriber(:B) and not public.{{P}}is_subscriber(null));

\echo '--- recharge : 10 minutes pour tous, 5 minutes pour un abonné'
update public.{{P}}config set value = 1 where key = 'regen_amount'; update public.{{P}}config set value = 100 where key = 'max_boosters';
update public.{{P}}profiles set boosters = 0, bonus_boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id in (:A, :B);
delete from public.{{P}}subscriptions;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as non_abonne from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('non abonné : 31 minutes / 10 = 3 boosters', :non_abonne = 3);
select pg_temp.sub('active', interval '10 days') as _ \gset
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as abonne from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('abonné : 31 minutes / 5 = 6 boosters', :abonne = 6);
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :B;
select (public.{{P}}sync(:B)).id as _sync \gset
select boosters as autre from public.{{P}}profiles where id = :B \gset
select pg_temp.expect('le voisin non abonné reste à 10 minutes (3 boosters)', :autre = 3);
set request.jwt.claim.sub = :A;
select pg_temp.expect('le statut annonce 5 minutes à l''abonné et 10 aux autres', (public.{{P}}status() ->> 'regen_minutes')::int = 5 and (public.{{P}}status() -> 'subscription' ->> 'regen_minutes')::int = 5);
set request.jwt.claim.sub = :B;
select pg_temp.expect('... et 10 au non abonné (le prochain palier reste calculé sur 10 minutes)', (public.{{P}}status() ->> 'regen_minutes')::int = 10 and (public.{{P}}status() -> 'subscription' ->> 'active')::bool = false);
update public.{{P}}config set value = 3 where key = 'subscriber_regen_minutes';
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
set request.jwt.claim.sub = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as trois from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('délai des abonnés réglable : 3 minutes = 10 boosters sur 31 minutes', :trois = 10);
update public.{{P}}config set value = 15 where key = 'subscriber_regen_minutes';
update public.{{P}}profiles set boosters = 0, boosters_updated_at = now() - interval '31 minutes' where id = :A;
select (public.{{P}}sync(:A)).id as _sync \gset
select boosters as quinze from public.{{P}}profiles where id = :A \gset
select pg_temp.expect('un délai « abonné » plus long que le normal ne pénalise jamais : on garde le plus court (10 minutes = 3 boosters)', :quinze = 3);
update public.{{P}}config c set value = b.value from cf_backup b where b.key = c.key and c.key in ('regen_amount', 'max_boosters', 'subscriber_regen_minutes');

\echo '--- notifications de Stripe : état de l''abonnement et booster cadeau (une fois par période)'
delete from public.{{P}}subscriptions; delete from public.{{P}}user_boosters; delete from public.{{P}}subscription_gifts;
create or replace function pg_temp.qty(uid uuid) returns int language sql as $$ select coalesce((select quantity from public.{{P}}user_boosters where user_id = uid and booster_type_id = (select id from public.{{P}}booster_types where role = 'subscription_gift')), 0) $$;
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'active', '2026-10-01 10:00+00', '2026-11-01 10:00+00', false, '2026-10-01 10:00:05+00') as r \gset ev_
select pg_temp.expect('création : actif, un booster cadeau offert et mis dans le stock (Art Rare assuré x1)', (:'ev_r'::jsonb ->> 'gift_granted')::bool and (:'ev_r'::jsonb ->> 'active')::bool and pg_temp.qty(:A) = 1);
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'active', '2026-10-01 10:00+00', '2026-11-01 10:00+00', false, '2026-10-01 10:00:06+00') as r \gset ev_
select pg_temp.expect('le même événement rejoué : aucun second cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:A) = 1);
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'active', '2026-10-01 10:00+00', '2026-11-01 10:00+00', true, '2026-10-05 08:00+00') as r \gset ev_
select pg_temp.expect('mise à jour de la même période (annulation programmée) : pas de cadeau, l''annulation est enregistrée', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:A) = 1
  and (select cancel_at_period_end from public.{{P}}subscriptions where user_id = :A));
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'canceled', null, null, false, '2026-10-02 00:00+00') as r \gset ev_
select pg_temp.expect('un événement plus ancien que le dernier reçu est ignoré (état inchangé)', (:'ev_r'::jsonb ->> 'stale')::bool and (select status from public.{{P}}subscriptions where user_id = :A) = 'active');
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'active', '2026-11-01 10:00+00', '2026-12-01 10:00+00', false, '2026-11-01 10:00:03+00') as r \gset ev_
select pg_temp.expect('renouvellement (nouvelle période) : un nouveau cadeau, 2 en stock', (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:A) = 2);
select pg_temp.expect('le renouvellement a décalé la période sans toucher au client Stripe', (select (stripe_customer_id, stripe_subscription_id, current_period_end) = ('cus_1', 'sub_1', '2026-12-01 10:00+00'::timestamptz) from public.{{P}}subscriptions where user_id = :A));
select public.{{P}}subscription_sync(:A, 'cus_1', 'sub_1', 'past_due', '2026-12-01 10:00+00', '2027-01-01 10:00+00', false, '2026-12-01 10:00:09+00') as r \gset ev_
select pg_temp.expect('paiement en retard (past_due) : plus abonné, pas de cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and not (:'ev_r'::jsonb ->> 'active')::bool and not public.{{P}}is_subscriber(:A) and pg_temp.qty(:A) = 2);
select public.{{P}}subscription_sync(:A, null, null, 'canceled', null, null, false, '2026-12-05 00:00+00') as r \gset ev_
select pg_temp.expect('résiliation (canceled) : plus abonné ; le stock de cadeaux déjà reçus reste acquis', not (:'ev_r'::jsonb ->> 'active')::bool and pg_temp.qty(:A) = 2);
select pg_temp.expect('un client ou un abonnement non précisé ne remplace pas ceux déjà connus', (select (stripe_customer_id, stripe_subscription_id) = ('cus_1', 'sub_1') from public.{{P}}subscriptions where user_id = :A));
update public.{{P}}config set value = 3 where key = 'subscription_gift_quantity';
select public.{{P}}subscription_sync(:B, 'cus_2', 'sub_2', 'trialing', '2026-10-10 00:00+00', '2026-10-17 00:00+00', false, '2026-10-10 00:00+00') as r \gset ev_
select pg_temp.expect('quantité du cadeau réglable (3) : le nouvel abonnement d''un autre joueur reçoit 3 boosters', (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:B) = 3);
update public.{{P}}config set value = 0 where key = 'subscription_gift_quantity';
select public.{{P}}subscription_sync(:B, 'cus_2', 'sub_2', 'active', '2026-11-10 00:00+00', '2026-12-10 00:00+00', false, '2026-11-10 00:00+00') as r \gset ev_
select pg_temp.expect('quantité 0 : plus de cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and pg_temp.qty(:B) = 3);
update public.{{P}}config set value = 1 where key = 'subscription_gift_quantity';
update public.{{P}}booster_types set enabled = false where id = :gift;
select public.{{P}}subscription_sync(:B, 'cus_2', 'sub_2', 'active', '2026-12-10 00:00+00', '2027-01-10 00:00+00', false, '2026-12-10 00:00+00') as r \gset ev_
select pg_temp.expect('booster cadeau désactivé : l''abonnement est tenu à jour, aucun cadeau', not (:'ev_r'::jsonb ->> 'gift_granted')::bool and public.{{P}}is_subscriber(:B) and pg_temp.qty(:B) = 3);
update public.{{P}}booster_types set enabled = true where id = :gift;
select public.{{P}}subscription_sync('99999999-9999-9999-9999-999999999999', 'cus_x', 'sub_x', 'active', now(), now() + interval '1 month', false) as r \gset ev_
select pg_temp.expect('joueur inconnu : ignoré sans erreur, rien d''enregistré', (:'ev_r'::jsonb ->> 'ignored')::bool and not exists (select 1 from public.{{P}}subscriptions where stripe_customer_id = 'cus_x'));
select pg_temp.expect('statut vide ou trop long refusé', pg_temp.err($q$select public.{{P}}subscription_sync('11111111-1111-1111-1111-111111111111', 'c', 's', null, now(), now(), false)$q$) = 'invalid_status'
  and pg_temp.err($q$select public.{{P}}subscription_sync('11111111-1111-1111-1111-111111111111', 'c', 's', repeat('x', 41), now(), now(), false)$q$) = 'invalid_status');

\echo '--- ouverture : l''abonné ouvre le booster des abonnés à la place du Standard'
delete from public.{{P}}subscriptions; delete from public.{{P}}cards;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Abo Test', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'Carte ' || g, '🐱', g, false from generate_series(1, 12) g;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
select t.id, r.rid, 40, 40, 'simple' from public.{{P}}types t cross join (values ('common'), ('rare'), ('super'), ('ultra')) r(rid) where t.category_id = :cat;
update public.{{P}}booster_type_slots set weight = 100 where booster_type_id = :std;
delete from public.{{P}}booster_type_slots where booster_type_id in (:std, :onemore);
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight)
select :std, p, 'common', 100 from generate_series(1, 5) p;
insert into public.{{P}}booster_type_slots (booster_type_id, position, rarity_id, weight)
select :onemore, p, 'super', 100 from generate_series(1, 5) p;
update public.{{P}}profiles set boosters = 30, bonus_boosters = 0 where id in (:A, :B);
set request.jwt.claim.sub = :B;
create temp table nb as select public.{{P}}open_booster() as j;
select pg_temp.expect('non abonné : Standard (5 Communes), le résultat porte le nom « Standard » et aucun halo', (select count(*) = 5 and bool_and(c ->> 'base_rarity' = 'common') from nb, jsonb_array_elements(j -> 'cards') c) and (select j -> 'booster' ->> 'name' = 'Standard' and j -> 'booster' ->> 'glow' = 'none' from nb));
select pg_temp.sub('active', interval '10 days') as _ \gset
update public.{{P}}profiles set boosters = 30 where id = :A;
set request.jwt.claim.sub = :A;
create temp table ab as select public.{{P}}open_booster() as j;
select pg_temp.expect('abonné : booster des abonnés (5 Super Rare), le résultat porte son nom « OneMore »', (select count(*) = 5 and bool_and(c ->> 'base_rarity' = 'super') from ab, jsonb_array_elements(j -> 'cards') c) and (select j -> 'booster' ->> 'name' = 'OneMore' from ab));
select pg_temp.expect('le résultat porte le halo du booster des abonnés (doré)', (select j -> 'booster' ->> 'glow' = 'gold' from ab));
select pg_temp.expect('le statut donne le halo du booster de l''abonné (doré) et celui du Standard pour un non abonné (aucun)', (public.{{P}}status() -> 'standard_booster' ->> 'glow') = 'gold');
select pg_temp.expect('même stock : une seule unité consommée (29 restants)', (select boosters from public.{{P}}profiles where id = :A) = 29);
select pg_temp.expect('le statut annonce le booster des abonnés comme « booster standard » du joueur', (public.{{P}}status() -> 'standard_booster' ->> 'name') = 'OneMore');
select pg_temp.expect('les chances affichées sont celles du booster des abonnés (carte 1 : Super Rare 100 %)', (public.{{P}}draw_odds(:cat) -> 'booster' ->> 'name') = 'OneMore' and (public.{{P}}draw_odds(:cat) #>> '{positions,0,mix,0,id}') = 'super');
set request.jwt.claim.sub = :B;
select pg_temp.expect('... et pour un non abonné, celles du Standard', (public.{{P}}draw_odds(:cat) -> 'booster' ->> 'name') = 'Standard' and (public.{{P}}draw_odds(:cat) #>> '{positions,0,mix,0,id}') = 'common');
set request.jwt.claim.sub = :A;
select pg_temp.expect('en désignant un type précis, les chances sont celles de ce type même pour un abonné', (public.{{P}}draw_odds(:cat, :std) -> 'booster' ->> 'name') = 'Standard');
update public.{{P}}booster_types set enabled = false where id = :onemore;
create temp table ab2 as select public.{{P}}open_booster() as j;
select pg_temp.expect('booster des abonnés désactivé : l''abonné retombe sur le Standard', (select bool_and(c ->> 'base_rarity' = 'common') from ab2, jsonb_array_elements(j -> 'cards') c));
update public.{{P}}booster_types set enabled = true where id = :onemore;
delete from public.{{P}}subscriptions where user_id = :A;
create temp table ab3 as select public.{{P}}open_booster() as j;
select pg_temp.expect('abonnement terminé : de nouveau le Standard', (select bool_and(c ->> 'base_rarity' = 'common') from ab3, jsonb_array_elements(j -> 'cards') c));

\echo '--- statut : ce que voit le joueur'
select pg_temp.sub('active', interval '10 days') as _ \gset
update public.{{P}}subscriptions set cancel_at_period_end = true where user_id = :A;
update public.{{P}}config set value = 1 where key = 'subscription_enabled'; update public.{{P}}config set value = 799 where key = 'subscription_price_cents';
select pg_temp.expect('abonnement : proposé, prix, nom, abonné actif, fin de période, résiliation programmée, avantages',
  (select (s ->> 'enabled', s ->> 'name', s ->> 'price_cents', s ->> 'active', s ->> 'cancel_at_period_end', s ->> 'booster_name', s ->> 'gift_name', s ->> 'gift_quantity') = ('true', 'OneMore', '799', 'true', 'true', 'OneMore', 'Art Rare assuré', '1')
     from (select public.{{P}}status() -> 'subscription' as s) z)
  and (public.{{P}}status() -> 'subscription' ->> 'period_end') is not null);
select pg_temp.expect('le statut donne la couleur du booster des abonnés et l''identifiant du cadeau (pour les afficher)', (public.{{P}}status() -> 'subscription' ->> 'booster_color') = '#7c3aed' and (public.{{P}}status() -> 'subscription' ->> 'gift_id')::int = :gift);
update public.{{P}}config set value = 0 where key = 'subscription_enabled';
select pg_temp.expect('abonnement masqué : le statut l''indique (enabled = false)', (public.{{P}}status() -> 'subscription' ->> 'enabled') = 'false');

\echo '--- nom de l''abonnement (réglage texte de l''admin)'
select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', '  Premium  ') as r \gset t_
select pg_temp.expect('changer le nom (espaces retirés) : le statut le montre', (:'t_r'::jsonb ->> 'ok')::bool and (public.{{P}}status() -> 'subscription' ->> 'name') = 'Premium'
  and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('nom vide ou de plus de 60 caractères : refusé, rien ne change', pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', '   ')$q$) = 'invalid_value'
  and pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'subscription_name', repeat('x', 61))$q$) = 'invalid_value' and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('clé inconnue : introuvable ; mauvais mot de passe : refusé', pg_temp.err($q$select public.{{P}}admin_set_text_config('thomarie', 'nimporte_quoi', 'x')$q$) = 'not_found'
  and (public.{{P}}admin_set_text_config('mauvais', 'subscription_name', 'Pirate') ->> 'error') is not null and (select value from public.{{P}}text_config where key = 'subscription_name') = 'Premium');
select pg_temp.expect('l''admin voit les réglages texte', exists (select 1 from jsonb_array_elements(public.{{P}}admin_data('thomarie') -> 'text_config') t where t ->> 'key' = 'subscription_name' and t ->> 'value' = 'Premium'));

\echo '--- droits : seul le serveur de paiement écrit les abonnements'
select pg_temp.expect('notification Stripe : réservée à la clé de service (ni joueur, ni visiteur)', has_function_privilege('service_role', 'public.{{P}}subscription_sync(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}subscription_sync(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.{{P}}subscription_sync(uuid, text, text, text, timestamptz, timestamptz, boolean, timestamptz)', 'execute'));
select pg_temp.expect('les tables d''abonnement sont fermées aux joueurs et aux visiteurs', not has_table_privilege('authenticated', 'public.{{P}}subscriptions', 'select') and not has_table_privilege('authenticated', 'public.{{P}}subscriptions', 'insert')
  and not has_table_privilege('anon', 'public.{{P}}subscriptions', 'select') and not has_table_privilege('authenticated', 'public.{{P}}subscription_gifts', 'select') and not has_table_privilege('authenticated', 'public.{{P}}text_config', 'update'));
select pg_temp.expect('fonctions internes fermées (est abonné, délai, lecture des textes, semis)', not has_function_privilege('authenticated', 'public.{{P}}is_subscriber(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}regen_minutes_for(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.{{P}}text_cfg(text)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}seed_role_boosters()', 'execute'));
select pg_temp.expect('réglage du nom : réservé aux connectés (puis mot de passe admin), pas aux visiteurs', has_function_privilege('authenticated', 'public.{{P}}admin_set_text_config(text, text, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_set_text_config(text, text, text)', 'execute'));

-- nettoyage
delete from public.{{P}}subscriptions; delete from public.{{P}}subscription_gifts; delete from public.{{P}}cards;
delete from public.{{P}}categories where name = 'Abo Test';
update public.{{P}}categories set closed = false;
delete from public.{{P}}booster_type_slots where booster_type_id in (select id from bt_backup);
insert into public.{{P}}booster_type_slots select * from sl_backup;
update public.{{P}}booster_types b set enabled = o.enabled from bt_backup o where o.id = b.id;
delete from public.{{P}}user_boosters; insert into public.{{P}}user_boosters select * from ub_backup;
update public.{{P}}config c set value = b.value from cf_backup b where b.key = c.key;
update public.{{P}}text_config t set value = b.value from tc_backup b where b.key = t.key;
update public.{{P}}profiles set boosters = 0, bonus_boosters = 0 where id in (:A, :B);
