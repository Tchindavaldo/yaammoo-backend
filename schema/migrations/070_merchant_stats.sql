-- 070_merchant_stats.sql
-- Stats du hero du home marchand (GET /fastFood/:fastFoodId/stats).
-- Une seule fonction renvoie toutes les slides en jsonb.
-- Heure de Douala. p_bucket : 'day' | 'week' | 'month'.
-- Commande payee = statut different de pendingToBuy, non supprimee.
-- Chiffre d'affaires = credits marchand (transactions.merchant_credit), jamais le total client.

create or replace function merchant_stats(p_fastfood_id text, p_from date, p_to date, p_bucket text)
returns jsonb
language sql
stable
as $$
with
bounds as (
  select (p_from::timestamp at time zone 'Africa/Douala') as t0,
         ((p_to + 1)::timestamp at time zone 'Africa/Douala') as t1
),
buckets as (
  select g::date as b
  from generate_series(date_trunc(p_bucket, p_from::timestamp), p_to::timestamp, ('1 ' || p_bucket)::interval) g
),
o as (
  select o.*, (o.created_at at time zone 'Africa/Douala') as loc,
         date_trunc(p_bucket, o.created_at at time zone 'Africa/Douala')::date as b
  from orders o, bounds
  where o.fastfood_id = p_fastfood_id and o.deleted_at is null
    and o.status <> 'pendingToBuy' and o.created_at >= bounds.t0 and o.created_at < bounds.t1
),
credits as (
  select date_trunc(p_bucket, t.created_at at time zone 'Africa/Douala')::date as b, t.amount,
         (t.created_at at time zone 'Africa/Douala')::date as d
  from transactions t, bounds
  where t.type = 'merchant_credit' and t.extra_data->>'fastFoodId' = p_fastfood_id
    and t.created_at >= bounds.t0 and t.created_at < bounds.t1
),
first_order as (
  select o2.user_id, min(o2.created_at) as first_at
  from orders o2
  where o2.fastfood_id = p_fastfood_id and o2.deleted_at is null and o2.status <> 'pendingToBuy'
  group by o2.user_id
),
clients as (
  select o.b, o.user_id, bool_or(f.first_at >= date_trunc(p_bucket, o.loc) at time zone 'Africa/Douala') as is_new
  from o join first_order f on f.user_id = o.user_id
  group by o.b, o.user_id
),
hist as (
  select h.order_id, h.to_status, min(h.changed_at) as at
  from order_status_history h
  where h.fastfood_id = p_fastfood_id
  group by h.order_id, h.to_status
),
delays as (
  select o.b,
    extract(epoch from (coalesce(dl.at, fin.at) - pd.at)) / 60 as prep,
    extract(epoch from (fin.at - dl.at)) / 60 as deliv,
    extract(epoch from (fin.at - pd.at)) / 60 as total
  from o
  join hist pd on pd.order_id = o.id and pd.to_status = 'pending'
  left join hist dl on dl.order_id = o.id and dl.to_status = 'delivering'
  left join hist fin on fin.order_id = o.id and fin.to_status in ('delivered', 'finished')
),
ev as (
  select e.type, e.menu_id from analytics_events e, bounds
  where e.fastfood_id = p_fastfood_id and e.occurred_at >= bounds.t0 and e.occurred_at < bounds.t1
)
select jsonb_build_object(
  'series', (
    select jsonb_agg(jsonb_build_object(
      'start', bk.b,
      'revenue', coalesce((select sum(c.amount) from credits c where c.b = bk.b), 0),
      'delivered', (select count(*) from o where o.b = bk.b and o.status in ('delivered', 'finished') and coalesce((o.delivery->>'status')::boolean, false)),
      'onSite', (select count(*) from o where o.b = bk.b and o.status in ('delivered', 'finished') and not coalesce((o.delivery->>'status')::boolean, false)),
      'ongoing', (select count(*) from o where o.b = bk.b and o.status in ('pending', 'processing', 'delivering')),
      'cancelled', (select count(*) from o where o.b = bk.b and o.status like 'cancel%'),
      'newClients', (select count(*) from clients c where c.b = bk.b and c.is_new),
      'returning', (select count(*) from clients c where c.b = bk.b and not c.is_new),
      'delayMin', (select round(avg(d.total)) from delays d where d.b = bk.b)
    ) order by bk.b) from buckets bk),
  'revenue', coalesce((select sum(amount) from credits), 0),
  'revenueToday', coalesce((select sum(amount) from credits where d = (now() at time zone 'Africa/Douala')::date), 0),
  'orders', (select count(*) from o where o.status not like 'cancel%'),
  'cancelled', (select count(*) from o where o.status like 'cancel%'),
  'funnel', jsonb_build_object(
    'views', (select count(*) from ev where type = 'shop_impression'),
    'opens', (select count(*) from ev where type = 'menu_open'),
    'carts', (select count(*) from ev where type in ('add_to_cart', 'checkout_start')),
    'orders', (select count(*) from o where o.status not like 'cancel%')
  ),
  'delays', jsonb_build_object(
    'prep', (select round(avg(prep)) from delays),
    'delivery', (select round(avg(deliv)) from delays),
    'total', (select round(avg(total)) from delays)
  ),
  'heatmap', (
    select coalesce(jsonb_agg(jsonb_build_object('dow', x.dow, 'hour', x.h, 'count', x.n)), '[]'::jsonb)
    from (select ((extract(isodow from loc))::int - 1) as dow, extract(hour from loc)::int as h, count(*) as n
          from o group by 1, 2) x),
  'rankings', jsonb_build_object(
    'dishes', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select coalesce(menu_snapshot->>'name', '?') as name, sum(coalesce(quantity, 1)) as count
      from o where status not like 'cancel%' group by 1 order by 2 desc limit 4) r),
    'views', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select coalesce(m.name, m.titre, '?') as name, count(*) as count
      from ev join menus m on m.id = ev.menu_id where ev.type = 'menu_open' group by 1 order by 2 desc limit 4) r),
    'clients', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select trim(coalesce(user_data->>'firstName', '') || ' ' || left(coalesce(user_data->>'lastName', ''), 1) || '.') as name,
             count(*) as count, sum(total) as amount
      from o where status not like 'cancel%' group by user_id, 1 order by 2 desc, 3 desc limit 4) r),
    'drivers', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select coalesce(nullif(trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), ''), ff.name, '?') as name,
             count(*) as count, sum(o.total) as amount
      from o left join users u on u.id = o.driver_id left join fastfoods ff on ff.id = o.driver_id
      where o.driver_id is not null and o.status not like 'cancel%' group by o.driver_id, 1 order by 2 desc limit 4) r),
    'zones', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select od.zone as name, count(*) as count, sum(o.total) as amount
      from o join order_deliveries od on od.order_id = o.id and od.deleted_at is null
      where od.zone is not null and o.status not like 'cancel%' group by 1 order by 2 desc limit 4) r)
  )
);
$$;
