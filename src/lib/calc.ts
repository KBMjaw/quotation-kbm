import type { UnitType } from "./types";
import { round2 } from "./tax";

export { computeTotals, lineAmounts, round2, type LineAmounts } from "./tax";

const inrFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** 123456.5 -> "1,23,456.50" */
export const formatAmount = (n: number) => inrFormatter.format(n || 0);
/** 123456.5 -> "₹1,23,456.50" */
export const formatINR = (n: number) => `₹${formatAmount(n)}`;
export const formatQty = (n: number) => qtyFormatter.format(n || 0);
export const formatPct = (n: number) => `${Number((n || 0).toFixed(2))}%`;

/** "2026-09-29" -> "29-09-2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "MT (Metric Tons)"; just "Unit" when code and name are the same word */
export function unitLabel(u: Pick<UnitType, "name" | "code">): string {
  if (!u.code) return u.name;
  if (!u.name || u.name.toLowerCase() === u.code.toLowerCase()) return u.code;
  return `${u.code} (${u.name})`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering system (lakh / crore) */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** 73160.5 -> "Indian Rupees Seventy Three Thousand One Hundred Sixty and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const safe = Math.max(0, round2(amount || 0));
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  let words = `Indian Rupees ${integerToWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}
