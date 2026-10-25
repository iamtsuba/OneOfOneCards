#!/usr/bin/env bash
# Répétition de la SUPPRESSION DU PACK DORÉ : applique le schéma de production EN LIGNE (dernière étiquette), crée des joueurs avec des packs dorés non ouverts,
# puis applique le schéma à livrer : (1) sans booster de récompense choisi, les packs restent comptés ; (2) une fois le booster choisi, ils deviennent des boosters
# sans collection et la colonne disparaît. Vérifie aussi que les objets du pack doré n'existent plus. Lance-le en root (PostgreSQL + git).
#   bash tests/migration/golden-removal.sh [étiquette-ou-commit-de-la-prod]
set -uo pipefail
cd "$(dirname "$0")/../.."
OLD_REF="${1:-$(git tag -l 'release-*' | sort | tail -1)}"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -rV | head -1); D=$(mktemp -d /tmp/o1o-gold-XXXXXX); PORT="${PORT:-5619}"; chown postgres "$D"
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
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@example.com','{"username":"Tom"}'),('22222222-2222-2222-2222-222222222222','b@example.com','{"username":"Bea"}'),('33333333-3333-3333-3333-333333333333','c@example.com','{"username":"Cleo"}');
SQL
cat > "$D/data.sql" <<'SQL'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select o1ocards_status() is not null as a;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select o1ocards_status() is not null as b;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; select o1ocards_status() is not null as c;
insert into o1ocards_booster_types (name, cards, color, price_coins, enabled, position, role, glow) values ('Premium', 5, '#9ca3af', 150, true, 9, null, 'none');
update o1ocards_profiles set golden_packs = 2 where id = '11111111-1111-1111-1111-111111111111';
update o1ocards_profiles set golden_packs = 1 where id = '22222222-2222-2222-2222-222222222222';
select count(*) as golden_contents_avant from o1ocards_golden_contents;
select value as reward_avant from o1ocards_config where key = 'card_reward_booster';
SQL
cat > "$D/check1.sql" <<'SQL'
\echo === 1. SANS booster de récompense choisi : les packs dorés ne sont pas perdus
select (select count(*) from information_schema.columns where table_name = 'o1ocards_profiles' and column_name = 'golden_packs') as colonne_golden_packs_encore_la;
select username, golden_packs from o1ocards_profiles order by username;
select count(*) as boosters_en_stock from o1ocards_user_boosters;
SQL
cat > "$D/choose.sql" <<'SQL'
update o1ocards_config set value = (select id from o1ocards_booster_types where name = 'Premium') where key = 'card_reward_booster';
SQL
cat > "$D/check2.sql" <<'SQL'
\echo === 2. APRÈS avoir choisi le Premium : packs dorés convertis, colonne supprimée
select (select count(*) from information_schema.columns where table_name = 'o1ocards_profiles' and column_name = 'golden_packs') as colonne_golden_packs_encore_la;
select p.username, ub.quantity as premium_en_stock from o1ocards_user_boosters ub join o1ocards_profiles p on p.id = ub.user_id join o1ocards_booster_types bt on bt.id = ub.booster_type_id where bt.name = 'Premium' order by p.username;
\echo === 3. objets du pack doré supprimés (attendu : 0 partout)
select (select count(*) from information_schema.tables where table_name in ('o1ocards_series_rewards', 'o1ocards_golden_contents')) as tables,
       (select count(*) from pg_proc where proname in ('o1ocards_open_golden_pack', 'o1ocards_draw_golden', 'o1ocards_draw_rarity', 'o1ocards_ack_rewards', 'o1ocards_cards_reward', 'o1ocards_series_rewards_backfill')) as fonctions,
       (select count(*) from pg_trigger where tgname = 'o1ocards_cards_reward_trg') as declencheurs,
       (select count(*) from o1ocards_config where key in ('series_reward_min_size', 'golden_unique_chance')) as reglages;
\echo === 4. le jeu fonctionne : statut sans les clés du pack doré, hasard = Gold
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select not (o1ocards_status() ? 'golden_packs') and not (o1ocards_status() ? 'unseen_rewards') as statut_sans_pack_dore, (o1ocards_status() -> 'standard_booster' ? 'position') as position_dans_le_statut;
select (o1ocards_draw_odds() -> 'gold') is not null as chances_gold, (select description like '%booster Gold%' from o1ocards_config where key = 'golden_booster_chance') as reglage_decrit_le_gold;
SQL
chmod 644 "$D"/*.sql
AS "$PGBIN/initdb -D $D/data -A trust >/dev/null" && AS "$PGBIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
P="$PGBIN/psql -h $D -p $PORT -X -q"
AS "$P -d postgres -c 'create database t'"; for r in anon authenticated service_role; do AS "$P -d postgres -c 'create role $r nologin'" 2>/dev/null; done
AS "$P -v ON_ERROR_STOP=1 -d t -f $D/mock.sql" > /dev/null
echo "schéma EN LIGNE ($OLD_REF) : $(AS "$P -d t -f $D/old.sql" 2>&1 | grep -ci error) erreur(s)"
AS "$P -d t -f $D/data.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$\|?column?"
e1=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error); echo "schéma à livrer (sans booster de récompense) : $e1 erreur(s)"
AS "$P -d t -f $D/check1.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$\|?column?"
AS "$P -d t -f $D/choose.sql" >/dev/null 2>&1
e2=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error); e3=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error)
echo "schéma à livrer (booster choisi) : 1re application $e2 erreur(s), relance $e3 erreur(s)"
AS "$P -d t -f $D/check2.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$\|?column?"
[ "$e1" = 0 ] && [ "$e2" = 0 ] && [ "$e3" = 0 ]
