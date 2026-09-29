import { pdf } from "@react-pdf/renderer";
import { prepareLogo } from "@/lib/logoFit";
import type { QuotationView } from "@/lib/view";
import { QuotationDocument, registerFonts } from "./QuotationPdf";

export async function renderPdf(v: QuotationView): Promise<Blob> {
  registerFonts(window.location.origin);
  // Use the margin-trimmed logo and its real proportions so it can be sized to the header text.
  if (v.company.logo_url) {
    const logo = await prepareLogo(v.company.logo_url);
    v = { ...v, company: { ...v.company, logo_url: logo.src }, logo_aspect: logo.aspect };
  }
  return pdf(<QuotationDocument v={v} />).toBlob();
}

export const pdfFileName = (v: QuotationView) =>
  `${v.quotation_no}_${v.customer.name || "quotation"}`.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_") + ".pdf";

export async function downloadPdf(v: QuotationView) {
  const blob = await renderPdf(v);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(v);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Prints the generated A4 PDF (not the web page), so output is identical to the download. */
export async function printPdf(v: QuotationView) {
  const blob = await renderPdf(v);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
  };
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
