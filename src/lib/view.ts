import { computeTotals } from "./calc";
import type { Company, Customer, QuotationItem, QuotationSettings, TaxMode, Totals } from "./types";

/** Everything needed to render a quotation (HTML preview and PDF share this). */
export interface QuotationView {
  quotation_no: string;
  is_draft_number: boolean;
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
  company: Company;
  settings: QuotationSettings;
}

export function buildView(args: {
  quotation_no: string | null;
  previewNumber?: string;
  quotation_date: string;
  valid_until: string | null;
  reference: string;
  subject: string;
  customer: Customer;
  items: QuotationItem[];
  tax_mode: TaxMode;
  terms_conditions: string;
  notes: string;
  company: Company;
  settings: QuotationSettings;
}): QuotationView {
  return {
    ...args,
    quotation_no: args.quotation_no ?? args.previewNumber ?? "DRAFT",
    is_draft_number: !args.quotation_no,
    totals: computeTotals(args.items, args.tax_mode, args.settings.round_off_total),
  };
}

export function companyAddressLines(c: Company): string[] {
  const cityLine = [c.city, c.district].filter(Boolean).join(", ");
  const stateLine = [c.state, c.pincode].filter(Boolean).join(" - ");
  return [
    [c.address_line1, c.address_line2].filter(Boolean).join(", "),
    [c.area, cityLine].filter(Boolean).join(", "),
    stateLine,
  ].filter(Boolean);
}

export function companyContactLine(c: Company): string {
  return [c.phone && `Ph: ${c.phone}`, c.email && `Email: ${c.email}`, c.website].filter(Boolean).join("  |  ");
}

export function companyTaxLine(c: Company): string {
  return [c.gstin && `GSTIN: ${c.gstin}`, c.pan && `PAN: ${c.pan}`].filter(Boolean).join("  |  ");
}

export const companyTitle = (c: Company) => (c.display_name || c.company_name).trim();

/** Short monogram used when a company has no logo */
export const monogram = (c: Company) =>
  (c.quotation_prefix ||
    c.company_name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
  )
    .toUpperCase()
    .slice(0, 6);

export const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);

export const termsFor = (v: Pick<QuotationView, "terms_conditions" | "company" | "settings">) =>
  v.terms_conditions.trim() || v.company.terms_conditions.trim() || v.settings.default_terms.trim();

export const footerFor = (v: Pick<QuotationView, "company" | "settings">) =>
  v.company.footer_text.trim() || v.settings.default_footer.trim();

export const hasBankDetails = (c: Company) => Object.values(c.bank_details ?? {}).some((x) => String(x).trim());
