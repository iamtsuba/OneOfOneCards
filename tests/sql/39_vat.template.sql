-- TVA affichée en plus des prix en euros (pass Pro, packs de boosters) : réglage, plafonds, descriptions.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
create temp table cfg_backup as select * from public.{{P}}config where key in ('vat_percent', 'subscription_price_cents', 'stripe_pack_price_cents');
create or replace function pg_temp.vat() returns numeric language sql as $$ select (public.{{P}}status() ->> 'vat_percent')::numeric $$;

select pg_temp.expect('TVA de 20 % par défaut', (select value from cfg_backup where key = 'vat_percent') = 20);
update public.{{P}}config set value = 20 where key = 'vat_percent';
select pg_temp.expect('le statut annonce la TVA (20) à côté des prix en euros (pack et pass)', pg_temp.vat() = 20 and (public.{{P}}status() ->> 'pack_price_cents') is not null and (public.{{P}}status() -> 'subscription' ->> 'price_cents') is not null);
update public.{{P}}config set value = 5.5 where key = 'vat_percent';
select pg_temp.expect('un taux avec décimale (5,5 %) est conservé', pg_temp.vat() = 5.5);
update public.{{P}}config set value = 0 where key = 'vat_percent';
select pg_temp.expect('0 : aucune TVA à afficher', pg_temp.vat() = 0);
update public.{{P}}config set value = -3 where key = 'vat_percent';
select pg_temp.expect('taux négatif : traité comme 0', pg_temp.vat() = 0);
update public.{{P}}config set value = 150 where key = 'vat_percent';
select pg_temp.expect('taux absurde (150) : plafonné à 100', pg_temp.vat() = 100);
update public.{{P}}config set value = 20 where key = 'vat_percent';
select pg_temp.expect('les prix en euros se règlent HORS TVA : les descriptions le disent et renvoient au réglage de TVA', (select bool_and(description ~* 'hors tva' and description ~ 'vat_percent') from public.{{P}}config where key in ('subscription_price_cents', 'stripe_pack_price_cents')));
select pg_temp.expect('le réglage de TVA se décrit lui-même (Stripe l''ajoute au paiement, 0 = aucune)', (select description ~* 'tva' and description ~* 'stripe' and description ~ '0 = aucune' from public.{{P}}config where key = 'vat_percent'));
select pg_temp.expect('le prix d''un pack et du pass restent les montants hors taxes enregistrés (le serveur n''y ajoute rien)', (public.{{P}}status() ->> 'pack_price_cents')::int = (select value::int from public.{{P}}config where key = 'stripe_pack_price_cents') and (public.{{P}}status() -> 'subscription' ->> 'price_cents')::int = (select value::int from public.{{P}}config where key = 'subscription_price_cents'));
update public.{{P}}config c set value = b.value from cfg_backup b where c.key = b.key;
