import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { amountInWords, formatAmount, formatDate, formatPct, formatQty, lineAmounts } from "@/lib/calc";
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

let fontsReady = false;
/** Registers Noto Sans (with the ₹ glyph) from /public/fonts. */
export function registerFonts(origin: string) {
  if (fontsReady) return;
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: `${origin}/fonts/NotoSans-400.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/NotoSans-700.ttf`, fontWeight: 700 },
    ],
  });
  // Don't hyphenate words (company names, material names).
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const INK = "#0f172a";
const MUTED = "#475569";
const LINE = "#cbd5e1";
const ZEBRA = "#f8fafc";

const s = StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: 9, color: INK, paddingTop: 30, paddingBottom: 54, paddingHorizontal: 36, lineHeight: 1.35 },
  row: { flexDirection: "row" },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 10, borderBottomWidth: 2 },
  logoBox: { width: 68, height: 68, marginRight: 14, alignItems: "center", justifyContent: "center" },
  logo: { maxWidth: 68, maxHeight: 68, objectFit: "contain" },
  mono: { width: 60, height: 60, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  monoText: { color: "#fff", fontWeight: 700 },
  coName: { fontSize: 16, fontWeight: 700, lineHeight: 1.2, marginBottom: 2 },
  coLegal: { fontSize: 8.5, color: MUTED, marginBottom: 2 },
  coLine: { fontSize: 8.5, color: MUTED },
  titleWrap: { alignItems: "center", marginTop: 12, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 700, letterSpacing: 4 },
  titleRule: { width: 70, height: 2, marginTop: 6 },
  infoRow: { flexDirection: "row", marginBottom: 10 },
  box: { borderWidth: 0.75, borderColor: LINE, borderRadius: 4, padding: 8 },
  label: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 0.8, marginBottom: 3 },
  custName: { fontSize: 10.5, fontWeight: 700, marginBottom: 2 },
  metaRow: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  metaKey: { width: 72, color: MUTED },
  metaVal: { flex: 1, fontWeight: 700, textAlign: "right" },
  subject: { marginBottom: 8 },
  th: { flexDirection: "row", color: "#fff", fontWeight: 700, fontSize: 7.5, alignItems: "center" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, fontSize: 8.5 },
  cell: { paddingVertical: 5, paddingHorizontal: 4 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  desc: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  bottom: { flexDirection: "row", marginTop: 10 },
  words: { fontSize: 8.5, fontWeight: 700, marginBottom: 8 },
  gsTable: { borderWidth: 0.75, borderColor: LINE, borderRadius: 3, marginBottom: 8 },
  gsHead: { flexDirection: "row", backgroundColor: "#f1f5f9", fontWeight: 700, fontSize: 7.5, color: MUTED },
  gsRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE, fontSize: 8 },
  gsCell: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, textAlign: "right" },
  totals: { width: 220, marginLeft: 12 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 8, color: "#fff", fontWeight: 700, fontSize: 10.5, marginTop: 2, borderRadius: 3 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4, marginTop: 12 },
  term: { flexDirection: "row", marginBottom: 2 },
  termNo: { width: 14, color: MUTED },
  termText: { flex: 1, color: "#334155" },
  signWrap: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 26 },
  sign: { width: 200, alignItems: "center" },
  signLine: { borderTopWidth: 0.75, borderTopColor: INK, width: "100%", marginTop: 38, paddingTop: 3, textAlign: "center" },
  // Anchored with `top` (A4 = 841.89pt): react-pdf drops `render` text in bottom-anchored fixed boxes.
  footer: { position: "absolute", left: 36, right: 36, top: 841.89 - 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: LINE, paddingTop: 5, fontSize: 7.5, color: MUTED },
  watermark: { position: "absolute", top: 380, left: 0, right: 0, textAlign: "center", fontSize: 70, color: "#e2e8f0", fontWeight: 700, transform: "rotate(-30deg)" },
});

interface Col {
  key: string;
  label: string;
  width: number | "flex";
  align?: "right" | "center";
}

