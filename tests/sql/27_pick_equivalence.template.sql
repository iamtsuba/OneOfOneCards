-- Pioche rapide = pioche d'origine (mêmes probabilités) : comparaison statistique sur des cas variés, validité de chaque résultat, repli de l'ancienne pioche.
\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on
create or replace function pg_temp.expect(n text, c boolean) returns text language plpgsql as $$ begin if c is not true then raise exception 'ATTENDU : %', n; end if; return 'ok : ' || n; end $$;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;
create temp table bt_backup as select * from public.{{P}}booster_types;
create temp table sl_backup as select * from public.{{P}}booster_type_slots;
delete from public.{{P}}admin_log; delete from public.{{P}}secrets where key in ('admin_password_hash', 'admin_user_id');
select public.{{P}}admin_set_password('thomarie');
select exists (select 1 from public.{{P}}rarities where id = 'artrare') as had_art \gset
insert into public.{{P}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color) values ('artrare', 'Art Rare', 'range', 50, 4, '#7c3aed', '#4c1d95', '#fff') on conflict (id) do nothing;
select id as uniq from public.{{P}}rarities where kind = 'unique' limit 1 \gset
delete from public.{{P}}cards where owner_id = :A;
update public.{{P}}categories set closed = true;
insert into public.{{P}}categories (name, position, series_count, color, color2, text_color, enabled) values ('Pick Param', 1, 100, '#fff', '#ccc', '#000', true) returning id as cat \gset
insert into public.{{P}}types (category_id, name, image, position, secret) select :cat, 'P' || g, '🐱', g, false from generate_series(1, 4) g;
select min(id) as p1 from public.{{P}}types where category_id = :cat \gset
select :p1 + 1 as p2, :p1 + 2 as p3, :p1 + 3 as p4 \gset
insert into public.{{P}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style) values
  (:p1, 'common', 6, 0, 'simple'), (:p1, 'rare', 8, 8, 'simple'), (:p1, 'artrare', 5, 5, 'simple'),
  (:p2, 'common', 4, 0, 'simple'), (:p2, 'rare', 3, 3, 'simple'),
  (:p3, 'common', 1, 0, 'simple'), (:p3, 'rare', 1, 1, 'simple'), (:p3, 'artrare', 2, 2, 'simple'),
  (:p4, 'rare', 5, 2, 'simple'), (:p4, 'common', 3, 0, 'simple');
-- cartes déjà tirées : séries partielles, une série complète, une 1/1 prise, une 1/1 libre
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id) values
  (:p1, 'common', 2, 1, :A), (:p1, 'common', 6, 3, :A), (:p1, 'common', 6, 4, :A), (:p1, 'rare', 8, 8, :A), (:p1, 'rare', 4, 1, :A), (:p1, 'artrare', 5, 5, :A),
  (:p2, 'rare', 3, 1, :A), (:p2, 'rare', 3, 2, :A), (:p2, 'rare', 3, 3, :A), (:p2, 'common', 4, 2, :A),
  (:p3, 'rare', 1, 1, :A), (:p3, 'artrare', 2, 1, :A),
  (:p4, 'rare', 5, 5, :A), (:p4, 'rare', 5, 1, :A), (:p4, 'common', 3, 3, :A), (:p4, 'common', 1, 1, :A);
-- un booster d'essai, une carte par position : commune, rare, unique, art rare, mélange
select (public.{{P}}admin_save_booster_type('thomarie', null, 'Comparaison', 5, '#101010', null, true,
  ('[{"position":1,"rarity_id":"common","weight":100},{"position":2,"rarity_id":"rare","weight":100},{"position":3,"rarity_id":"' || :'uniq' || '","weight":100},{"position":4,"rarity_id":"artrare","weight":100},'
   || '{"position":5,"rarity_id":"common","weight":30},{"position":5,"rarity_id":"rare","weight":30},{"position":5,"rarity_id":"' || :'uniq' || '","weight":20},{"position":5,"rarity_id":"artrare","weight":20}]')::jsonb) ->> 'id')::int as bt \gset

