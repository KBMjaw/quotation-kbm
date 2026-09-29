import type { CompanyInput, Company, Material, MaterialInput, QuotationInput, UnitInput, UnitType, QuotationSettings } from "./types";

export type Errors = Record<string, string>;

export class ValidationError extends Error {
  constructor(public errors: Errors) {
    super(Object.values(errors)[0] ?? "Validation failed");
    this.name = "ValidationError";
  }
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PIN = /^[1-9][0-9]{5}$/;

export function validateCompany(input: CompanyInput, existing: Company[]): Errors {
  const e: Errors = {};
  if (!input.company_name.trim()) e.company_name = "Company name is required";
  else if (existing.some((c) => c.id !== input.id && norm(c.company_name) === norm(input.company_name)))
    e.company_name = "A company with this name already exists";
  if (!input.quotation_prefix.trim()) e.quotation_prefix = "Quotation prefix is required";
  else if (!/^[A-Za-z0-9/-]{1,12}$/.test(input.quotation_prefix.trim()))
    e.quotation_prefix = "Use up to 12 letters, digits, - or /";
  if (!Number.isInteger(input.next_number) || input.next_number < 1) e.next_number = "Must be a whole number ≥ 1";
  if (input.email.trim() && !EMAIL.test(input.email.trim())) e.email = "Enter a valid email";
  if (input.gstin.trim() && !GSTIN.test(input.gstin.trim().toUpperCase())) e.gstin = "Enter a valid 15-character GSTIN";
  if (input.pan.trim() && !PAN.test(input.pan.trim().toUpperCase())) e.pan = "Enter a valid 10-character PAN";
  if (input.pincode.trim() && !PIN.test(input.pincode.trim())) e.pincode = "Enter a valid 6-digit PIN code";
  if (input.brand_color && !/^#[0-9a-fA-F]{6}$/.test(input.brand_color)) e.brand_color = "Use a hex colour like #1F3A93";
  return e;
}

export function validateUnit(input: UnitInput, existing: UnitType[]): Errors {
  const e: Errors = {};
  if (!input.name.trim()) e.name = "Unit name is required";
  else if (existing.some((u) => u.id !== input.id && norm(u.name) === norm(input.name)))
    e.name = "A unit with this name already exists";
  if (!input.code.trim()) e.code = "Short code is required";
  else if (existing.some((u) => u.id !== input.id && norm(u.code) === norm(input.code)))
    e.code = "A unit with this code already exists";
  return e;
}

export function validateMaterial(input: MaterialInput, existing: Material[], units: UnitType[]): Errors {
  const e: Errors = {};
  if (!input.name.trim()) e.name = "Material name is required";
  else if (existing.some((m) => m.id !== input.id && norm(m.name) === norm(input.name)))
    e.name = "A material with this name already exists";
  if (input.code.trim() && existing.some((m) => m.id !== input.id && norm(m.code) === norm(input.code)))
    e.code = "Another material already uses this code";
  const unitIds = new Set(units.map((u) => u.id));
  if (input.unit_ids.some((id) => !unitIds.has(id))) e.unit_ids = "Unknown unit selected";
  if (input.default_unit_id && input.unit_ids.length && !input.unit_ids.includes(input.default_unit_id))
    e.default_unit_id = "Default unit must be one of the available units";
  if (input.tax_type !== "EXEMPT" && (!Number.isFinite(input.gst_rate) || input.gst_rate < 0 || input.gst_rate > 100))
    e.gst_rate = "GST rate must be between 0 and 100";
  if (input.default_rate != null && (!Number.isFinite(input.default_rate) || input.default_rate < 0))
    e.default_rate = "Rate must be a valid number";
  return e;
}

export function validateSettings(s: QuotationSettings): Errors {
  const e: Errors = {};
  if (!s.number_format.includes("{SEQ}")) e.number_format = "Format must include {SEQ}";
  if (!Number.isInteger(s.seq_padding) || s.seq_padding < 1 || s.seq_padding > 10) e.seq_padding = "Between 1 and 10";
  if (!Number.isFinite(s.default_gst_rate) || s.default_gst_rate < 0 || s.default_gst_rate > 100)
    e.default_gst_rate = "Between 0 and 100";
  if (!Number.isInteger(s.default_validity_days) || s.default_validity_days < 0) e.default_validity_days = "Whole days ≥ 0";
  return e;
}

/**
 * Validates a quotation before saving. `activeMaterialIds` is used to block
 * inactive materials on *new* lines while letting existing lines keep them.
 */
export function validateQuotation(
  q: QuotationInput,
  opts: { activeMaterialIds: Set<string>; previousMaterialIds?: Set<string>; activeCompanyIds: Set<string>; previousCompanyId?: string },
): Errors {
  const e: Errors = {};
  if (!q.company_id) e.company_id = "Select a company";
  else if (!opts.activeCompanyIds.has(q.company_id) && q.company_id !== opts.previousCompanyId)
    e.company_id = "This company is inactive";
  if (!q.customer.name.trim()) e["customer.name"] = "Customer name is required";
  if (q.customer.email.trim() && !EMAIL.test(q.customer.email.trim())) e["customer.email"] = "Enter a valid email";
  if (q.customer.gstin.trim() && !GSTIN.test(q.customer.gstin.trim().toUpperCase()))
    e["customer.gstin"] = "Enter a valid 15-character GSTIN";
  if (!q.quotation_date) e.quotation_date = "Date is required";
  if (q.valid_until && q.quotation_date && q.valid_until < q.quotation_date) e.valid_until = "Must be on or after the quotation date";
  if (q.items.length === 0) e.items = "Add at least one material";
  q.items.forEach((it, i) => {
    const p = `items.${i}`;
    if (!it.material_name.trim()) e[`${p}.material`] = "Select a material";
    else if (
      it.material_id &&
      !opts.activeMaterialIds.has(it.material_id) &&
      !opts.previousMaterialIds?.has(it.material_id)
    )
      e[`${p}.material`] = "This material is inactive";
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) e[`${p}.quantity`] = "Quantity must be a positive number";
    if (!it.unit_code.trim()) e[`${p}.unit`] = "Select a unit";
    if (!Number.isFinite(it.rate) || it.rate < 0) e[`${p}.rate`] = "Rate must be a valid number";
    if (!Number.isFinite(it.discount_pct) || it.discount_pct < 0 || it.discount_pct > 100) e[`${p}.discount`] = "0–100";
    if (!Number.isFinite(it.gst_rate) || it.gst_rate < 0 || it.gst_rate > 100) e[`${p}.gst`] = "0–100";
  });
  return e;
}

export const hasErrors = (e: Errors) => Object.keys(e).length > 0;
