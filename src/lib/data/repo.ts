import { computeTotals, materialGstRate, round2 } from "../tax";
import { formatQuotationNumber } from "../numbering";
import type {
  Company,
  CompanyInput,
  Material,
  MaterialInput,
  Quotation,
  QuotationInput,
  QuotationItem,
  QuotationSettings,
  UnitInput,
  UnitType,
} from "../types";
import {
  ValidationError,
  hasErrors,
  validateCompany,
  validateMaterial,
  validateQuotation,
  validateSettings,
  validateUnit,
} from "../validation";
import type { Backend } from "./backend";

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const now = () => new Date().toISOString();

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export class InUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InUseError";
  }
}

/** Business rules on top of a storage backend. */
export class Repo {
  constructor(private b: Backend) {}

  get mode() {
    return this.b.mode;
  }

  /* ---------------- Companies ---------------- */

  async listCompanies() {
    return (await this.b.listCompanies()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async saveCompany(input: CompanyInput): Promise<Company> {
    const existing = await this.b.listCompanies();
    const clean: CompanyInput = {
      ...input,
      company_name: input.company_name.trim(),
      display_name: input.display_name.trim(),
      quotation_prefix: input.quotation_prefix.trim().toUpperCase(),
      gstin: input.gstin.trim().toUpperCase(),
      pan: input.pan.trim().toUpperCase(),
      email: input.email.trim(),
    };
    const errors = validateCompany(clean, existing);
    if (hasErrors(errors)) throw new ValidationError(errors);
    const prev = clean.id ? existing.find((c) => c.id === clean.id) : undefined;
    const ts = now();
    return this.b.upsertCompany({
      ...clean,
      id: prev?.id ?? clean.id ?? newId(),
      created_at: prev?.created_at ?? ts,
      updated_at: ts,
    } as Company);
  }

  async deleteCompany(id: string) {
    const usage = await this.b.usage();
    if (usage.companyIds.has(id))
      throw new InUseError("This company has quotations. Mark it inactive instead of deleting it.");
    await this.b.removeCompany(id);
  }

  uploadLogo(companyId: string, png: Blob) {
    return this.b.uploadLogo(companyId, png);
  }

  /* ---------------- Units ---------------- */

  async listUnits() {
    return (await this.b.listUnits()).sort(byName);
  }

  async saveUnit(input: UnitInput): Promise<UnitType> {
    const existing = await this.b.listUnits();
    const clean = { ...input, name: input.name.trim(), code: input.code.trim().toUpperCase() };
    const errors = validateUnit(clean, existing);
    if (hasErrors(errors)) throw new ValidationError(errors);
    const prev = clean.id ? existing.find((u) => u.id === clean.id) : undefined;
    const ts = now();
    return this.b.upsertUnit({ ...clean, id: prev?.id ?? newId(), created_at: prev?.created_at ?? ts, updated_at: ts });
  }

  async deleteUnit(id: string) {
    const [usage, materials] = await Promise.all([this.b.usage(), this.b.listMaterials()]);
    if (usage.unitIds.has(id)) throw new InUseError("This unit is used in quotations. Disable it instead.");
    const m = materials.find((m) => m.default_unit_id === id || m.unit_ids.includes(id));
    if (m) throw new InUseError(`This unit is used by the material "${m.name}". Disable it instead.`);
    await this.b.removeUnit(id);
  }

  /* ---------------- Materials ---------------- */

  async listMaterials() {
    return (await this.b.listMaterials()).sort(byName);
  }

  async saveMaterial(input: MaterialInput): Promise<Material> {
    const [existing, units] = await Promise.all([this.b.listMaterials(), this.b.listUnits()]);
    const unit_ids = [...new Set(input.unit_ids)];
    const default_unit_id = input.default_unit_id || (unit_ids.length ? unit_ids[0] : null);
    const clean: MaterialInput = {
      ...input,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim(),
      hsn_code: input.hsn_code.trim(),
      tax_type: input.tax_type === "EXEMPT" ? "EXEMPT" : "GST",
      gst_rate: input.tax_type === "EXEMPT" ? 0 : round2(Number(input.gst_rate)),
      // The default unit is always one of the available units.
      unit_ids: default_unit_id && unit_ids.length && !unit_ids.includes(default_unit_id) ? [default_unit_id, ...unit_ids] : unit_ids,
      default_unit_id,
    };
    const errors = validateMaterial(clean, existing, units);
    if (hasErrors(errors)) throw new ValidationError(errors);
    const prev = clean.id ? existing.find((m) => m.id === clean.id) : undefined;
    const ts = now();
    return this.b.upsertMaterial({ ...clean, id: prev?.id ?? newId(), created_at: prev?.created_at ?? ts, updated_at: ts });
  }

  async deleteMaterial(id: string) {
    const usage = await this.b.usage();
    if (usage.materialIds.has(id)) throw new InUseError("This material is used in quotations. Mark it inactive instead.");
    await this.b.removeMaterial(id);
  }

  /* ---------------- Settings ---------------- */

  getSettings() {
    return this.b.getSettings();
  }

  async saveSettings(s: QuotationSettings) {
    const errors = validateSettings(s);
    if (hasErrors(errors)) throw new ValidationError(errors);
    return this.b.putSettings(s);
  }

  /* ---------------- Quotations ---------------- */

  async listQuotations() {
    return (await this.b.listQuotations()).sort((a, b) =>
      (b.quotation_date + b.created_at).localeCompare(a.quotation_date + a.created_at),
    );
  }

  getQuotation(id: string) {
    return this.b.getQuotation(id);
  }

  /** Next number the company *would* get (for previews; not reserved). */
  async previewNumber(company: Company, dateISO: string) {
    const s = await this.b.getSettings();
    return formatQuotationNumber(s.number_format, company.quotation_prefix, company.next_number, s.seq_padding, dateISO);
  }

  /**
   * Saves a quotation. Line GST comes from configuration, not from the form:
   *  - a normal line uses the material's configured GST rate, or the rate it was previously
   *    saved with (so old quotations keep the GST that applied when they were created);
   *  - an overridden rate is accepted only from users allowed to override GST
   *    (an override saved earlier by such a user is preserved on later edits).
   */
  async saveQuotation(input: QuotationInput, opts: { canOverrideGst?: boolean } = {}): Promise<Quotation> {
    const [companies, materials, settings] = await Promise.all([
      this.b.listCompanies(),
      this.b.listMaterials(),
      this.b.getSettings(),
    ]);
    const prev = input.id ? await this.b.getQuotation(input.id) : null;

    const errors = validateQuotation(input, {
      activeCompanyIds: new Set(companies.filter((c) => c.is_active).map((c) => c.id)),
      activeMaterialIds: new Set(materials.filter((m) => m.is_active).map((m) => m.id)),
      previousMaterialIds: new Set((prev?.items ?? []).map((i) => i.material_id).filter(Boolean) as string[]),
      previousCompanyId: prev?.company_id,
    });
    if (hasErrors(errors)) throw new ValidationError(errors);

    const gstErrors: Record<string, string> = {};
    const items = input.items.map((it, i) =>
      resolveLineGst(it, materials, prev?.items.find((p) => p.id === it.id), !!opts.canOverrideGst, (msg) => {
        gstErrors[`items.${i}.gst`] = msg;
      }),
    );
    if (hasErrors(gstErrors)) throw new ValidationError(gstErrors);

    const company = companies.find((c) => c.id === input.company_id);
    if (!company) throw new ValidationError({ company_id: "Company not found" });

    // Keep the existing number unless the quotation moved to another company.
    let quotation_no = prev?.quotation_no ?? null;
    let seq = prev?.seq ?? null;
    if (!prev || prev.company_id !== input.company_id || !quotation_no) {
      seq = await this.b.reserveSequence(company.id);
      quotation_no = formatQuotationNumber(
        settings.number_format,
        company.quotation_prefix,
        seq,
        settings.seq_padding,
        input.quotation_date,
      );
    }

    const ts = now();
    const q: Quotation = {
      ...input,
      id: prev?.id ?? input.id ?? newId(),
      quotation_no,
      seq,
      company_snapshot: { ...company, next_number: company.next_number },
      items: items.map((it) => ({ ...it, id: it.id || newId() })),
      totals: computeTotals(items, input.tax_mode, settings.round_off_total),
      created_at: prev?.created_at ?? ts,
      updated_at: ts,
    };
    return this.b.upsertQuotation(q);
  }

  deleteQuotation(id: string) {
    return this.b.removeQuotation(id);
  }
}

function resolveLineGst(
  it: QuotationItem,
  materials: Material[],
  prevLine: QuotationItem | undefined,
  canOverride: boolean,
  fail: (msg: string) => void,
): QuotationItem {
  const material = materials.find((m) => m.id === it.material_id);
  const sameAsSaved = !!prevLine && prevLine.material_id === it.material_id;

  if (it.gst_overridden) {
    const unchanged = sameAsSaved && prevLine!.gst_overridden && prevLine!.gst_rate === it.gst_rate;
    if (!canOverride && !unchanged) fail("Only authorised users can override GST");
    return it;
  }
  // Material deleted since the line was saved: keep what was saved.
  if (!material) return { ...it, gst_rate: sameAsSaved ? prevLine!.gst_rate : it.gst_rate };

  const current = materialGstRate(material);
  const saved = sameAsSaved && !prevLine!.gst_overridden ? prevLine!.gst_rate : undefined;
  // Accept the saved rate (historical) or the current configured rate; anything else is reset.
  const gst_rate = it.gst_rate === saved || it.gst_rate === current ? it.gst_rate : current;
  return { ...it, gst_rate, gst_overridden: false };
}
