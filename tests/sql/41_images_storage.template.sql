-- Images hors de la base : empreinte du catalogue (cache du navigateur), changement d'image par l'admin, stockage de fichiers réservé à l'administrateur.
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as pa;
set request.jwt.claim.sub = :B; select public.{{P}}status() is not null as pb;
set request.jwt.claim.sub = :A;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
select case when left('{{P}}', 3) = 'pp_' then 'pp' else 'prod' end as fo \gset

\echo '--- empreinte du catalogue'
select public.{{P}}catalog_version() as v0 \gset
select pg_temp.expect('l''empreinte est stable (deux appels, même valeur) : 32 caractères hexadécimaux', public.{{P}}catalog_version() = :'v0' and :'v0' ~ '^[0-9a-f]{32}$');
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Version Param', 99, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
select public.{{P}}catalog_version() as v1 \gset
select pg_temp.expect('ajouter une collection change l''empreinte', :'v1' <> :'v0');
insert into public.{{P}}types (category_id, name, image, position, secret) values (:cat, 'V1', '🐱', 1, false) returning id as t1 \gset
select public.{{P}}catalog_version() as v2 \gset
select pg_temp.expect('ajouter une carte change l''empreinte', :'v2' <> :'v1');
update public.{{P}}types set image = 'https://exemple.test/a.webp' where id = :t1;
select public.{{P}}catalog_version() as v3 \gset
select pg_temp.expect('changer l''image d''une carte change l''empreinte', :'v3' <> :'v2');
update public.{{P}}types set image = '🐱' where id = :t1;
select pg_temp.expect('revenir à l''état d''avant redonne exactement la même empreinte (déterministe)', public.{{P}}catalog_version() = :'v2');
update public.{{P}}types set name = 'V1 renommée' where id = :t1;
select pg_temp.expect('renommer une carte change l''empreinte', public.{{P}}catalog_version() <> :'v2');
update public.{{P}}types set name = 'V1' where id = :t1;
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values (:t1, 'common', 10, 0, 'simple');
select public.{{P}}catalog_version() as v4 \gset
select pg_temp.expect('ajouter une rareté à une carte change l''empreinte', :'v4' <> :'v2');
update public.{{P}}categories set name = 'Version Param 2' where id = :cat;
select pg_temp.expect('renommer une collection change l''empreinte', public.{{P}}catalog_version() <> :'v4');
update public.{{P}}categories set name = 'Version Param' where id = :cat;
select pg_temp.expect('empreinte lisible sans être connecté (anonyme) et par un joueur', has_function_privilege('anon', 'public.{{P}}catalog_version()', 'execute') and has_function_privilege('authenticated', 'public.{{P}}catalog_version()', 'execute'));
set role anon;
select public.{{P}}catalog_version() as va \gset
reset role;
select pg_temp.expect('un visiteur anonyme obtient la même empreinte que l''admin (mêmes données lues)', :'va' = :'v4');

