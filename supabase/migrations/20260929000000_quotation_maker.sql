-- KIPIPL Quotation Maker schema
-- Safe to re-run: every object is created only if missing, seed rows use ON CONFLICT DO NOTHING.


-- ---------------------------------------------------------------------------
-- Users & roles (uses Supabase Auth; first user to sign up becomes admin)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when exists (select 1 from public.profiles) then 'user' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unit types
-- ---------------------------------------------------------------------------
create table if not exists public.unit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  code text not null check (btrim(code) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists unit_types_code_key on public.unit_types (lower(code));
create unique index if not exists unit_types_name_key on public.unit_types (lower(name));

-- ---------------------------------------------------------------------------
-- Materials (+ which units each material can be quoted in)
-- ---------------------------------------------------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  code text not null default '',
  description text not null default '',
  hsn_code text not null default '',
  default_unit_id uuid references public.unit_types (id) on delete set null,
  default_rate numeric(14, 2) check (default_rate is null or default_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists materials_name_key on public.materials (lower(name));
create unique index if not exists materials_code_key on public.materials (lower(code)) where code <> '';

create table if not exists public.material_units (
  material_id uuid not null references public.materials (id) on delete cascade,
  unit_id uuid not null references public.unit_types (id) on delete restrict,
  primary key (material_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (btrim(company_name) <> ''),
  display_name text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  area text not null default '',
  city text not null default '',
  district text not null default '',
  state text not null default '',
  pincode text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  gstin text not null default '',
  pan text not null default '',
  logo_url text,
  brand_color text not null default '#1F3A93',
  quotation_prefix text not null check (btrim(quotation_prefix) <> ''),
  next_number integer not null default 1 check (next_number > 0),
  additional_info text not null default '',
  footer_text text not null default '',
  terms_conditions text not null default '',
  bank_details jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists companies_name_key on public.companies (lower(company_name));

-- ---------------------------------------------------------------------------
-- Quotation settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.quotation_settings (
  id integer primary key default 1 check (id = 1),
  number_format text not null default '{PREFIX}-QTN-{SEQ}',
  seq_padding integer not null default 4,
  default_gst_rate numeric(5, 2) not null default 5,
  default_tax_mode text not null default 'CGST_SGST' check (default_tax_mode in ('CGST_SGST', 'IGST', 'NONE')),
  default_validity_days integer not null default 15,
  default_terms text not null default '',
  default_footer text not null default '',
  show_amount_in_words boolean not null default true,
  show_bank_details boolean not null default true,
  round_off_total boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  seq integer,
  company_id uuid not null references public.companies (id) on delete restrict,
  company_snapshot jsonb,
  quotation_date date not null,
  valid_until date,
  reference text not null default '',
  subject text not null default '',
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_contact_person text not null default '',
  customer_address text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  customer_gstin text not null default '',
  delivery_address text not null default '',
  tax_mode text not null default 'CGST_SGST' check (tax_mode in ('CGST_SGST', 'IGST', 'NONE')),
  terms_conditions text not null default '',
  notes text not null default '',
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  taxable_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  tax_lines jsonb not null default '[]'::jsonb,
  round_off numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotations_company_idx on public.quotations (company_id);
create index if not exists quotations_date_idx on public.quotations (quotation_date desc);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  position integer not null default 0,
  -- material/unit names are copied so old quotations still render if a material is renamed or disabled
  material_id uuid references public.materials (id) on delete set null,
  material_name text not null,
  description text not null default '',
  hsn_code text not null default '',
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_id uuid references public.unit_types (id) on delete set null,
  unit_code text not null default '',
  unit_name text not null default '',
  rate numeric(14, 2) not null check (rate >= 0),
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  gst_rate numeric(5, 2) not null default 0 check (gst_rate between 0 and 100),
  amount numeric(14, 2) not null default 0
);
create index if not exists quotation_items_quotation_idx on public.quotation_items (quotation_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['unit_types', 'materials', 'companies', 'quotation_settings', 'quotations'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Atomically hands out the next number for a company (callable by any signed-in user)
create or replace function public.next_quotation_seq(p_company_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.companies set next_number = next_number + 1
    where id = p_company_id
    returning next_number - 1 into v;
  if v is null then
    raise exception 'company not found';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--   * everyone signed in can read settings/master data and create quotations
--   * only admins can change companies, materials, units and quotation settings
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.unit_types enable row level security;
alter table public.materials enable row level security;
alter table public.material_units enable row level security;
alter table public.companies enable row level security;
alter table public.quotation_settings enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['unit_types', 'materials', 'material_units', 'companies', 'quotation_settings'] loop
    execute format('drop policy if exists "%1$s read" on public.%1$s', t);
    execute format('create policy "%1$s read" on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s admin write" on public.%1$s', t);
    execute format('create policy "%1$s admin write" on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists "quotations read" on public.quotations;
create policy "quotations read" on public.quotations for select to authenticated using (true);
drop policy if exists "quotations insert" on public.quotations;
create policy "quotations insert" on public.quotations for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "quotations update" on public.quotations;
create policy "quotations update" on public.quotations for update to authenticated
  using (public.is_admin() or created_by = auth.uid()) with check (public.is_admin() or created_by = auth.uid());
drop policy if exists "quotations delete" on public.quotations;
create policy "quotations delete" on public.quotations for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

drop policy if exists "quotation_items read" on public.quotation_items;
create policy "quotation_items read" on public.quotation_items for select to authenticated using (true);
drop policy if exists "quotation_items write" on public.quotation_items;
create policy "quotation_items write" on public.quotation_items for all to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id and (public.is_admin() or q.created_by = auth.uid())))
  with check (exists (select 1 from public.quotations q where q.id = quotation_id and (public.is_admin() or q.created_by = auth.uid())));

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Logo storage (public read, admin write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

drop policy if exists "company logos admin insert" on storage.objects;
create policy "company logos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and public.is_admin());
drop policy if exists "company logos admin update" on storage.objects;
create policy "company logos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and public.is_admin());
drop policy if exists "company logos admin delete" on storage.objects;
create policy "company logos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed data (no duplicates)
-- ---------------------------------------------------------------------------
insert into public.quotation_settings (id, default_terms, default_footer)
values (1,
  E'Prices are ex-works / at site as mentioned above and subject to change without prior notice.\nGST as applicable at the time of supply.\nPayment: 100% advance or as mutually agreed.\nDelivery subject to availability of material and vehicle.\nThis quotation is valid for the period mentioned above.',
  'This is a computer generated quotation.')
on conflict (id) do nothing;

insert into public.unit_types (name, code) values
  ('Piece', 'PCS'), ('Cubic Meter', 'M3'), ('Unit', 'UNIT'), ('Metric Tons', 'MT')
on conflict do nothing;

insert into public.materials (name, code, description, hsn_code, default_unit_id)
select v.name, v.code, v.name, v.hsn, (select id from public.unit_types where lower(code) = lower(v.def))
from (values ('Flyash', 'FLYASH', '2621', 'MT'), ('P Sand Dry', 'PSAND-DRY', '2517', 'M3')) as v(name, code, hsn, def)
on conflict do nothing;

insert into public.material_units (material_id, unit_id)
select m.id, u.id
from (values ('Flyash', 'MT'), ('Flyash', 'M3'), ('P Sand Dry', 'M3'), ('P Sand Dry', 'MT'), ('P Sand Dry', 'UNIT')) as v(material, unit)
join public.materials m on lower(m.name) = lower(v.material)
join public.unit_types u on lower(u.code) = lower(v.unit)
on conflict do nothing;

insert into public.companies (company_name, display_name, quotation_prefix, brand_color) values
  ('Kannan Blue Metals', 'KANNAN BLUE METALS', 'KBM', '#1F3A93'),
  ('Kannan Ready Mix Concrete', 'KANNAN READY MIX CONCRETE', 'KRMC', '#B45309'),
  ('Kannan Infra Projects India Private Limited', 'KANNAN INFRA PROJECTS INDIA PRIVATE LIMITED', 'KIPIPL', '#0F766E')
on conflict do nothing;
