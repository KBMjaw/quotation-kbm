-- Product-level GST: each material carries its own GST rate; quotation lines store the rate and
-- amounts that applied when they were saved. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Materials: GST configuration
-- ---------------------------------------------------------------------------
alter table public.materials add column if not exists gst_rate numeric(5, 2);
alter table public.materials add column if not exists tax_type text not null default 'GST';

-- Backfill: seeded materials get their known rate, anything else starts at 0% for the admin to set.
update public.materials
set gst_rate = case lower(name) when 'flyash' then 5 when 'p sand dry' then 5 else 0 end
where gst_rate is null;

alter table public.materials alter column gst_rate set default 0;
alter table public.materials alter column gst_rate set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_gst_rate_check') then
    alter table public.materials add constraint materials_gst_rate_check check (gst_rate between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materials_tax_type_check') then
    alter table public.materials add constraint materials_tax_type_check check (tax_type in ('GST', 'EXEMPT'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Company GSTINs (filled only while blank; Kannan Ready Mix Concrete is left for the admin)
-- ---------------------------------------------------------------------------
update public.companies set gstin = '33ACCPC2634C1ZI'
where lower(company_name) = 'kannan blue metals' and gstin = '';
update public.companies set gstin = '33AAJCK1677M1Z4'
where lower(company_name) = 'kannan infra projects india private limited' and gstin = '';

-- ---------------------------------------------------------------------------
-- Quotation lines: saved GST rate + amounts
-- ---------------------------------------------------------------------------
alter table public.quotation_items add column if not exists gst_overridden boolean not null default false;
alter table public.quotation_items add column if not exists cgst_amount numeric(14, 2) not null default 0;
alter table public.quotation_items add column if not exists sgst_amount numeric(14, 2) not null default 0;
alter table public.quotation_items add column if not exists igst_amount numeric(14, 2) not null default 0;
alter table public.quotation_items add column if not exists gst_amount numeric(14, 2) not null default 0;
alter table public.quotation_items add column if not exists line_total numeric(14, 2) not null default 0;

alter table public.quotations add column if not exists gst_summary jsonb not null default '[]'::jsonb;

-- Resolves a line's GST rate from configuration and computes its tax.
--  * normal line: material's configured rate; an existing line keeps the rate it was saved with
--    unless its material changes (old quotations keep historical GST)
--  * overridden line: only admins may create or change it
create or replace function public.quotation_item_gst() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric;
  v_mode text;
  v_gross numeric;
begin
  if new.gst_overridden then
    if not public.is_admin() and (
      tg_op = 'INSERT'
      or not old.gst_overridden
      or old.gst_rate is distinct from new.gst_rate
      or old.material_id is distinct from new.material_id
    ) then
      raise exception 'Only authorised users can override GST' using errcode = '42501';
    end if;
  elsif new.material_id is not null then
    select case when tax_type = 'EXEMPT' then 0 else gst_rate end into v_rate
    from public.materials where id = new.material_id;
    if not (tg_op = 'UPDATE'
            and old.material_id = new.material_id
            and not old.gst_overridden
            and new.gst_rate = old.gst_rate) then
      new.gst_rate := coalesce(v_rate, new.gst_rate);
    end if;
  elsif tg_op = 'UPDATE' then
    new.gst_rate := old.gst_rate; -- material was deleted: keep what was saved
  end if;

  select tax_mode into v_mode from public.quotations where id = new.quotation_id;
  v_gross := round(new.quantity * new.rate, 2);
  new.amount := v_gross - round(v_gross * new.discount_pct / 100, 2);
  new.cgst_amount := case when v_mode = 'CGST_SGST' then round(new.amount * new.gst_rate / 200, 2) else 0 end;
  new.sgst_amount := new.cgst_amount;
  new.igst_amount := case when v_mode = 'IGST' then round(new.amount * new.gst_rate / 100, 2) else 0 end;
  new.gst_amount := new.cgst_amount + new.sgst_amount + new.igst_amount;
  new.line_total := new.amount + new.gst_amount;
  return new;
end;
$$;

drop trigger if exists quotation_item_gst on public.quotation_items;
create trigger quotation_item_gst before insert or update on public.quotation_items
  for each row execute function public.quotation_item_gst();

-- Recomputes a quotation's totals and GST summary from its stored lines.
create or replace function public.refresh_quotation_totals(p_quotation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_round boolean;
  v_subtotal numeric;
  v_taxable numeric;
  v_tax numeric;
  v_exact numeric;
  v_grand numeric;
  v_summary jsonb;
  v_lines jsonb;
begin
  select tax_mode into v_mode from public.quotations where id = p_quotation_id;
  if v_mode is null then
    return;
  end if;
  select coalesce((select round_off_total from public.quotation_settings where id = 1), true) into v_round;

  select coalesce(sum(round(quantity * rate, 2)), 0), coalesce(sum(amount), 0), coalesce(sum(gst_amount), 0)
  into v_subtotal, v_taxable, v_tax
  from public.quotation_items where quotation_id = p_quotation_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rate', gst_rate, 'taxable', taxable, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'tax', tax)
           order by gst_rate), '[]'::jsonb)
  into v_summary
  from (
    select gst_rate, sum(amount) taxable, sum(cgst_amount) cgst, sum(sgst_amount) sgst,
           sum(igst_amount) igst, sum(gst_amount) tax
    from public.quotation_items where quotation_id = p_quotation_id
    group by gst_rate
  ) s
  where v_mode <> 'NONE';

  select coalesce(jsonb_agg(l.line order by l.rate, l.ord), '[]'::jsonb)
  into v_lines
  from (
    select gst_rate rate, 1 ord, jsonb_build_object('label', 'CGST', 'rate', gst_rate / 2, 'amount', sum(cgst_amount)) line
    from public.quotation_items where quotation_id = p_quotation_id and v_mode = 'CGST_SGST'
    group by gst_rate having sum(gst_amount) <> 0
    union all
    select gst_rate, 2, jsonb_build_object('label', 'SGST', 'rate', gst_rate / 2, 'amount', sum(sgst_amount))
    from public.quotation_items where quotation_id = p_quotation_id and v_mode = 'CGST_SGST'
    group by gst_rate having sum(gst_amount) <> 0
    union all
    select gst_rate, 1, jsonb_build_object('label', 'IGST', 'rate', gst_rate, 'amount', sum(igst_amount))
    from public.quotation_items where quotation_id = p_quotation_id and v_mode = 'IGST'
    group by gst_rate having sum(gst_amount) <> 0
  ) l;

  v_exact := v_taxable + v_tax;
  v_grand := case when v_round then round(v_exact) else v_exact end;

  update public.quotations set
    subtotal = v_subtotal,
    discount_total = v_subtotal - v_taxable,
    taxable_total = v_taxable,
    tax_total = v_tax,
    tax_lines = v_lines,
    gst_summary = v_summary,
    round_off = v_grand - v_exact,
    grand_total = v_grand
  where id = p_quotation_id;
end;
$$;

create or replace function public.quotation_items_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_quotation_totals(coalesce(new.quotation_id, old.quotation_id));
  return null;
end;
$$;

drop trigger if exists quotation_items_changed on public.quotation_items;
create trigger quotation_items_changed after insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_changed();

-- ---------------------------------------------------------------------------
-- Every material needs a default unit (seeded default, else its first available unit)
-- ---------------------------------------------------------------------------
update public.materials m
set default_unit_id = u.id
from (values ('flyash', 'MT'), ('p sand dry', 'M3')) as v(name, code)
join public.unit_types u on lower(u.code) = lower(v.code)
where lower(m.name) = v.name and m.default_unit_id is null;

update public.materials m
set default_unit_id = (select mu.unit_id from public.material_units mu where mu.material_id = m.id limit 1)
where m.default_unit_id is null;
