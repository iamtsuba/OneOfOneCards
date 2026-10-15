#!/usr/bin/env bash
# Répétition de la mise à jour de la PRODUCTION : applique sur une base de test le schéma de production EN LIGNE (par défaut l'étiquette
# de la dernière livraison), charge des données réalistes, applique le schéma à livrer (supabase/generated/schema.prod.sql) deux fois,
# puis compare avant / après (raretés, numéros visibles, piles, liens, compteurs) et vérifie que le jeu fonctionne.
# À lancer avant chaque livraison qui change la structure de la base. Demande PostgreSQL et git ; lance-le en root (su postgres).
#   bash tests/migration/prod-upgrade.sh [étiquette-ou-commit-de-la-prod]
set -uo pipefail
cd "$(dirname "$0")/../.."
OLD_REF="${1:-$(git tag -l 'release-*' | sort | tail -1)}"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -rV | head -1); D=$(mktemp -d /tmp/o1o-upg-XXXXXX); PORT="${PORT:-5618}"; chown postgres "$D"
AS() { su postgres -c "$1"; }
trap 'AS "$PGBIN/pg_ctl -D $D/data stop -m immediate >/dev/null 2>&1"; rm -rf "$D"' EXIT
git show "$OLD_REF:supabase/generated/schema.prod.sql" > "$D/old.sql" || { echo "schéma introuvable pour $OLD_REF"; exit 2; }
cp supabase/generated/schema.prod.sql "$D/new.sql"; cp tests/migration/prod-data.sql tests/migration/prod-check.sql tests/migration/prod-after.sql "$D/"
cat > "$D/mock.sql" <<'SQL'
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@example.com','{"username":"Tom"}'),('22222222-2222-2222-2222-222222222222','b@example.com','{"username":"Bea"}'),('33333333-3333-3333-3333-333333333333','c@example.com','{"username":"Cleo"}');
SQL
chmod 644 "$D"/*.sql
AS "$PGBIN/initdb -D $D/data -A trust >/dev/null" && AS "$PGBIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
P="$PGBIN/psql -h $D -p $PORT -X -q"
AS "$P -d postgres -c 'create database t'"; for r in anon authenticated service_role; do AS "$P -d postgres -c 'create role $r nologin'" 2>/dev/null; done
AS "$P -v ON_ERROR_STOP=1 -d t -f $D/mock.sql" > /dev/null
echo "schéma EN LIGNE ($OLD_REF) : $(AS "$P -d t -f $D/old.sql" 2>&1 | grep -ci error) erreur(s)"
echo "données de production : $(AS "$P -d t -f $D/prod-data.sql" 2>&1 | grep -i error | grep -vc own_card) erreur(s) inattendue(s)"
e1=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error); e2=$(AS "$P -d t -f $D/new.sql" 2>&1 | grep -ci error)
echo "schéma à livrer : 1re application $e1 erreur(s), relance $e2 erreur(s)"
AS "$P -d t -f $D/prod-check.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$\|?column?\|unterminated"
echo "=== le jeu après migration"; AS "$P -d t -f $D/prod-after.sql" 2>&1 | grep -v "^$\|row)\|rows)\|^-\+$\|?column?\|unterminated"
[ "$e1" = 0 ] && [ "$e2" = 0 ]