create temp table cmp (impl text, seen int, pos int, type_id int, base text, g int);
\echo '--- 5 positions x 2 variantes (avec et sans exclusion de types) x 2 pioches x 3000 tirages'
insert into cmp select 'fast', 0, p, (r).type_id, (r).base, (r).g from (select p, public.{{P}}pick_series_fast(:cat, :bt, p, '{}'::jsonb) as r from generate_series(1, 5) p, generate_series(1, 3000)) q;
insert into cmp select 'slow', 0, p, (r).type_id, (r).base, (r).g from (select p, public.{{P}}pick_series_slow(:cat, :bt, p, 0, '{}'::jsonb) as r from generate_series(1, 5) p, generate_series(1, 3000)) q;
select jsonb_build_object('common', jsonb_build_array(:p1), 'rare', jsonb_build_array(:p1, :p4), :'uniq', jsonb_build_array(:p3), 'artrare', jsonb_build_array(:p3)) as seen \gset
insert into cmp select 'fast', 1, p, (r).type_id, (r).base, (r).g from (select p, public.{{P}}pick_series_fast(:cat, :bt, p, :'seen'::jsonb) as r from generate_series(1, 5) p, generate_series(1, 3000)) q;
insert into cmp select 'slow', 1, p, (r).type_id, (r).base, (r).g from (select p, public.{{P}}pick_series_slow(:cat, :bt, p, 0, :'seen'::jsonb) as r from generate_series(1, 5) p, generate_series(1, 3000)) q;
select pg_temp.expect('les deux pioches rendent bien un résultat à chaque tirage', (select count(*) from cmp where impl = 'fast' and type_id is not null) = (select count(*) from cmp where impl = 'slow' and type_id is not null) and (select count(*) from cmp where type_id is not null) > 27000);

\echo '--- mêmes probabilités'
create temp table cells as
  select seen, pos, type_id, base, g,
         count(*) filter (where impl = 'fast') as nf, count(*) filter (where impl = 'slow') as ns
  from cmp where type_id is not null group by seen, pos, type_id, base, g;
create temp table zs as
  select c.*, case when (nf + ns) = 0 then 0 else abs(nf::float / 3000 - ns::float / 3000) / nullif(sqrt(((nf + ns)::float / 6000) * (1 - (nf + ns)::float / 6000) * (2.0 / 3000)), 0) end as z
  from cells c;
select max(z) as z_max, count(*) as cellules from zs \gset
select pg_temp.expect('mêmes probabilités pour chaque (position, type, rareté, série) : écart maximal inférieur à 5 écarts-types sur ' || :cellules || ' cases (z max ' || round(:z_max::numeric, 2) || ')', :z_max < 5);
select pg_temp.expect('mêmes cases possibles : aucune case n''apparaît dans une pioche et jamais dans l''autre (quand elle est assez probable)', not exists (select 1 from cells where (nf + ns) >= 30 and (nf = 0 or ns = 0)));

\echo '--- validité de chaque résultat de la pioche rapide'
create temp table cf as select ty.id as tid, c.rarity_id as base, c.smax, c.numbered from public.{{P}}types ty cross join lateral public.{{P}}type_config(ty.id) c where ty.category_id = :cat;
select pg_temp.expect('toujours une série existante (1 à n) d''un type de la catégorie', not exists (select 1 from cmp x where x.impl = 'fast' and x.type_id is not null and not exists (select 1 from cf where cf.tid = x.type_id and cf.base = x.base and x.g between 1 and cf.smax)));
select pg_temp.expect('jamais une série COMPLÈTE (plus aucune carte libre)', not exists (select 1 from cmp x where x.impl = 'fast' and x.type_id is not null and (select count(*) from public.{{P}}cards c where c.type_id = x.type_id and c.base_rarity = x.base and c.series = x.g) >= x.g));
select pg_temp.expect('position « unique » : toujours une 1/1 à numéro visible et libre ; jamais la 1/1 déjà prise (P3 rare)', not exists (select 1 from cmp x join cf on cf.tid = x.type_id and cf.base = x.base where x.impl = 'fast' and x.pos = 3 and (x.g <> 1 or cf.numbered < 1)) and not exists (select 1 from cmp x where x.impl = 'fast' and x.pos = 3 and x.type_id = :p3 and x.base = 'rare'));
select pg_temp.expect('position « rare » : jamais la 1/1 d''une rareté à numéro visible (c''est une Unique) ; la 1/1 d''une rareté masquée reste possible pour une commune (P3)', not exists (select 1 from cmp x join cf on cf.tid = x.type_id and cf.base = x.base where x.impl = 'fast' and x.pos in (2, 4) and x.g = 1 and cf.numbered >= 1)
  and exists (select 1 from cmp x where x.impl = 'fast' and x.pos = 1 and x.type_id = :p3 and x.base = 'common' and x.g = 1));
