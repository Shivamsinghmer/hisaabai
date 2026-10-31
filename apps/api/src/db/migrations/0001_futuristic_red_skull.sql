DROP VIEW "public"."customer_balances";--> statement-breakpoint
CREATE VIEW "public"."customer_balances" AS (
  with totals as (
    select c.id as customer_id, c.merchant_id, c.name,
      coalesce(sum(e.amount_paise) filter (where e.type = 'credit'), 0)::bigint as credited,
      coalesce(sum(e.amount_paise) filter (where e.type = 'payment'), 0)::bigint as paid
    from customers c
    left join ledger_entries e on e.customer_id = c.id and e.status = 'confirmed'
    group by c.id
  ),
  running as (
    select e.customer_id, e.due_date,
      sum(e.amount_paise) over (
        partition by e.customer_id order by e.entry_date, e.created_at, e.id
      ) as credited_so_far
    from ledger_entries e
    where e.type = 'credit' and e.status = 'confirmed'
  ),
  oldest_unpaid as (
    select r.customer_id, min(r.due_date) as earliest_due
    from running r join totals t using (customer_id)
    where r.credited_so_far > t.paid
    group by r.customer_id
  )
  select t.customer_id, t.merchant_id, t.name,
    (t.credited - t.paid)::bigint as balance_paise,
    o.earliest_due
  from totals t left join oldest_unpaid o using (customer_id)
);