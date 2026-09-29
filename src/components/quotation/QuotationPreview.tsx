"use client";

import { amountInWords, formatAmount, formatDate, formatPct, formatQty, lineAmounts } from "@/lib/calc";
import { GstSummaryTable } from "./GstSummaryTable";
import {
  companyAddressLines,
  companyContactLine,
  companyTaxLine,
  companyTitle,
  footerFor,
  hasBankDetails,
  monogram,
  splitLines,
  termsFor,
  type QuotationView,
} from "@/lib/view";

export function CompanyLogo({ company, size = 64 }: { company: QuotationView["company"]; size?: number }) {
  const brand = company.brand_color || "#1F3A93";
  if (company.logo_url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={company.logo_url} alt={`${company.company_name} logo`} style={{ maxWidth: size, maxHeight: size }} className="object-contain" />;
  const m = monogram(company);
  return (
    <span
      className="flex items-center justify-center rounded-lg font-bold text-white"
      style={{ width: size * 0.9, height: size * 0.9, background: brand, fontSize: m.length > 4 ? size * 0.17 : size * 0.24 }}
    >
      {m}
    </span>
  );
}

/** A4-proportioned HTML preview. Mirrors the PDF layout. */
export function QuotationPreview({ v }: { v: QuotationView }) {
  const c = v.company;
  const brand = c.brand_color || "#1F3A93";
  const showDisc = v.items.some((i) => i.discount_pct > 0);
  const showGst = v.tax_mode !== "NONE";
  const showHsn = v.items.some((i) => i.hsn_code.trim());
  const title = companyTitle(c);
  const terms = splitLines(termsFor(v));

  return (
    <div className="overflow-x-auto rounded-lg bg-slate-200/70 p-2 sm:p-6">
      <article className="relative mx-auto min-h-[900px] w-full min-w-[640px] max-w-[794px] bg-white px-9 py-8 text-[12px] leading-snug text-slate-900 shadow-lg">
        {v.is_draft_number && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <span className="-rotate-30 text-[110px] font-bold text-slate-100 select-none">DRAFT</span>
          </div>
        )}
        <div className="relative">
          <header className="flex items-center gap-4 border-b-2 pb-3" style={{ borderColor: brand }}>
            <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center">
              <CompanyLogo company={c} size={80} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[20px] leading-tight font-bold" style={{ color: brand }}>
                {title}
              </h1>
              {c.company_name.trim().toLowerCase() !== title.toLowerCase() && <p className="text-[11px] text-slate-500">{c.company_name}</p>}
              {companyAddressLines(c).map((l, i) => (
                <p key={i} className="text-[11px] text-slate-600">{l}</p>
              ))}
              {companyContactLine(c) && <p className="text-[11px] text-slate-600">{companyContactLine(c)}</p>}
              {companyTaxLine(c) && <p className="text-[11px] font-semibold">{companyTaxLine(c)}</p>}
              {c.additional_info.trim() && <p className="text-[11px] text-slate-600">{c.additional_info}</p>}
            </div>
          </header>

          <div className="my-4 flex flex-col items-center">
            <h2 className="text-[17px] font-bold tracking-[0.3em]">QUOTATION</h2>
            <span className="mt-1 h-0.5 w-20" style={{ background: brand }} />
          </div>

          <div className="mb-3 grid grid-cols-[1.45fr_1fr] gap-3">
            <div className="rounded border border-slate-300 p-2.5">
              <p className="mb-1 text-[9px] font-bold tracking-wider text-slate-500">BILL TO</p>
              <p className="text-[13px] font-bold">{v.customer.name || <span className="text-slate-300">Customer name</span>}</p>
              {v.customer.contact_person && <p>Attn: {v.customer.contact_person}</p>}
              {v.customer.address && <p className="whitespace-pre-line text-slate-700">{v.customer.address}</p>}
              {(v.customer.phone || v.customer.email) && (
                <p className="text-slate-700">{[v.customer.phone && `Ph: ${v.customer.phone}`, v.customer.email].filter(Boolean).join("  |  ")}</p>
              )}
              {v.customer.gstin && <p className="font-semibold">GSTIN: {v.customer.gstin}</p>}
              {v.customer.delivery_address && (
                <div className="mt-1.5">
                  <p className="text-[9px] font-bold tracking-wider text-slate-500">DELIVERY ADDRESS</p>
                  <p className="whitespace-pre-line text-slate-700">{v.customer.delivery_address}</p>
                </div>
              )}
            </div>
            <div className="rounded border border-slate-300 p-2.5">
              <p className="mb-1 text-[9px] font-bold tracking-wider text-slate-500">QUOTATION DETAILS</p>
              <MetaRow k="Quotation No" v={v.quotation_no} />
              <MetaRow k="Date" v={formatDate(v.quotation_date)} />
              {v.valid_until && <MetaRow k="Valid Until" v={formatDate(v.valid_until)} />}
              {v.reference && <MetaRow k="Reference" v={v.reference} />}
            </div>
          </div>

          {v.subject && (
            <p className="mb-2">
              <b>Subject: </b>
              {v.subject}
            </p>
          )}

          <table className="w-full border-collapse text-[10.5px]" data-testid="preview-items">
            <thead>
              <tr className="text-white" style={{ background: brand }}>
                <th className="w-7 px-1 py-1.5 text-center">S.No</th>
                <th className="px-1.5 py-1.5 text-left">Product</th>
                <th className="w-14 px-1.5 py-1.5 text-right">Qty</th>
                <th className="w-11 px-1 py-1.5 text-center">Unit</th>
                <th className="w-[70px] px-1.5 py-1.5 text-right">Rate</th>
                {showDisc && <th className="w-11 px-1.5 py-1.5 text-right">Disc.</th>}
                <th className="w-20 px-1.5 py-1.5 text-right">{showGst ? "Taxable Value" : "Amount"}</th>
                {showGst && <th className="w-11 px-1.5 py-1.5 text-right">GST %</th>}
                {showGst && <th className="w-[70px] px-1.5 py-1.5 text-right">GST Amt</th>}
                {showGst && <th className="w-20 px-1.5 py-1.5 text-right">Total</th>}
              </tr>
            </thead>
            <tbody>
              {v.items.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-slate-400">No materials added yet</td>
                </tr>
              )}
              {v.items.map((it, i) => {
                const a = lineAmounts(it, v.tax_mode);
                const desc = it.description.trim().toLowerCase() !== it.material_name.trim().toLowerCase() ? it.description.trim() : "";
                return (
                  <tr key={it.id || i} className={i % 2 ? "bg-slate-50" : ""} style={{ borderBottom: "1px solid #cbd5e1" }}>
                    <td className="px-1 py-1.5 text-center align-top">{i + 1}</td>
                    <td className="px-1.5 py-1.5 align-top">
                      <b>{it.material_name || "—"}</b>
                      {desc && <div className="text-[9.5px] text-slate-500">{desc}</div>}
                      {showHsn && it.hsn_code && <div className="text-[9.5px] text-slate-500">HSN: {it.hsn_code}</div>}
                    </td>
                    <td className="px-1.5 py-1.5 text-right align-top">{formatQty(it.quantity)}</td>
                    <td className="px-1 py-1.5 text-center align-top">{it.unit_code}</td>
                    <td className="px-1.5 py-1.5 text-right align-top">{formatAmount(it.rate)}</td>
                    {showDisc && <td className="px-1.5 py-1.5 text-right align-top">{it.discount_pct ? formatPct(it.discount_pct) : "-"}</td>}
                    <td className="px-1.5 py-1.5 text-right align-top">{formatAmount(a.taxable)}</td>
                    {showGst && <td className="px-1.5 py-1.5 text-right align-top">{formatPct(it.gst_rate)}</td>}
                    {showGst && <td className="px-1.5 py-1.5 text-right align-top">{formatAmount(a.tax)}</td>}
                    {showGst && <td className="px-1.5 py-1.5 text-right align-top font-semibold">{formatAmount(a.total)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 flex gap-4">
            <div className="min-w-0 flex-1 space-y-2.5">
              {showGst && v.totals.gst_summary.length > 0 && (
                <div>
                  <p className="mb-0.5 text-[9px] font-bold tracking-wider text-slate-500">GST SUMMARY</p>
                  <GstSummaryTable totals={v.totals} taxMode={v.tax_mode} />
                </div>
              )}
              {v.settings.show_amount_in_words && (
                <div>
                  <p className="text-[9px] font-bold tracking-wider text-slate-500">AMOUNT IN WORDS</p>
                  <p className="font-semibold">{amountInWords(v.totals.grand_total)}</p>
                </div>
              )}
              {v.settings.show_bank_details && hasBankDetails(c) && (
                <div className="rounded border border-slate-300 p-2.5 text-[11px]">
                  <p className="mb-1 text-[9px] font-bold tracking-wider text-slate-500">BANK DETAILS</p>
                  {c.bank_details.account_name && <p>A/c Name: {c.bank_details.account_name}</p>}
                  {c.bank_details.bank_name && <p>Bank: {c.bank_details.bank_name}</p>}
                  {c.bank_details.account_number && <p>A/c No: {c.bank_details.account_number}</p>}
                  {c.bank_details.ifsc && <p>IFSC: {c.bank_details.ifsc}</p>}
                  {c.bank_details.branch && <p>Branch: {c.bank_details.branch}</p>}
                </div>
              )}
            </div>
            <div className="w-[250px] shrink-0 text-[11.5px]">
              {v.totals.discount_total > 0 && <TotRow k="Sub Total" v={v.totals.subtotal} />}
              {v.totals.discount_total > 0 && <TotRow k="Less: Discount" v={-v.totals.discount_total} />}
              <TotRow k="Taxable Value" v={v.totals.taxable_total} />
              {v.totals.tax_lines.map((t, i) => (
                <TotRow key={i} k={`${t.label} @ ${formatPct(t.rate)}`} v={t.amount} />
              ))}
              {showGst && <TotRow k="Total GST" v={v.totals.tax_total} bold />}
              {v.totals.round_off !== 0 && <TotRow k="Round Off" v={v.totals.round_off} />}
              <div className="mt-1 flex justify-between rounded px-2 py-1.5 text-[13px] font-bold text-white" style={{ background: brand }}>
                <span>Grand Total</span>
                <span>₹ {formatAmount(v.totals.grand_total)}</span>
              </div>
            </div>
          </div>

          {terms.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 font-bold">Terms &amp; Conditions</p>
              <ol className="list-decimal space-y-0.5 pl-5 text-[11px] text-slate-700">
                {terms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          {v.notes.trim() && (
            <div className="mt-3">
              <p className="mb-1 font-bold">Notes</p>
              <p className="whitespace-pre-line text-[11px] text-slate-700">{v.notes}</p>
            </div>
          )}

          <div className="mt-8 flex items-end justify-between">
            <div className="w-52 border-t border-slate-800 pt-1 text-[11px] text-slate-500">Customer Acceptance</div>
            <div className="w-56 text-center">
              <p className="font-bold">For {title}</p>
              <div className="mt-10 border-t border-slate-800 pt-1 text-[11px]">Authorised Signatory</div>
            </div>
          </div>

          <footer className="mt-8 flex justify-between border-t border-slate-300 pt-1.5 text-[10px] text-slate-500">
            <span>{footerFor(v)}</span>
            <span>{v.quotation_no}</span>
          </footer>
        </div>
      </article>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-semibold break-all">{v}</span>
    </div>
  );
}

function TotRow({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between px-2 py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-500">{k}</span>
      <span>{v < 0 ? `- ${formatAmount(-v)}` : formatAmount(v)}</span>
    </div>
  );
}
