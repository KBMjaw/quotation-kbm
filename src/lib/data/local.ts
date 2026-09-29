import { DEFAULT_SETTINGS, SEED_COMPANIES, SEED_MATERIALS, SEED_UNITS } from "../defaults";
import { computeTotals } from "../tax";
import type { Company, Material, Quotation, QuotationSettings, UnitType } from "../types";
import type { Backend, Usage } from "./backend";
import { newId } from "./repo";

interface DB {
  version: 1;
  companies: Company[];
  units: UnitType[];
  materials: Material[];
  settings: QuotationSettings;
  quotations: Quotation[];
}

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "kipipl-quotation-maker:v1";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const norm = (s: string) => s.trim().toLowerCase();

/** Adds any missing seed records without duplicating existing ones (matched by name / code). */
export function seed(db: DB): DB {
  const ts = new Date().toISOString();
  for (const u of SEED_UNITS) {
    if (!db.units.some((x) => norm(x.code) === norm(u.code) || norm(x.name) === norm(u.name)))
      db.units.push({ ...u, id: newId(), created_at: ts, updated_at: ts });
  }
  const unitByCode = (code: string) => db.units.find((u) => norm(u.code) === norm(code))?.id;
  for (const { default_unit, units, ...m } of SEED_MATERIALS) {
    if (db.materials.some((x) => norm(x.name) === norm(m.name))) continue;
    const unit_ids = units.map(unitByCode).filter(Boolean) as string[];
    db.materials.push({ ...m, id: newId(), default_unit_id: unitByCode(default_unit) ?? null, unit_ids, created_at: ts, updated_at: ts });
  }
  for (const c of SEED_COMPANIES) {
    const existing = db.companies.find((x) => norm(x.company_name) === norm(c.company_name));
    // Fill a known GSTIN only if the admin hasn't entered one; never overwrite.
    if (existing) {
      if (!existing.gstin?.trim() && c.gstin) existing.gstin = c.gstin;
      continue;
    }
    db.companies.push({ ...clone(c), id: newId(), created_at: ts, updated_at: ts } as Company);
  }
  db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  return upgrade(db);
}

/** Brings data saved by earlier versions up to the current shape. */
function upgrade(db: DB): DB {
  for (const m of db.materials) {
    if (m.tax_type == null) m.tax_type = "GST";
    if (m.gst_rate == null) {
      const seeded = SEED_MATERIALS.find((x) => norm(x.name) === norm(m.name));
      m.gst_rate = seeded?.gst_rate ?? db.settings.default_gst_rate ?? 0;
    }
  }
  for (const q of db.quotations) {
    for (const it of q.items) if (it.gst_overridden == null) it.gst_overridden = false;
    if (!q.totals.gst_summary) q.totals = computeTotals(q.items, q.tax_mode, db.settings.round_off_total);
  }
  return db;
}

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Browser storage backend (localStorage). Data stays on this device. */
export class LocalBackend implements Backend {
  mode = "local" as const;
  private cache: DB | null = null;

  constructor(private kv: KV) {}

  private load(): DB {
    if (this.cache) return this.cache;
    let db: DB | null = null;
    try {
      const raw = this.kv.getItem(KEY);
      if (raw) db = JSON.parse(raw);
    } catch {
      db = null;
    }
    const fresh = !db;
    db = seed(db ?? { version: 1, companies: [], units: [], materials: [], settings: { ...DEFAULT_SETTINGS }, quotations: [] });
    this.cache = db;
    if (fresh) this.persist();
    return db;
  }

  private persist() {
    try {
      this.kv.setItem(KEY, JSON.stringify(this.cache));
    } catch (e) {
      throw new Error(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "Browser storage is full. Use a smaller logo or connect Supabase."
          : "Could not save to browser storage.",
      );
    }
  }

  private upsert<K extends "companies" | "units" | "materials" | "quotations">(key: K, rec: DB[K][number]) {
    const db = this.load();
    const list = db[key] as { id: string }[];
    const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list[i] = rec;
    else list.push(rec);
    this.persist();
    return clone(rec);
  }

  private remove(key: "companies" | "units" | "materials" | "quotations", id: string) {
    const db = this.load();
    (db[key] as { id: string }[]) = (db[key] as { id: string }[]).filter((x) => x.id !== id);
    this.persist();
  }

  async listCompanies() { return clone(this.load().companies); }
  async upsertCompany(c: Company) { return this.upsert("companies", c); }
  async removeCompany(id: string) { this.remove("companies", id); }
  async uploadLogo(_companyId: string, png: Blob) { return blobToDataURL(png); }

  async listUnits() { return clone(this.load().units); }
  async upsertUnit(u: UnitType) { return this.upsert("units", u); }
  async removeUnit(id: string) { this.remove("units", id); }

  async listMaterials() { return clone(this.load().materials); }
  async upsertMaterial(m: Material) { return this.upsert("materials", m); }
  async removeMaterial(id: string) { this.remove("materials", id); }

  async getSettings() { return clone(this.load().settings); }
  async putSettings(s: QuotationSettings) {
    this.load().settings = clone(s);
    this.persist();
    return clone(s);
  }

  async listQuotations() { return clone(this.load().quotations); }
  async getQuotation(id: string) {
    const q = this.load().quotations.find((x) => x.id === id);
    return q ? clone(q) : null;
  }
  async upsertQuotation(q: Quotation) { return this.upsert("quotations", q); }
  async removeQuotation(id: string) { this.remove("quotations", id); }

  async reserveSequence(companyId: string) {
    const c = this.load().companies.find((x) => x.id === companyId);
    if (!c) throw new Error("Company not found");
    const seq = c.next_number;
    c.next_number = seq + 1;
    this.persist();
    return seq;
  }

  async usage(): Promise<Usage> {
    const u: Usage = { companyIds: new Set(), materialIds: new Set(), unitIds: new Set() };
    for (const q of this.load().quotations) {
      u.companyIds.add(q.company_id);
      for (const it of q.items) {
        if (it.material_id) u.materialIds.add(it.material_id);
        if (it.unit_id) u.unitIds.add(it.unit_id);
      }
    }
    return u;
  }
}