export function QuotationDocument({ v }: { v: QuotationView }) {
  const c = v.company;
  const brand = c.brand_color || "#1F3A93";
  const showDisc = v.items.some((i) => i.discount_pct > 0);
  const showGst = v.tax_mode !== "NONE";
  const showHsn = v.items.some((i) => i.hsn_code.trim());
  const title = companyTitle(c);
  const legal = c.company_name.trim();
  const terms = splitLines(termsFor(v));
  const footer = footerFor(v);

  const cols: Col[] = [
    { key: "no", label: "S.No", width: 26, align: "center" },
    { key: "item", label: "Product", width: "flex" },
    { key: "qty", label: "Qty", width: 40, align: "right" },
    { key: "unit", label: "Unit", width: 32, align: "center" },
    { key: "rate", label: "Rate (₹)", width: 54, align: "right" },
    ...(showDisc ? [{ key: "disc", label: "Disc.", width: 32, align: "right" as const }] : []),
    { key: "taxable", label: showGst ? "Taxable Value" : "Amount (₹)", width: 62, align: "right" },
    ...(showGst
      ? [
          { key: "gst", label: "GST %", width: 32, align: "right" as const },
          { key: "gstamt", label: "GST Amount", width: 54, align: "right" as const },
          { key: "total", label: "Total (₹)", width: 64, align: "right" as const },
        ]
      : []),
  ];
  const colStyle = (col: Col) => [
    s.cell,
    col.width === "flex" ? { flex: 1 } : { width: col.width },
    col.align === "right" ? s.right : col.align === "center" ? s.center : {},
  ];

  return (
    <Document title={`Quotation ${v.quotation_no}`} author={legal} subject={v.subject || `Quotation for ${v.customer.name}`} creator="KIPIPL Quotation Maker">
      <Page size="A4" style={s.page} wrap>
        {v.is_draft_number && <Text style={s.watermark} fixed>DRAFT</Text>}

        {/* ---------- Company header ---------- */}
        <View style={[s.header, { borderBottomColor: brand }]}>
          <View style={s.logoBox}>
            {c.logo_url ? (
              <Image src={c.logo_url} style={s.logo} />
            ) : (
              <View style={[s.mono, { backgroundColor: brand }]}>
                <Text style={[s.monoText, { fontSize: monogram(c).length > 4 ? 11 : 15 }]}>{monogram(c)}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.coName, { color: brand }]}>{title}</Text>
            {legal && legal.toLowerCase() !== title.toLowerCase() && <Text style={s.coLegal}>{legal}</Text>}
            {companyAddressLines(c).map((l, i) => (
              <Text key={i} style={s.coLine}>{l}</Text>
            ))}
            {companyContactLine(c) ? <Text style={s.coLine}>{companyContactLine(c)}</Text> : null}
            {companyTaxLine(c) ? <Text style={[s.coLine, { fontWeight: 700, color: INK }]}>{companyTaxLine(c)}</Text> : null}
            {c.additional_info.trim() ? <Text style={s.coLine}>{c.additional_info.trim()}</Text> : null}
          </View>
        </View>

        <View style={s.titleWrap}>
          <Text style={s.title}>QUOTATION</Text>
          <View style={[s.titleRule, { backgroundColor: brand }]} />
        </View>

        {/* ---------- Customer + meta ---------- */}
        <View style={s.infoRow} wrap={false}>
          <View style={[s.box, { flex: 1.45, marginRight: 10 }]}>
            <Text style={s.label}>BILL TO</Text>
            <Text style={s.custName}>{v.customer.name}</Text>
            {v.customer.contact_person ? <Text>Attn: {v.customer.contact_person}</Text> : null}
            {v.customer.address ? <Text style={{ color: "#334155" }}>{v.customer.address}</Text> : null}
            {v.customer.phone || v.customer.email ? (
              <Text style={{ color: "#334155" }}>{[v.customer.phone && `Ph: ${v.customer.phone}`, v.customer.email].filter(Boolean).join("  |  ")}</Text>
            ) : null}
            {v.customer.gstin ? <Text style={{ fontWeight: 700 }}>GSTIN: {v.customer.gstin}</Text> : null}
            {v.customer.delivery_address ? (
              <View style={{ marginTop: 5 }}>
                <Text style={s.label}>DELIVERY ADDRESS</Text>
                <Text style={{ color: "#334155" }}>{v.customer.delivery_address}</Text>
              </View>
            ) : null}
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>QUOTATION DETAILS</Text>
            <Meta k="Quotation No" v={v.quotation_no} />
            <Meta k="Date" v={formatDate(v.quotation_date)} />
            {v.valid_until ? <Meta k="Valid Until" v={formatDate(v.valid_until)} /> : null}
            {v.reference ? <Meta k="Reference" v={v.reference} /> : null}
          </View>
        </View>

        {v.subject ? (
          <Text style={s.subject}>
            <Text style={{ fontWeight: 700 }}>Subject: </Text>
            {v.subject}
          </Text>
        ) : null}

        {/* ---------- Items (header repeats on every page) ---------- */}
        <View>
          <View style={[s.th, { backgroundColor: brand }]} fixed>
            {cols.map((col) => (
              <Text key={col.key} style={colStyle(col)}>{col.label}</Text>
            ))}
          </View>
          {v.items.map((it, i) => {
            const a = lineAmounts(it, v.tax_mode);
            const desc = it.description.trim() && it.description.trim().toLowerCase() !== it.material_name.trim().toLowerCase() ? it.description.trim() : "";
            const cells: Record<string, React.ReactNode> = {
              no: String(i + 1),
              item: (
                <>
                  <Text style={{ fontWeight: 700 }}>{it.material_name}</Text>
                  {desc ? <Text style={s.desc}>{desc}</Text> : null}
                  {showHsn && it.hsn_code ? <Text style={s.desc}>HSN: {it.hsn_code}</Text> : null}
                </>
              ),
              qty: formatQty(it.quantity),
              unit: it.unit_code,
              rate: formatAmount(it.rate),
              disc: it.discount_pct ? formatPct(it.discount_pct) : "-",
              taxable: formatAmount(a.taxable),
              gst: formatPct(it.gst_rate),
              gstamt: formatAmount(a.tax),
              total: formatAmount(a.total),
            };
            return (
              <View key={it.id || i} style={[s.tr, i % 2 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
                {cols.map((col) =>
                  col.key === "item" ? (
                    <View key={col.key} style={colStyle(col)}>{cells.item}</View>
                  ) : (
                    <Text key={col.key} style={colStyle(col)}>{cells[col.key] as string}</Text>
                  ),
                )}
              </View>
            );
          })}
        </View>

        {/* ---------- Totals ---------- */}
        <View style={s.bottom} wrap={false}>
          <View style={{ flex: 1 }}>
            {showGst && v.totals.gst_summary.length ? <GstSummary v={v} /> : null}
            {v.settings.show_amount_in_words ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={s.label}>AMOUNT IN WORDS</Text>
                <Text style={s.words}>{amountInWords(v.totals.grand_total)}</Text>
              </View>
            ) : null}
            {v.settings.show_bank_details && hasBankDetails(c) ? (
              <View style={s.box}>
                <Text style={s.label}>BANK DETAILS</Text>
                {c.bank_details.account_name ? <Bank k="A/c Name" v={c.bank_details.account_name} /> : null}
                {c.bank_details.bank_name ? <Bank k="Bank" v={c.bank_details.bank_name} /> : null}
                {c.bank_details.account_number ? <Bank k="A/c No" v={c.bank_details.account_number} /> : null}
                {c.bank_details.ifsc ? <Bank k="IFSC" v={c.bank_details.ifsc} /> : null}
                {c.bank_details.branch ? <Bank k="Branch" v={c.bank_details.branch} /> : null}
              </View>
            ) : null}
          </View>
          <View style={s.totals}>
            {v.totals.discount_total ? <Tot k="Sub Total" v={v.totals.subtotal} /> : null}
            {v.totals.discount_total ? <Tot k="Less: Discount" v={-v.totals.discount_total} /> : null}
            <Tot k="Taxable Value" v={v.totals.taxable_total} />
            {v.totals.tax_lines.map((t, i) => (
              <Tot key={i} k={`${t.label} @ ${formatPct(t.rate)}`} v={t.amount} />
            ))}
            {showGst ? <Tot k="Total GST" v={v.totals.tax_total} bold /> : null}
            {v.totals.round_off ? <Tot k="Round Off" v={v.totals.round_off} /> : null}
            <View style={[s.grand, { backgroundColor: brand }]}>
              <Text>Grand Total</Text>
              <Text>₹ {formatAmount(v.totals.grand_total)}</Text>
            </View>
          </View>
        </View>

        {/* ---------- Terms / notes ---------- */}
        {terms.length ? (
          <View>
            <Text style={s.sectionTitle} minPresenceAhead={30}>Terms &amp; Conditions</Text>
            {terms.map((t, i) => (
              <View key={i} style={s.term} wrap={false}>
                <Text style={s.termNo}>{i + 1}.</Text>
                <Text style={s.termText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {v.notes.trim() ? (
          <View wrap={false}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={{ color: "#334155" }}>{v.notes.trim()}</Text>
          </View>
        ) : null}

        {/* ---------- Signature ---------- */}
        <View style={s.signWrap} wrap={false}>
          <View style={{ width: 200 }}>
            <Text style={[s.signLine, { textAlign: "left", color: MUTED }]}>Customer Acceptance</Text>
          </View>
          <View style={s.sign}>
            <Text style={{ fontWeight: 700 }}>For {title}</Text>
            <Text style={s.signLine}>Authorised Signatory</Text>
          </View>
        </View>

        {/* ---------- Footer ---------- */}
        <View style={s.footer} fixed>
          <Text style={{ flex: 1 }}>{footer}</Text>
          <Text style={{ marginHorizontal: 8 }}>{v.quotation_no}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaKey}>{k}</Text>
      <Text style={s.metaVal}>{v}</Text>
    </View>
  );
}

function Tot({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <View style={[s.totRow, bold ? { fontWeight: 700 } : {}]}>
      <Text style={bold ? {} : { color: MUTED }}>{k}</Text>
      <Text>{v < 0 ? `- ${formatAmount(-v)}` : formatAmount(v)}</Text>
    </View>
  );
}

function Bank({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.row}>
      <Text style={{ width: 52, color: MUTED }}>{k}</Text>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

/** GST grouped by rate (CGST/SGST columns intra-state, IGST inter-state). */
function GstSummary({ v }: { v: QuotationView }) {
  const split = v.tax_mode === "CGST_SGST";
  const t = v.totals;
  const total = (k: "cgst" | "sgst" | "igst") => t.gst_summary.reduce((acc, r) => acc + r[k], 0);
  const head = ["GST Rate", "Taxable", ...(split ? ["CGST", "SGST"] : ["IGST"]), "GST Amount"];
  const rows = t.gst_summary.map((r) => [
    formatPct(r.rate),
    formatAmount(r.taxable),
    ...(split ? [formatAmount(r.cgst), formatAmount(r.sgst)] : [formatAmount(r.igst)]),
    formatAmount(r.tax),
  ]);
  const foot = [
    "Total",
    formatAmount(t.taxable_total),
    ...(split ? [formatAmount(total("cgst")), formatAmount(total("sgst"))] : [formatAmount(total("igst"))]),
    formatAmount(t.tax_total),
  ];
  const cell = (i: number) => [s.gsCell, i === 0 ? { textAlign: "left" as const, flex: 0.8 } : {}];
  return (
    <View>
      <Text style={s.label}>GST SUMMARY</Text>
      <View style={s.gsTable}>
        <View style={s.gsHead}>
          {head.map((h, i) => (
            <Text key={i} style={cell(i)}>{h}</Text>
          ))}
        </View>
        {rows.map((r, j) => (
          <View key={j} style={s.gsRow}>
            {r.map((x, i) => (
              <Text key={i} style={cell(i)}>{x}</Text>
            ))}
          </View>
        ))}
        <View style={[s.gsRow, { fontWeight: 700 }]}>
          {foot.map((x, i) => (
            <Text key={i} style={cell(i)}>{x}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}
