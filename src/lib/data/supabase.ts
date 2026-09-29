import type { SupabaseClient } from "@supabase/supabase-js";
import { lineAmounts } from "../calc";
import { DEFAULT_SETTINGS, emptyBank } from "../defaults";
import type { Company, Material, Quotation, QuotationItem, QuotationSettings, UnitType } from "../types";
import { ValidationError } from "../validation";
import type { Backend, Usage } from "./backend";

type Row = Record<string, unknown>;

const LOGO_BUCKET = "company-logos";

/** Turns PostgREST errors into friendly messages (unique violations become field errors). */
function check<T>(res: { data: T | null; error: { code?: string; message: string } | null }, field = "name"): T {
  if (res.error) {
    if (res.error.code === "23505") throw new ValidationError({ [field]: "A record with this value already exists" });
    if (res.error.code === "42501") throw new Error("You don't have permission to do this (admin only).");
    throw new Error(res.error.message);
  }
  return res.data as T;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

const toCompany = (r: Row): Company => ({
  ...(r as unknown as Company),
  bank_details: { ...emptyBank(), ...((r.bank_details as object) ?? {}) },
});

const fromCompany = (c: Company): Row => {
  const { created_at: _c, updated_at: _u, ...rest } = c;
  return rest as unknown as Row;
};

function toQuotation(r: Row, items: Row[]): Quotation {
  return {
    id: r.id as string,
    quotation_no: r.quotation_no as string,
    seq: r.seq as number | null,
    company_id: r.company_id as string,
    company_snapshot: (r.company_snapshot as Company) ?? null,
    quotation_date: r.quotation_date as string,
    valid_until: (r.valid_until as string) ?? null,
    reference: r.reference as string,
    subject: r.subject as string,
    customer: {
      name: r.customer_name as string,
      contact_person: r.customer_contact_person as string,
      address: r.customer_address as string,
      phone: r.customer_phone as string,
      email: r.customer_email as string,
      gstin: r.customer_gstin as string,
      delivery_address: r.delivery_address as string,
    },
    items: items
      .sort((a, b) => num(a.position) - num(b.position))
      .map((i) => ({
        id: i.id as string,
        material_id: (i.material_id as string) ?? null,
        material_name: i.material_name as string,
        description: i.description as string,
        hsn_code: i.hsn_code as string,
        quantity: num(i.quantity),
        unit_id: (i.unit_id as string) ?? null,
        unit_code: i.unit_code as string,
        unit_name: i.unit_name as string,
        rate: num(i.rate),
        discount_pct: num(i.discount_pct),
        gst_rate: num(i.gst_rate),
      })),
    tax_mode: r.tax_mode as Quotation["tax_mode"],
    terms_conditions: r.terms_conditions as string,
    notes: r.notes as string,
    totals: {
      subtotal: num(r.subtotal),
      discount_total: num(r.discount_total),
      taxable_total: num(r.taxable_total),
      tax_total: num(r.tax_total),
      tax_lines: (r.tax_lines as Quotation["totals"]["tax_lines"]) ?? [],
      round_off: num(r.round_off),
      grand_total: num(r.grand_total),
    },
    status: r.status as Quotation["status"],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

const itemRow = (quotationId: string, it: QuotationItem, position: number): Row => ({
  id: it.id,
  quotation_id: quotationId,
  position,
  material_id: it.material_id,
  material_name: it.material_name,
  description: it.description,
  hsn_code: it.hsn_code,
  quantity: it.quantity,
  unit_id: it.unit_id,
  unit_code: it.unit_code,
  unit_name: it.unit_name,
  rate: it.rate,
  discount_pct: it.discount_pct,
  gst_rate: it.gst_rate,
  amount: lineAmounts(it).taxable,
});

export class SupabaseBackend implements Backend {
  mode = "supabase" as const;

  constructor(private sb: SupabaseClient) {}

  /* Companies */
  async listCompanies() {
    return check(await this.sb.from("companies").select("*")).map(toCompany);
  }
  async upsertCompany(c: Company) {
    return toCompany(check(await this.sb.from("companies").upsert(fromCompany(c)).select().single(), "company_name"));
  }
  async removeCompany(id: string) {
    check(await this.sb.from("companies").delete().eq("id", id));
  }
  async uploadLogo(companyId: string, png: Blob) {
    const path = `${companyId}/${Date.now()}.png`;
    check(await this.sb.storage.from(LOGO_BUCKET).upload(path, png, { contentType: "image/png", upsert: true }));
    return this.sb.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /* Units */
  async listUnits() {
    return check(await this.sb.from("unit_types").select("*")) as UnitType[];
  }
  async upsertUnit(u: UnitType) {
    const { created_at: _c, updated_at: _u, ...row } = u;
    return check(await this.sb.from("unit_types").upsert(row).select().single(), "code") as UnitType;
  }
  async removeUnit(id: string) {
    check(await this.sb.from("unit_types").delete().eq("id", id));
  }

  /* Materials */
  async listMaterials() {
    const rows = check(await this.sb.from("materials").select("*, material_units(unit_id)")) as Row[];
    return rows.map(({ material_units, ...m }) => ({
      ...(m as unknown as Material),
      default_rate: m.default_rate == null ? null : Number(m.default_rate),
      unit_ids: ((material_units as { unit_id: string }[]) ?? []).map((x) => x.unit_id),
    }));
  }
  async upsertMaterial(m: Material) {
    const { unit_ids, created_at: _c, updated_at: _u, ...row } = m;
    check(await this.sb.from("materials").upsert(row).select().single());
    check(await this.sb.from("material_units").delete().eq("material_id", m.id));
    if (unit_ids.length)
      check(await this.sb.from("material_units").insert(unit_ids.map((unit_id) => ({ material_id: m.id, unit_id }))));
    return m;
  }
  async removeMaterial(id: string) {
    check(await this.sb.from("materials").delete().eq("id", id));
  }

  /* Settings */
  async getSettings(): Promise<QuotationSettings> {
    const row = check(await this.sb.from("quotation_settings").select("*").eq("id", 1).maybeSingle()) as Row | null;
    if (!row) return { ...DEFAULT_SETTINGS };
    const { id: _id, updated_at: _u, ...s } = row;
    return {
      ...DEFAULT_SETTINGS,
      ...(s as unknown as QuotationSettings),
      default_gst_rate: num(s.default_gst_rate),
      admin_pin_hash: null,
    };
  }
  async putSettings(s: QuotationSettings) {
    const { admin_pin_hash: _p, ...row } = s;
    check(await this.sb.from("quotation_settings").upsert({ id: 1, ...row }));
    return s;
  }

  /* Quotations */
  async listQuotations() {
    const rows = check(await this.sb.from("quotations").select("*, quotation_items(*)")) as Row[];
    return rows.map(({ quotation_items, ...q }) => toQuotation(q, (quotation_items as Row[]) ?? []));
  }
  async getQuotation(id: string) {
    const row = check(await this.sb.from("quotations").select("*, quotation_items(*)").eq("id", id).maybeSingle()) as Row | null;
    if (!row) return null;
    const { quotation_items, ...q } = row;
    return toQuotation(q, (quotation_items as Row[]) ?? []);
  }
  async upsertQuotation(q: Quotation) {
    const row: Row = {
      id: q.id,
      quotation_no: q.quotation_no,
      seq: q.seq,
      company_id: q.company_id,
      company_snapshot: q.company_snapshot,
      quotation_date: q.quotation_date,
      valid_until: q.valid_until || null,
      reference: q.reference,
      subject: q.subject,
      customer_name: q.customer.name,
      customer_contact_person: q.customer.contact_person,
      customer_address: q.customer.address,
      customer_phone: q.customer.phone,
      customer_email: q.customer.email,
      customer_gstin: q.customer.gstin,
      delivery_address: q.customer.delivery_address,
      tax_mode: q.tax_mode,
      terms_conditions: q.terms_conditions,
      notes: q.notes,
      ...q.totals,
      status: q.status,
    };
    check(await this.sb.from("quotations").upsert(row), "quotation_no");
    check(await this.sb.from("quotation_items").delete().eq("quotation_id", q.id));
    if (q.items.length)
      check(await this.sb.from("quotation_items").insert(q.items.map((it, i) => itemRow(q.id, it, i))));
    return (await this.getQuotation(q.id)) ?? q;
  }
  async removeQuotation(id: string) {
    check(await this.sb.from("quotations").delete().eq("id", id));
  }

  async reserveSequence(companyId: string) {
    return Number(check(await this.sb.rpc("next_quotation_seq", { p_company_id: companyId })));
  }

  async usage(): Promise<Usage> {
    const [qs, items] = await Promise.all([
      this.sb.from("quotations").select("company_id"),
      this.sb.from("quotation_items").select("material_id, unit_id"),
    ]);
    const u: Usage = { companyIds: new Set(), materialIds: new Set(), unitIds: new Set() };
    for (const r of check(qs) as Row[]) u.companyIds.add(r.company_id as string);
    for (const r of check(items) as Row[]) {
      if (r.material_id) u.materialIds.add(r.material_id as string);
      if (r.unit_id) u.unitIds.add(r.unit_id as string);
    }
    return u;
  }
}
