#!/usr/bin/env bash
# Teste le SQL de chaque environnement sur une base PostgreSQL jetable (rien n'est envoyé à Supabase).
#   tests/run-sql.sh [prod|preprod|both]      (défaut : both)
# Prérequis : PostgreSQL installé (apt-get install -y postgresql). Le script démarre son propre serveur temporaire.
#   KEEP=1 conserve la base temporaire ; PORT=5599 change le port.
# Chaque scénario de tests/sql/*.template.sql est rejoué pour chaque environnement ; il échoue à la première erreur SQL.
# Contrôles ajoutés : le schéma s'applique deux fois sans erreur, et la prod et la préprod restent isolées.
set -uo pipefail
cd "$(dirname "$0")/.."
WHICH="${1:-both}"
PORT="${PORT:-5598}"

PGBIN=""
for d in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -rV); do PGBIN="$d"; break; done
if [ -z "$PGBIN" ] && command -v initdb >/dev/null; then PGBIN="$(dirname "$(command -v initdb)")"; fi
[ -n "$PGBIN" ] || { echo "PostgreSQL introuvable : installe-le (apt-get install -y postgresql) puis relance." >&2; exit 2; }

DIR="$(mktemp -d /tmp/o1o-pg-XXXXXX)"
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DIR"
  AS() { su postgres -c "$1"; }
else
  AS() { bash -c "$1"; }
fi
cleanup() { AS "$PGBIN/pg_ctl -D $DIR/data stop -m immediate >/dev/null 2>&1" || true; [ "${KEEP:-0}" = "1" ] || rm -rf "$DIR"; }
trap cleanup EXIT

AS "$PGBIN/initdb -D $DIR/data -A trust >/dev/null" || exit 2
AS "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null" || { cat "$DIR/log"; exit 2; }
PSQL="$PGBIN/psql -h $DIR -p $PORT -X -q -v ON_ERROR_STOP=1"
sql() { AS "$PSQL -d $1 -c \"$2\"" 2>&1; }
sqlf() { AS "$PSQL -d $1 -f $2" 2>&1; }
val() { AS "$PSQL -d $1 -At -c \"$2\"" 2>&1; }

# --- Environnement Supabase simulé : rôles, schéma auth, droits par défaut (tout accordé, comme sur Supabase)
sql postgres "create database o1o_test" >/dev/null
for r in anon authenticated service_role; do sql postgres "do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end \\\$\\\$" >/dev/null; done
cat > "$DIR/mock.sql" <<'SQL'
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
insert into auth.users values
 ('11111111-1111-1111-1111-111111111111','a@example.com','{"username":"Tom"}'),
 ('22222222-2222-2222-2222-222222222222','b@example.com','{"username":"Bea"}'),
 ('33333333-3333-3333-3333-333333333333','c@example.com','{}');
SQL
chmod 644 "$DIR/mock.sql"
sqlf o1o_test "$DIR/mock.sql" >/dev/null || { echo "Initialisation de la base de test impossible"; exit 2; }

node scripts/build-schema.mjs --check || exit 1

ENVLIST="prod preprod"; [ "$WHICH" = "prod" ] && ENVLIST="prod"; [ "$WHICH" = "preprod" ] && ENVLIST="preprod"
declare -A PREFIX=( [prod]=o1ocards_ [preprod]=pp_o1ocards_ )
FAIL=0
step() { printf '%-62s' "$1"; }
ok() { echo "OK"; }
ko() { echo "ÉCHEC"; FAIL=$((FAIL+1)); [ -n "${1:-}" ] && echo "$1" | head -12 | sed 's/^/    /'; }

# --- 1. Les deux schémas dans la MÊME base, appliqués deux fois (idempotence)
for e in prod preprod; do
  for n in 1 2; do
    step "schéma $e (application $n)"; out="$(sqlf o1o_test "$PWD/supabase/generated/schema.$e.sql" | grep -v NOTICE)"
    if echo "$out" | grep -qi "error"; then ko "$out"; else ok; fi
  done
done
step "aucune table hors préfixe dans le schéma public"
extra="$(val o1o_test "select string_agg(relname, ', ') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not like 'o1ocards\\_%' and c.relname not like 'pp\\_o1ocards\\_%'")"
[ -z "$extra" ] && ok || ko "tables inattendues : $extra"

step "boutique : visible par défaut en préprod, masquée en prod"
shop="$(val o1o_test "select (select value from pp_o1ocards_config where key='shop_enabled') || '/' || (select value from o1ocards_config where key='shop_enabled')")"
[ "$shop" = "1/0" ] && ok || ko "attendu 1/0 (préprod/prod), obtenu $shop"

snapshot() { # empreinte des données d'un environnement
  val o1o_test "select md5(coalesce((select string_agg(x::text, '|' order by x::text) from ${1}cards x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from ${1}profiles x), '') || coalesce((select string_agg(x::text, '|' order by x::text) from ${1}listings x), ''))"
}

# --- 2. Scénarios, un environnement après l'autre, avec contrôle d'isolation
for e in $ENVLIST; do
  p="${PREFIX[$e]}"; other="o1ocards_"; [ "$e" = "prod" ] && other="pp_o1ocards_"
  before="$(snapshot "$other")"
  for f in tests/sql/*.template.sql; do
    name="$(basename "$f" .template.sql)"
    rendered="$DIR/$e-$name.sql"; sed "s/{{P}}/$p/g" "$f" > "$rendered"; chmod 644 "$rendered"
    step "[$e] $name"; out="$(sqlf o1o_test "$rendered")"; rc=$?
    mkdir -p tests/.out; echo "$out" > "tests/.out/$e-$name.txt"
    if [ $rc -ne 0 ] || echo "$out" | grep -q "^psql:.*ERROR"; then ko "$(echo "$out" | grep -i "error" | head -3)"; else ok; fi
  done
  step "[$e] l'autre environnement n'a pas bougé (isolation)"
  after="$(snapshot "$other")"; [ "$before" = "$after" ] && ok || ko "les données de $other ont changé pendant les tests de $e"
done

echo
if [ $FAIL -eq 0 ]; then echo "Tous les contrôles SQL sont passés."; else echo "$FAIL contrôle(s) en échec (détails dans tests/.out/)."; fi
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
