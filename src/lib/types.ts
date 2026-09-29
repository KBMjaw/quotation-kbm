export type ID = string;

export interface Timestamps {
  created_at: string;
  updated_at: string;
}

export interface UnitType extends Timestamps {
  id: ID;
  /** Full name, e.g. "Metric Tons" */
  name: string;
  /** Short code, e.g. "MT" */
  code: string;
  is_active: boolean;
}

/** GST = taxable at gst_rate; EXEMPT = always 0% (nil-rated / exempt supply) */
export type MaterialTaxType = "GST" | "EXEMPT";

export interface Material extends Timestamps {
  id: ID;
  name: string;
  code: string;
  description: string;
  hsn_code: string;
  default_unit_id: ID | null;
  /** Units this material can be quoted in. Empty = any active unit. */
  unit_ids: ID[];
  default_rate: number | null;
  /** Product-specific GST %, copied onto quotation lines when the material is picked */
  gst_rate: number;
  tax_type: MaterialTaxType;
  is_active: boolean;
}

export interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc: string;
  branch: string;
}

export interface Company extends Timestamps {
  id: ID;
  company_name: string;
  display_name: string;
  address_line1: string;
  address_line2: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  logo_url: string | null;
  brand_color: string;
  /** Used in quotation numbers, e.g. "KBM" -> KBM-QTN-0001 */
  quotation_prefix: string;
  /** Next sequence number that will be issued for this company */
  next_number: number;
  additional_info: string;
  footer_text: string;
  terms_conditions: string;
  bank_details: BankDetails;
  is_active: boolean;
}

export type TaxMode = "CGST_SGST" | "IGST" | "NONE";

export interface QuotationSettings {
  /** Tokens: {PREFIX} {SEQ} {YYYY} {YY} {MM} {FY} */
  number_format: string;
  seq_padding: number;
  default_gst_rate: number;
  default_tax_mode: TaxMode;
  default_validity_days: number;
  default_terms: string;
  default_footer: string;
  show_amount_in_words: boolean;
  show_bank_details: boolean;
  round_off_total: boolean;
  /** Local (browser) mode only: SHA-256 of the PIN that unlocks Settings */
  admin_pin_hash: string | null;
}

export interface Customer {
  name: string;
  contact_person: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  delivery_address: string;
}

export interface QuotationItem {
  id: ID;
  material_id: ID | null;
  /** Snapshot so the item still renders if the material is renamed/disabled */
  material_name: string;
  description: string;
  hsn_code: string;
  quantity: number;
  unit_id: ID | null;
  unit_code: string;
  unit_name: string;
  rate: number;
  discount_pct: number;
  /** GST % saved with the line; old quotations keep it even if the material's rate changes later */
  gst_rate: number;
  /** True when an authorised user replaced the material's configured GST rate */
  gst_overridden: boolean;
}

export interface TaxLine {
  label: string;
  rate: number;
  amount: number;
}

/** Taxable value and GST for one GST rate (CGST/SGST or IGST columns depend on the tax mode) */
export interface GstSummaryRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

export interface Totals {
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  tax_total: number;
  tax_lines: TaxLine[];
  gst_summary: GstSummaryRow[];
  round_off: number;
  grand_total: number;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected";

export interface Quotation extends Timestamps {
  id: ID;
  quotation_no: string | null;
  seq: number | null;
  company_id: ID;
  /** Company details as they were when the quotation was last saved */
  company_snapshot: Company | null;
  quotation_date: string;
  valid_until: string | null;
  reference: string;
  subject: string;
  customer: Customer;
  items: QuotationItem[];
  tax_mode: TaxMode;
  terms_conditions: string;
  notes: string;
  totals: Totals;
  status: QuotationStatus;
}

export type CompanyInput = Omit<Company, "id" | "created_at" | "updated_at"> & { id?: ID };
export type MaterialInput = Omit<Material, "id" | "created_at" | "updated_at"> & { id?: ID };
export type UnitInput = Omit<UnitType, "id" | "created_at" | "updated_at"> & { id?: ID };
export type QuotationInput = Omit<Quotation, "id" | "created_at" | "updated_at" | "quotation_no" | "seq" | "totals"> & {
  id?: ID;
  quotation_no?: string | null;
  seq?: number | null;
};