select pg_temp.expect('exclusions respectées position par position : communes sans P1 (pos 1), rares sans P1 ni P4 (pos 2), unique sans P3 (pos 3), art rare sans P3 (pos 4)', not exists (select 1 from cmp x where x.impl = 'fast' and x.seen = 1 and ((x.pos = 1 and x.type_id = :p1) or (x.pos = 2 and x.type_id in (:p1, :p4)) or (x.pos = 3 and x.type_id = :p3) or (x.pos = 4 and x.type_id = :p3))) and exists (select 1 from cmp x where x.impl = 'fast' and x.seen = 1 and x.pos = 1));

\echo '--- cas limites'
select pg_temp.expect('type de booster inconnu ou position sans choix : aucun résultat, sans erreur', (select count(*) from public.{{P}}pick_series_fast(:cat, :bt, 9, '{}'::jsonb)) = 0 and (select count(*) from public.{{P}}pick_series_fast(:cat, -1, 1, '{}'::jsonb)) = 0);
select pg_temp.expect('catégorie vide : aucun résultat', (select count(*) from public.{{P}}pick_series_fast(-5, :bt, 1, '{}'::jsonb)) = 0);
select pg_temp.expect('pick_series : le réglage normal passe par la pioche rapide, exposant non nul ou sans type de booster par l''ancienne ; les deux donnent un résultat', (select count(*) from public.{{P}}pick_series(:cat, :bt, 1, 0, '{}'::jsonb)) = 1 and (select count(*) from public.{{P}}pick_series(:cat, :bt, 1, 0.5, '{}'::jsonb)) = 1 and (select count(*) from public.{{P}}pick_series(:cat, null, 1, 0, '{}'::jsonb)) = 1);
select pg_temp.expect('fonctions internes fermées aux joueurs', not has_function_privilege('authenticated', 'public.{{P}}pick_series_fast(int, int, int, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.{{P}}pick_cfg(int)', 'execute') and not has_function_privilege('anon', 'public.{{P}}pick_series_fast(int, int, int, jsonb)', 'execute'));
-- une catégorie dont tout est tiré : plus aucun résultat
insert into public.{{P}}cards (type_id, base_rarity, series, number, owner_id)
select cf.tid, cf.base, s.g, n.n, :A from cf cross join lateral generate_series(1, cf.smax) s(g) cross join lateral generate_series(1, s.g) n(n)
on conflict do nothing;
select pg_temp.expect('toutes les cartes tirées : la pioche rapide ne rend plus rien (comme l''ancienne), sans erreur', (select count(*) from generate_series(1, 5) p, public.{{P}}pick_series_fast(:cat, :bt, p, '{}'::jsonb)) = 0 and (select count(*) from generate_series(1, 5) p, public.{{P}}pick_series_slow(:cat, :bt, p, 0, '{}'::jsonb)) = 0);

-- nettoyage
delete from public.{{P}}cards where owner_id = :A;
delete from public.{{P}}categories where name = 'Pick Param';
delete from public.{{P}}booster_types where id not in (select id from bt_backup);
delete from public.{{P}}rarities where id = 'artrare' and not :'had_art'::boolean;
update public.{{P}}categories set closed = false;
