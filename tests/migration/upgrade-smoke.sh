#!/usr/bin/env bash
# Répétition générale d'une mise à jour : applique le schéma de production EN LIGNE (dernière étiquette) avec quelques joueurs, cartes et offres en cours, puis le schéma à livrer deux fois ;
# vérifie qu'aucune erreur n'apparaît et que les données existantes sont intactes (offres en attente, prix de revente, pas de preuve d'acceptation à tort). Lance-le en root.
#   PORT=5640 bash tests/migration/upgrade-smoke.sh [étiquette-ou-commit-de-la-prod]
set -uo pipefail
cd "$(dirname "$0")/../.."
OLD_REF="${1:-$(git tag -l 'release-*' | sort | tail -1)}"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -rV | head -1); D=$(mktemp -d /tmp/o1o-smoke-XXXXXX); PORT="${PORT:-5640}"; chown postgres "$D"
AS() { su postgres -c "$1"; }
trap 'AS "$PGBIN/pg_ctl -D $D/data stop -m immediate >/dev/null 2>&1"; rm -rf "$D"' EXIT
git show "$OLD_REF:supabase/generated/schema.prod.sql" > "$D/old.sql" || { echo "schéma introuvable pour $OLD_REF"; exit 2; }
cp supabase/generated/schema.prod.sql "$D/new.sql"
cat > "$D/mock.sql" <<'SQL'
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@example.com','{"username":"Tom"}'),('22222222-2222-2222-2222-222222222222','b@example.com','{"username":"Bea"}');
SQL
cat > "$D/data.sql" <<'SQL'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select o1ocards_status() is not null as a;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select o1ocards_status() is not null as b;
insert into o1ocards_categories (name, position, series_count, color, color2, text_color, enabled) values ('Smoke', 1, 100, '#fff', '#ccc', '#000', true);
insert into o1ocards_types (category_id, name, image, position, secret) select id, 'S1', 'x', 1, false from o1ocards_categories where name = 'Smoke';
insert into o1ocards_type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) select t.id, 'common', 20, 0, 'simple' from o1ocards_types t where t.name = 'S1';
insert into o1ocards_cards (type_id, base_rarity, series, number, owner_id) select t.id, 'common', 20, g, '11111111-1111-1111-1111-111111111111' from o1ocards_types t, generate_series(1, 3) g where t.name = 'S1';
update o1ocards_profiles set coins = 100 where id = '22222222-2222-2222-2222-222222222222';
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select o1ocards_make_offer(t.id, 'common', 20, 1, 15) from o1ocards_types t where t.name = 'S1';
select o1ocards_make_offer(t.id, 'common', 20, 2, 25) from o1ocards_types t where t.name = 'S1';
SQL
cat > "$D/check.sql" <<'SQL'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo === offres en attente conservees : 2, sans auteur enregistre (ancien format = proposees par lacheteur), aucun echange
select count(*) as offres_en_attente, count(*) filter (where proposed_by is null) as sans_auteur_enregistre, max(rounds) as echanges from o1ocards_offers where status = 'pending';
\echo === revente : aucun prix propre (prix general), le statut les annonce tous
select (select count(*) from o1ocards_rarities where sell_price is not null) as raretes_avec_prix_propre, (select count(*) from jsonb_object_keys(o1ocards_status() -> 'sell_prices')) as prix_annonces;
\echo === conditions dutilisation : version 1, personne ne les a encore acceptees
select (select value from o1ocards_config where key = 'cgu_version') as version, (select count(*) from o1ocards_terms_acceptances) as acceptations, (o1ocards_status() ->> 'cgu_accepted') as acceptee_par_tom;
\echo === le proprietaire voit les 2 offres a son attention (anciennes offres comprises)
select count(*) as offres_recues, bool_and(waiting_on_me) as toutes_a_mon_attention, bool_and(not proposed_by_me) as aucune_proposee_par_moi from o1ocards_my_offers();
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo === lacheteur voit ses 2 offres comme siennes, en attente de la reponse du proprietaire
select count(*) as mes_offres, bool_and(proposed_by_me) as toutes_proposees_par_moi, bool_and(not waiting_on_me) as aucune_attente_de_ma_part from o1ocards_my_offers();
\echo === le proprietaire peut contre-proposer sur une ancienne offre, puis lacheteur accepter
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select o1ocards_counter_offer((select min(id) from o1ocards_offers where status = 'pending'), 40) is not null as contre_offre_envoyee;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select o1ocards_respond_offer((select min(id) from o1ocards_offers where status in ('pending')), true) is not null as acceptee_par_lacheteur;
select (select status from o1ocards_offers order by id limit 1) as statut, (select amount from o1ocards_offers order by id limit 1) as prix_final, (select coins from o1ocards_profiles where id = '22222222-2222-2222-2222-222222222222') as pieces_acheteur_apres;
SQL
chmod 644 "$D"/*.sql
AS "$PGBIN/initdb -D $D/data -A trust >/dev/null" && AS "$PGBIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
P="$PGBIN/psql -h $D -p $PORT -X -q"
AS "$P -d postgres -c 'create database t'"; for r in anon authenticated service_role; do AS "$P -d postgres -c 'create role $r nologin'" 2>/dev/null; done
AS "$P -v ON_ERROR_STOP=1 -d t -f $D/mock.sql" > /dev/null
echo "schéma EN LIGNE ($OLD_REF) : $(AS "$P -d t -f $D/old.sql" 2>&1 | grep -ci error) erreur(s)"
AS "$P -d t -f $D/data.sql" 2>&1 | grep -i "error" | head -3
e1=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error); e2=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error)
echo "schéma à livrer : 1re application $e1 erreur(s), relance $e2 erreur(s)"
AS "$P -d t -f $D/check.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$"
[ "$e1" = 0 ] && [ "$e2" = 0 ]
