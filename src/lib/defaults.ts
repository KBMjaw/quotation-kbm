import { DEFAULT_NUMBER_FORMAT } from "./numbering";
import type { BankDetails, CompanyInput, Customer, MaterialInput, QuotationSettings, UnitInput } from "./types";

export const emptyBank = (): BankDetails => ({ bank_name: "", account_name: "", account_number: "", ifsc: "", branch: "" });

export const emptyCustomer = (): Customer => ({
  name: "",
  contact_person: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  delivery_address: "",
});

export const DEFAULT_TERMS = [
  "Prices are ex-works / at site as mentioned above and subject to change without prior notice.",
  "GST as applicable at the time of supply.",
  "Payment: 100% advance or as mutually agreed.",
  "Delivery subject to availability of material and vehicle.",
  "This quotation is valid for the period mentioned above.",
].join("\n");

export const DEFAULT_SETTINGS: QuotationSettings = {
  number_format: DEFAULT_NUMBER_FORMAT,
  seq_padding: 4,
  default_gst_rate: 5,
  default_tax_mode: "CGST_SGST",
  default_validity_days: 15,
  default_terms: DEFAULT_TERMS,
  default_footer: "This is a computer generated quotation.",
  show_amount_in_words: true,
  show_bank_details: true,
  round_off_total: true,
  admin_pin_hash: null,
};

export const emptyCompany = (): CompanyInput => ({
  company_name: "",
  display_name: "",
  address_line1: "",
  address_line2: "",
  area: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  pan: "",
  logo_url: null,
  brand_color: "#1F3A93",
  quotation_prefix: "",
  next_number: 1,
  additional_info: "",
  footer_text: "",
  terms_conditions: "",
  bank_details: emptyBank(),
  is_active: true,
});

/* ---------- Initial data (inserted only when missing) ---------- */

export const SEED_UNITS: UnitInput[] = [
  { name: "Piece", code: "PCS", is_active: true },
  { name: "Cubic Meter", code: "M3", is_active: true },
  { name: "Unit", code: "UNIT", is_active: true },
  { name: "Metric Tons", code: "MT", is_active: true },
];

/** Materials reference units by code; resolved to ids when seeding */
export const SEED_MATERIALS: (Omit<MaterialInput, "default_unit_id" | "unit_ids"> & { default_unit: string; units: string[] })[] = [
  { name: "Flyash", code: "FLYASH", description: "Flyash", hsn_code: "2621", default_rate: null, gst_rate: 5, tax_type: "GST", default_unit: "MT", units: ["MT", "M3"], is_active: true },
  { name: "P Sand Dry", code: "PSAND-DRY", description: "P Sand Dry", hsn_code: "2517", default_rate: null, gst_rate: 5, tax_type: "GST", default_unit: "M3", units: ["M3", "MT", "UNIT"], is_active: true },
];

export const SEED_COMPANIES: CompanyInput[] = [
  {
    ...emptyCompany(),
    company_name: "Kannan Blue Metals",
    display_name: "KANNAN BLUE METALS",
    gstin: "33ACCPC2634C1ZI",
    quotation_prefix: "KBM",
    brand_color: "#1F3A93",
  },
  // GSTIN intentionally blank until the administrator enters it.
  { ...emptyCompany(), company_name: "Kannan Ready Mix Concrete", display_name: "KANNAN READY MIX CONCRETE", quotation_prefix: "KRMC", brand_color: "#B45309" },
  {
    ...emptyCompany(),
    company_name: "Kannan Infra Projects India Private Limited",
    display_name: "KANNAN INFRA PROJECTS INDIA PRIVATE LIMITED",
    gstin: "33AAJCK1677M1Z4",
    quotation_prefix: "KIPIPL",
    brand_color: "#0F766E",
  },
];
