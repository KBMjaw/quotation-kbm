import type { Company, Material, Quotation, QuotationSettings, UnitType } from "../types";

export interface Usage {
  companyIds: Set<string>;
  materialIds: Set<string>;
  unitIds: Set<string>;
}

/** Storage primitives. Business rules live in Repo (repo.ts). */
export interface Backend {
  mode: "local" | "supabase";

  listCompanies(): Promise<Company[]>;
  upsertCompany(c: Company): Promise<Company>;
  removeCompany(id: string): Promise<void>;
  /** Stores a PNG logo and returns a URL usable in <img> and the PDF */
  uploadLogo(companyId: string, png: Blob): Promise<string>;

  listUnits(): Promise<UnitType[]>;
  upsertUnit(u: UnitType): Promise<UnitType>;
  removeUnit(id: string): Promise<void>;

  listMaterials(): Promise<Material[]>;
  upsertMaterial(m: Material): Promise<Material>;
  removeMaterial(id: string): Promise<void>;

  getSettings(): Promise<QuotationSettings>;
  putSettings(s: QuotationSettings): Promise<QuotationSettings>;

  listQuotations(): Promise<Quotation[]>;
  getQuotation(id: string): Promise<Quotation | null>;
  upsertQuotation(q: Quotation): Promise<Quotation>;
  removeQuotation(id: string): Promise<void>;

  /** Atomically returns the company's next sequence number and increments it */
  reserveSequence(companyId: string): Promise<number>;
  /** Ids referenced by saved quotations (used to guard deletes) */
  usage(): Promise<Usage>;
}
