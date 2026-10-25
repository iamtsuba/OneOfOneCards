\set A '''11111111-1111-1111-1111-111111111111'''
\set QUIET on

delete from public.{{P}}album_picks; delete from public.{{P}}cards; delete from public.{{P}}listings;
update public.{{P}}categories set closed = false, enabled = true;
update public.{{P}}config set value = 100 where key = 'max_boosters';
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
update public.{{P}}profiles set boosters = 100, bonus_boosters = 0;
set request.jwt.claim.sub = :A; select public.{{P}}status() is not null as profil_a;

\echo '=== owns_card_rarity : possède déjà ce type dans cette rareté ?'
insert into public.{{P}}cards (type_id, series, number, owner_id) values (1, 10, 3, :A);   -- type 1, série 10 : Ultra Rare
select public.{{P}}rarity_id(3, 10, 1, public.{{P}}default_base_rarity(1, 10)) as rarete_de_la_carte,
       public.{{P}}owns_card_rarity(:A, 1, public.{{P}}rarity_id(3, 10, 1, public.{{P}}default_base_rarity(1, 10))) as meme_type_meme_rarete,
       public.{{P}}owns_card_rarity(:A, 1, 'common') as meme_type_autre_rarete,
       public.{{P}}owns_card_rarity(:A, 2, public.{{P}}rarity_id(3, 10, 1, public.{{P}}default_base_rarity(1, 10))) as autre_type_meme_rarete,
       public.{{P}}owns_card_rarity('22222222-2222-2222-2222-222222222222', 1, public.{{P}}rarity_id(3, 10, 1, public.{{P}}default_base_rarity(1, 10))) as autre_joueur;
delete from public.{{P}}cards;

\echo '=== boosters normaux : is_new = pas déjà ce type dans cette rareté, y compris avec les cartes du même booster'
create temp table seen (type_id int, rid text);
create temp table verdict (kind text, total int, nouvelles int, ecarts int);
do $$
declare r jsonb; c record; v_total int := 0; v_new int := 0; v_bad int := 0; v_missing int := 0;
begin
  for i in 1 .. 40 loop
    truncate seen;
    insert into seen select c2.type_id, public.{{P}}rarity_id(c2.number, c2.series, c2.type_id, public.{{P}}default_base_rarity(c2.type_id, c2.series))
      from public.{{P}}cards c2 where c2.owner_id = '11111111-1111-1111-1111-111111111111';
    r := public.{{P}}open_booster();
    for c in select (e->>'type_id')::int as t, e->>'rarity_id' as rid, (e->>'is_new')::boolean as nw
             from jsonb_array_elements(r->'cards') with ordinality x(e, ord) order by ord loop
      v_total := v_total + 1;
      if c.nw is null then v_missing := v_missing + 1; end if;
      if c.nw is distinct from not exists (select 1 from seen s where s.type_id = c.t and s.rid = c.rid) then v_bad := v_bad + 1; end if;
      if c.nw then v_new := v_new + 1; end if;
      insert into seen values (c.t, c.rid);
    end loop;
  end loop;
  insert into verdict values ('boosters normaux', v_total, v_new, v_bad + v_missing);
end $$;
select kind, total as cartes_tirees, nouvelles > 0 as des_nouvelles, nouvelles < total as des_deja_possedees, ecarts as ecarts_avec_le_calcul_attendu from verdict;
select count(*) > 0 as collection_non_vide from public.{{P}}cards where owner_id = :A;

\echo '=== boosters Gold tirés au hasard : même règle'
update public.{{P}}config set value = 1 where key = 'golden_booster_chance';
update public.{{P}}profiles set boosters = 20 where id = :A;
truncate verdict;
do $$
declare r jsonb; c record; v_total int := 0; v_new int := 0; v_bad int := 0; v_missing int := 0;
begin
  for i in 1 .. 6 loop
    truncate seen;
    insert into seen select c2.type_id, public.{{P}}rarity_id(c2.number, c2.series, c2.type_id, public.{{P}}default_base_rarity(c2.type_id, c2.series))
      from public.{{P}}cards c2 where c2.owner_id = '11111111-1111-1111-1111-111111111111';
    r := public.{{P}}open_booster();
    if not (r->>'golden')::boolean then v_bad := v_bad + 1; end if;
    for c in select (e->>'type_id')::int as t, e->>'rarity_id' as rid, (e->>'is_new')::boolean as nw
             from jsonb_array_elements(r->'cards') with ordinality x(e, ord) order by ord loop
      v_total := v_total + 1;
      if c.nw is null then v_missing := v_missing + 1; end if;
      if c.nw is distinct from not exists (select 1 from seen s where s.type_id = c.t and s.rid = c.rid) then v_bad := v_bad + 1; end if;
      if c.nw then v_new := v_new + 1; end if;
      insert into seen values (c.t, c.rid);
    end loop;
  end loop;
  insert into verdict values ('boosters Gold', v_total, v_new, v_bad + v_missing);
end $$;
select kind, total as cartes_tirees, nouvelles > 0 as des_nouvelles, ecarts as ecarts_avec_le_calcul_attendu from verdict;
update public.{{P}}config set value = 0 where key = 'golden_booster_chance';
delete from public.{{P}}album_picks; delete from public.{{P}}cards;