\echo '--- changement d''image par l''admin'
select public.{{P}}admin_set_image('thomarie', 'type', :t1, 'https://exemple.test/stock/a.webp') ->> 'ok' as okt \gset
select public.{{P}}admin_set_image('thomarie', 'category', :cat, 'https://exemple.test/stock/c.webp') ->> 'ok' as okc \gset
select pg_temp.expect('image d''une carte et d''une collection remplacées par une adresse https', :'okt' = 'true' and :'okc' = 'true' and (select image from public.{{P}}types where id = :t1) = 'https://exemple.test/stock/a.webp' and (select image from public.{{P}}categories where id = :cat) = 'https://exemple.test/stock/c.webp');
select pg_temp.expect('seule une adresse https est acceptée (invalid_image) : pas de http, d''image intégrée, de texte vide ou nul, ni d''adresse de plus de 500 caractères', pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', ' || :t1 || ', ''http://exemple.test/a.webp'')') like '%invalid_image%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', ' || :t1 || ', ''data:image/webp;base64,AAAA'')') like '%invalid_image%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', ' || :t1 || ', null)') like '%invalid_image%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', ' || :t1 || ', '''')') like '%invalid_image%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', ' || :t1 || ', ''https://' || repeat('a', 500) || ''')') like '%invalid_image%' and (select image from public.{{P}}types where id = :t1) = 'https://exemple.test/stock/a.webp');
select pg_temp.expect('type d''élément inconnu (invalid_kind) ; élément absent (not_found)', pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''booster'', 1, ''https://exemple.test/a.webp'')') like '%invalid_kind%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''type'', 99999999, ''https://exemple.test/a.webp'')') like '%not_found%' and pg_temp.err('select public.{{P}}admin_set_image(''thomarie'', ''category'', 99999999, ''https://exemple.test/a.webp'')') like '%not_found%');
select pg_temp.expect('mauvais mot de passe : refusé, rien ne change', (public.{{P}}admin_set_image('faux', 'type', :t1, 'https://exemple.test/zz.webp') ->> 'error') = 'admin_denied' and (select image from public.{{P}}types where id = :t1) = 'https://exemple.test/stock/a.webp');
set request.jwt.claim.sub = :B;
select pg_temp.expect('un autre compte, même avec le bon mot de passe, est refusé (le mot de passe est lié au compte admin)', (public.{{P}}admin_set_image('thomarie', 'type', :t1, 'https://exemple.test/zz.webp') ->> 'error') = 'admin_denied' and not public.{{P}}is_admin_user());
set request.jwt.claim.sub = :A;
select pg_temp.expect('is_admin_user : vrai pour le compte administrateur, faux pour les autres ; fermé aux anonymes', public.{{P}}is_admin_user() and has_function_privilege('authenticated', 'public.{{P}}is_admin_user()', 'execute') and not has_function_privilege('anon', 'public.{{P}}is_admin_user()', 'execute') and has_function_privilege('authenticated', 'public.{{P}}admin_set_image(text, text, int, text)', 'execute') and not has_function_privilege('anon', 'public.{{P}}admin_set_image(text, text, int, text)', 'execute'));

\echo '--- stockage de fichiers (schéma storage simulé)'
select pg_temp.expect('sans schéma « storage » (tests, autre base), la préparation du stockage ne fait rien et ne plante pas', pg_temp.err('select public.{{P}}ensure_storage()') = '');
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:greatest(coalesce(array_length(string_to_array(name, '/'), 1), 1) - 1, 0)] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon; grant insert, select on storage.objects to authenticated, anon;
select public.{{P}}ensure_storage();
select pg_temp.expect('le bucket « o1ocards-images » est créé : public (lecture pour tous), 1 Mo au plus, images web seulement (pas de SVG)', (select (public, file_size_limit, allowed_mime_types) from storage.buckets where id = 'o1ocards-images') = (true, 1048576::bigint, array['image/webp', 'image/png', 'image/jpeg', 'image/gif']::text[]));
select pg_temp.expect('une seule politique d''envoi pour cet environnement, réservée aux joueurs connectés', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = '{{P}}images_insert' and cmd = 'INSERT' and roles = '{authenticated}') = 1);
select public.{{P}}ensure_storage();
select pg_temp.expect('relancer la préparation ne duplique rien (un seul bucket, une seule politique)', (select count(*) from storage.buckets) = 1 and (select count(*) from pg_policies where schemaname = 'storage' and policyname = '{{P}}images_insert') = 1);
select set_config('o1o.fo', :'fo', false);
set request.jwt.claim.sub = :A;
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('o1ocards-images', current_setting('o1o.fo') || '/types/aaa.webp');
exception when others then raise exception 'ATTENDU : l''administrateur peut envoyer une image dans le dossier de son environnement (%)', sqlerrm; end $$;
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('o1ocards-images', case when current_setting('o1o.fo') = 'pp' then 'prod' else 'pp' end || '/types/bbb.webp'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'ATTENDU : le dossier de l''autre environnement est interdit'; end if;
end $$;
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('o1ocards-images', 'ccc.webp'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'ATTENDU : un fichier à la racine (sans dossier) est interdit'; end if;
end $$;
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('autre-bucket', current_setting('o1o.fo') || '/types/ddd.webp'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'ATTENDU : un autre bucket n''est pas autorisé'; end if;
end $$;
set request.jwt.claim.sub = :B;
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('o1ocards-images', current_setting('o1o.fo') || '/types/eee.webp'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'ATTENDU : un joueur ordinaire ne peut pas envoyer d''image'; end if;
end $$;
reset role;
set role anon;
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('o1ocards-images', current_setting('o1o.fo') || '/types/fff.webp'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'ATTENDU : un visiteur anonyme ne peut pas envoyer d''image'; end if;
end $$;
reset role;
select pg_temp.expect('seul le fichier de l''administrateur dans son dossier est enregistré', (select count(*) from storage.objects) = 1 and (select name from storage.objects) = :'fo' || '/types/aaa.webp');
-- nettoyage
drop schema storage cascade;
select pg_temp.expect('après retrait du schéma simulé, la préparation ne fait de nouveau rien', pg_temp.err('select public.{{P}}ensure_storage()') = '');
delete from public.{{P}}types where id = :t1; delete from public.{{P}}categories where id = :cat;
select pg_temp.expect('empreinte revenue à sa valeur d''origine après nettoyage', public.{{P}}catalog_version() = :'v0');
