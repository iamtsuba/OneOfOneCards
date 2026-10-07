-- =====================================================================
-- Migration 001 (PRODUCTION uniquement) : renomme tout ce qui commence par opennumber_ en o1ocards_
-- Tables, index, contraintes, séquences et règles de sécurité sont RENOMMÉS : aucune donnée n'est copiée ni perdue.
-- Les anciennes fonctions et déclencheurs sont supprimés : generated/schema.prod.sql les recrée sous le nouveau préfixe.
--
-- À exécuter UNE SEULE FOIS, dans cet ordre :
--   1. cette migration    2. supabase/generated/schema.prod.sql
-- Tout est atomique : en cas d'erreur, rien n'est modifié. Sûr à relancer (elle détecte qu'elle a déjà été faite).
--
-- Attention : entre l'étape 1 et le déploiement du nouveau site, l'ancienne version de l'application ne fonctionne plus.
-- =====================================================================
begin;

do $$
declare
  r     record;
  v_old text := 'opennumber_';
  v_new text := 'o1ocards_';
begin
  if to_regclass('public.o1ocards_cards') is not null and to_regclass('public.opennumber_cards') is null then
    raise notice 'Migration déjà faite : rien à renommer.';
    return;
  end if;
  if to_regclass('public.opennumber_cards') is null then
    raise notice 'Aucune table opennumber_* : base vierge, rien à migrer (exécute simplement schema.prod.sql).';
    return;
  end if;
  if to_regclass('public.o1ocards_cards') is not null then
    raise exception 'Les deux jeux de tables (opennumber_* et o1ocards_*) existent : vérifie la base avant de continuer.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'opennumber_cards' and column_name = 'type_id') then
    raise exception 'Structure trop ancienne (cartes sans type) : exécute d''abord la dernière version de l''ancien schéma, puis relance cette migration.';
  end if;

  -- 1. Déclencheurs (ils pointent vers les anciennes fonctions)
  for r in
    select t.tgname, c.relname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname like 'opennumber\_%'
  loop
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);
  end loop;

  -- 2. Fonctions (recréées par schema.prod.sql sous le nouveau préfixe)
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'opennumber\_%'
  loop
    execute 'drop function ' || r.sig;
  end loop;

  -- 3. Tables
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'opennumber\_%'
    order by c.relname
  loop
    execute format('alter table public.%I rename to %I', r.relname, v_new || substr(r.relname, length(v_old) + 1));
  end loop;

  -- 4. Contraintes (clés primaires et uniques : leur index est renommé avec elles)
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname like 'o1ocards\_%' and con.conname like 'opennumber\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname, v_new || substr(r.conname, length(v_old) + 1));
  end loop;

  -- 5. Index restants
  for r in
    select indexname from pg_indexes where schemaname = 'public' and indexname like 'opennumber\_%'
  loop
    execute format('alter index public.%I rename to %I', r.indexname, v_new || substr(r.indexname, length(v_old) + 1));
  end loop;

  -- 6. Séquences (colonnes auto-incrémentées)
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'opennumber\_%'
  loop
    execute format('alter sequence public.%I rename to %I', r.relname, v_new || substr(r.relname, length(v_old) + 1));
  end loop;

  -- 7. Règles de sécurité (RLS)
  for r in
    select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'opennumber\_%'
  loop
    execute format('alter policy %I on public.%I rename to %I', r.policyname, r.tablename, v_new || substr(r.policyname, length(v_old) + 1));
  end loop;

  -- 8. Textes qui citent l'ancien nom, et nouvelle version des conditions de vente (le nom du service change)
  update public.o1ocards_config set description = replace(description, 'opennumber_', 'o1ocards_') where description like '%opennumber\_%';
  update public.o1ocards_config set value = 3 where key = 'cgv_version' and value < 3;

  raise notice 'Migration terminée : tables, index, contraintes, séquences et règles renommés en %*.', v_new;
end $$;

commit;
