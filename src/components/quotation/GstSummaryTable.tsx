import { formatAmount, formatPct } from "@/lib/calc";
import type { TaxMode, Totals } from "@/lib/types";
import { cx } from "../ui";

/** GST grouped by rate. CGST/SGST columns for intra-state, IGST for inter-state. */
export function GstSummaryTable({ totals, taxMode, compact }: { totals: Totals; taxMode: TaxMode; compact?: boolean }) {
  const split = taxMode === "CGST_SGST";
  const cell = compact ? "px-1.5 py-1" : "px-2 py-1";
  return (
    <table className={cx("w-full border-collapse", compact ? "text-xs" : "text-[11px]")} data-testid="gst-summary">
      <thead>
        <tr className="border-b border-slate-300 text-slate-500">
          <th className={cx(cell, "text-left font-semibold")}>GST Rate</th>
          <th className={cx(cell, "text-right font-semibold")}>Taxable</th>
          {split ? (
            <>
              <th className={cx(cell, "text-right font-semibold")}>CGST</th>
              <th className={cx(cell, "text-right font-semibold")}>SGST</th>
            </>
          ) : (
            <th className={cx(cell, "text-right font-semibold")}>IGST</th>
          )}
          <th className={cx(cell, "text-right font-semibold")}>GST Amount</th>
        </tr>
      </thead>
      <tbody>
        {totals.gst_summary.map((r) => (
          <tr key={r.rate} className="border-b border-slate-100">
            <td className={cell}>{formatPct(r.rate)}</td>
            <td className={cx(cell, "text-right")}>{formatAmount(r.taxable)}</td>
            {split ? (
              <>
                <td className={cx(cell, "text-right")}>{formatAmount(r.cgst)}</td>
                <td className={cx(cell, "text-right")}>{formatAmount(r.sgst)}</td>
              </>
            ) : (
              <td className={cx(cell, "text-right")}>{formatAmount(r.igst)}</td>
            )}
            <td className={cx(cell, "text-right")}>{formatAmount(r.tax)}</td>
          </tr>
        ))}
        <tr className="font-semibold text-slate-800">
          <td className={cell}>Total</td>
          <td className={cx(cell, "text-right")}>{formatAmount(totals.taxable_total)}</td>
          {split ? (
            <>
              <td className={cx(cell, "text-right")}>{formatAmount(sum(totals, "cgst"))}</td>
              <td className={cx(cell, "text-right")}>{formatAmount(sum(totals, "sgst"))}</td>
            </>
          ) : (
            <td className={cx(cell, "text-right")}>{formatAmount(sum(totals, "igst"))}</td>
          )}
          <td className={cx(cell, "text-right")}>{formatAmount(totals.tax_total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export const sum = (t: Totals, k: "cgst" | "sgst" | "igst") => Math.round(t.gst_summary.reduce((s, r) => s + r[k], 0) * 100) / 100;
