
-- =====================================================================================================================
-- RÉSERVÉ À LA PRÉPRODUCTION : ce fichier n'est ajouté qu'au schéma de préproduction (scripts/build-schema.mjs), jamais à celui
-- de la production. {{PROD}} = préfixe des tables et fonctions de la production.
-- =====================================================================================================================

-- Copie d'une catégorie de la PRÉPRODUCTION vers la PRODUCTION : la catégorie (nom, couleurs, image du booster, nombre de séries),
-- ses types (nom, image, position, secret, nombre de séries) et les raretés de chaque type (séries, numérotées, style de carte).
-- Les cartes, les annonces et les joueurs ne sont jamais copiés.
--  - Préproduction et production partagent la même base : on écrit directement dans les tables de production, en une seule opération
--    (tout ou rien : si quelque chose échoue, rien n'est créé).
--  - Les DEUX mots de passe administrateur sont exigés (préproduction et production) : la copie passe par la garde de la production,
--    donc ses essais ratés y sont journalisés et verrouillés comme d'habitude.
--  - La catégorie arrive DÉSACTIVÉE en production, à la fin de la liste : rien ne s'ouvre par accident, l'administrateur l'active ensuite.
--  - Refusée si une catégorie du même nom (casse ignorée) existe déjà en production : jamais de doublon.
--  - Les raretés utilisées par les types doivent exister en production ; sinon refus, avec la liste des raretés manquantes, sauf si
--    p_create_missing_rarities est vrai (elles sont alors créées en production avec leurs réglages de préproduction).
create or replace function public.{{P}}admin_copy_category_to_prod(
  p_password text, p_category int, p_prod_password text, p_create_missing_rarities boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  err text := public.{{P}}admin_guard(p_password);
  perr text;
  src public.{{P}}categories%rowtype;
  t record;
  v_new int; v_tid int; v_pos int;
  v_types int := 0; v_rar int := 0;
  v_missing text[];
begin
  if err is not null then return jsonb_build_object('error', err); end if;
  perr := public.{{PROD}}admin_guard(p_prod_password);
  if perr is not null then return jsonb_build_object('error', 'prod_' || perr); end if;

  select * into src from public.{{P}}categories where id = p_category;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if exists (select 1 from public.{{PROD}}categories where lower(name) = lower(src.name)) then
    return jsonb_build_object('error', 'prod_category_exists');
  end if;

  select coalesce(array_agg(distinct tr.rarity_id order by tr.rarity_id), '{}') into v_missing
  from public.{{P}}type_rarities tr
  join public.{{P}}types ty on ty.id = tr.type_id
  where ty.category_id = p_category
    and not exists (select 1 from public.{{PROD}}rarities pr where pr.id = tr.rarity_id);
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    if not coalesce(p_create_missing_rarities, false) then
      return jsonb_build_object('error', 'prod_missing_rarities:' || array_to_string(v_missing, ','));
    end if;
    insert into public.{{PROD}}rarities (id, name, kind, max_series, sort_order, color, color2, text_color)
    select id, name, kind, max_series, sort_order, color, color2, text_color
    from public.{{P}}rarities where id = any (v_missing);
  end if;

  select coalesce(max(position), 0) + 1 into v_pos from public.{{PROD}}categories;
  insert into public.{{PROD}}categories (name, position, series_count, color, color2, text_color, image, enabled, closed)
  values (src.name, v_pos, src.series_count, src.color, src.color2, src.text_color, src.image, false, false)
  returning id into v_new;

  for t in select * from public.{{P}}types where category_id = p_category order by position, id loop
    insert into public.{{PROD}}types (category_id, name, image, position, series_count, secret)
    values (v_new, t.name, t.image, t.position, t.series_count, t.secret)
    returning id into v_tid;
    v_types := v_types + 1;
    insert into public.{{PROD}}type_rarities (type_id, rarity_id, max_series, numbered_series, card_style)
    select v_tid, rarity_id, max_series, numbered_series, card_style from public.{{P}}type_rarities where type_id = t.id;
    v_rar := v_rar + (select count(*) from public.{{P}}type_rarities where type_id = t.id);
  end loop;

  return jsonb_build_object(
    'ok', true, 'category_id', v_new, 'name', src.name, 'position', v_pos, 'types', v_types, 'rarities', v_rar,
    'created_rarities', to_jsonb(coalesce(v_missing, '{}'::text[])), 'enabled', false);
end $$;

revoke all on function public.{{P}}admin_copy_category_to_prod(text, int, text, boolean) from public, anon;
grant execute on function public.{{P}}admin_copy_category_to_prod(text, int, text, boolean) to authenticated;
