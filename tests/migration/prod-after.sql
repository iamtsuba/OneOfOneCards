\echo === relance du schéma sur la base migrée : voir le nombre d'erreurs plus bas
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update o1ocards_profiles set boosters = 5 where id = '11111111-1111-1111-1111-111111111111';
select jsonb_array_length(o1ocards_open_booster() -> 'cards') as cartes_du_booster;
select count(*) > 0 as album_ok from o1ocards_album_view(1);
select (o1ocards_my_stats(1) -> 'by_rarity') is not null as stats_ok, o1ocards_draw_odds(1) is not null as chances_ok;
select rarity_id, count(*) as cartes_possedees from o1ocards_list_collection(null, null, null, 'series', 200, 0) group by rarity_id order by 2 desc;
select o1ocards_sell_direct(t.type_id, t.base_rarity, t.series, t.number) is not null as vente_rapide_ok
from (select c.type_id, c.base_rarity, c.series, c.number from o1ocards_cards c where c.owner_id = '11111111-1111-1111-1111-111111111111' and c.series = 400 limit 1) t;
select (select count(*) from o1ocards_cards where owner_id is null and retired_at is not null) as cartes_retirees;
select jsonb_typeof(o1ocards_status() -> 'profile') as profil_ok;
