"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDaysISO, computeTotals, formatAmount, formatPct, todayISO } from "@/lib/calc";
import { emptyCustomer } from "@/lib/defaults";
import { formatQuotationNumber } from "@/lib/numbering";
import type { Company, Quotation, QuotationInput, QuotationSettings, TaxMode } from "@/lib/types";
import { ValidationError, type Errors } from "@/lib/validation";
import { buildView, companyAddressLines, companyTitle } from "@/lib/view";
import { useData } from "../DataProvider";
import { Badge, Button, Card, Field, Input, Select, Textarea, cx, errorMessage, useToast } from "../ui";
import { ItemsEditor, newItem } from "./ItemsEditor";
import { CompanyLogo, QuotationPreview } from "./QuotationPreview";

type Form = QuotationInput & { id?: string; quotation_no?: string | null };

const STEPS = ["Company", "Customer", "Materials", "Review"] as const;

const defaultTermsFor = (c: Company | undefined, s: QuotationSettings) => c?.terms_conditions.trim() || s.default_terms;

function blankForm(company: Company | undefined, settings: QuotationSettings): Form {
  const date = todayISO();
  return {
    company_id: company?.id ?? "",
    company_snapshot: null,
    quotation_date: date,
    valid_until: settings.default_validity_days ? addDaysISO(date, settings.default_validity_days) : null,
    reference: "",
    subject: "",
    customer: emptyCustomer(),
    items: [newItem(settings.default_gst_rate)],
    tax_mode: settings.default_tax_mode,
    terms_conditions: defaultTermsFor(company, settings),
    notes: "",
    status: "draft",
  };
}

function fromQuotation(q: Quotation): Form {
  const { totals: _t, created_at: _c, updated_at: _u, ...rest } = q;
  return rest;
}

const LAST_COMPANY_KEY = "kipipl-qm:last-company";

export function QuotationEditor({ initial, duplicateOf }: { initial?: Quotation; duplicateOf?: Quotation }) {
  const { repo, companies, materials, units, settings, refresh } = useData();
  const router = useRouter();
  const toast = useToast();

  const activeCompanies = companies.filter((c) => c.is_active);

  const [form, setForm] = useState<Form>(() => {
    if (initial) return fromQuotation(initial);
    let lastId: string | null = null;
    try {
      lastId = localStorage.getItem(LAST_COMPANY_KEY);
    } catch {}
    const base = blankForm(undefined, settings);
    if (duplicateOf) {
      const d = fromQuotation(duplicateOf);
      return {
        ...base,
        company_id: d.company_id,
        customer: d.customer,
        items: d.items.map((it) => ({ ...newItem(0), ...it, id: newItem(0).id })),
        tax_mode: d.tax_mode,
        terms_conditions: d.terms_conditions,
        subject: d.subject,
        notes: d.notes,
      };
    }
    const preselect = activeCompanies.find((c) => c.id === lastId);
    return preselect ? { ...base, company_id: preselect.id, terms_conditions: defaultTermsFor(preselect, settings) } : base;
  });
  const [step, setStep] = useState<number>(initial ? 3 : form.company_id ? 1 : 0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<null | "save" | "pdf" | "print">(null);
  const savedJson = useRef(initial ? JSON.stringify(fromQuotation(initial)) : "");
  const [savedCompanyId, setSavedCompanyId] = useState(initial?.company_id);

  const isNew = !form.id;
  const dirty = JSON.stringify(form) !== savedJson.current;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const company = companies.find((c) => c.id === form.company_id);
  const companyChanged = savedCompanyId !== form.company_id;
  const previewNumber = company
    ? formatQuotationNumber(settings.number_format, company.quotation_prefix, company.next_number, settings.seq_padding, form.quotation_date || todayISO())
    : undefined;
  const shownNumber = !companyChanged && form.quotation_no ? form.quotation_no : null;

  const view = useMemo(
    () =>
      company
        ? buildView({ ...form, quotation_no: shownNumber, previewNumber, company, settings })
        : null,
    [form, company, settings, shownNumber, previewNumber],
  );
  const totals = useMemo(() => computeTotals(form.items, form.tax_mode, settings.round_off_total), [form.items, form.tax_mode, settings.round_off_total]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setCustomer = (k: keyof Form["customer"], v: string) => setForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } }));

  const selectCompany = (id: string) => {
    const next = companies.find((c) => c.id === id);
    setForm((f) => {
      const prev = companies.find((c) => c.id === f.company_id);
      // Only swap terms if the user hasn't customised them for this quotation.
      const termsUntouched = !f.terms_conditions.trim() || f.terms_conditions === defaultTermsFor(prev, settings);
      return { ...f, company_id: id, terms_conditions: termsUntouched ? defaultTermsFor(next, settings) : f.terms_conditions };
    });
    try {
      localStorage.setItem(LAST_COMPANY_KEY, id);
    } catch {}
    setErrors((e) => {
      const { company_id: _, ...rest } = e;
      return rest;
    });
  };

  /** Saves the quotation. Returns the saved quotation, or null when invalid. */
  const save = async (): Promise<Quotation | null> => {
    setBusy("save");
    try {
      const saved = await repo.saveQuotation(form);
      const f = fromQuotation(saved);
      savedJson.current = JSON.stringify(f);
      setForm(f);
      setSavedCompanyId(saved.company_id);
      setErrors({});
      refresh(); // company sequence numbers changed
      if (isNew) router.replace(`/quotations/${saved.id}`);
      return saved;
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.errors);
        const first = Object.keys(e.errors)[0] ?? "";
        setStep(first.startsWith("company") ? 0 : first.startsWith("items") ? 2 : 1);
        toast(e.message, "error");
      } else toast(errorMessage(e), "error");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    const q = await save();
    if (q) {
      toast(`Quotation ${q.quotation_no} saved`);
      setStep(3);
    }
  };

  /** Download / print always use the saved record so the PDF matches what's stored. */
  const exportPdf = async (kind: "pdf" | "print") => {
    let q: Quotation | null = null;
    if (dirty || isNew) {
      q = await save();
      if (!q) return;
      toast(`Quotation ${q.quotation_no} saved`);
    }
    setBusy(kind);
    try {
      const saved = q ?? (await repo.getQuotation(form.id!));
      if (!saved) throw new Error("Quotation not found");
      // Current company details (what the preview shows); snapshot if the company was deleted.
      const c = companies.find((x) => x.id === saved.company_id) ?? saved.company_snapshot!;
      const v = buildView({ ...saved, company: c, settings });
      const { downloadPdf, printPdf } = await import("../pdf/actions");
      await (kind === "pdf" ? downloadPdf(v) : printPdf(v));
    } catch (e) {
      toast(`Could not create PDF: ${errorMessage(e)}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const canNext = step < 3 && !(step === 0 && !form.company_id);

  return (
    <div className="space-y-5">
      {/* ---------- Title + actions ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">← All quotations</Link>
          <h1 className="text-xl font-semibold text-slate-800">
            {isNew ? "New Quotation" : `Quotation ${form.quotation_no ?? ""}`}
            {dirty && !isNew && <span className="ml-2 align-middle text-xs font-normal text-amber-600">● unsaved changes</span>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => exportPdf("print")} disabled={!!busy}>
            {busy === "print" ? "Preparing…" : "Print"}
          </Button>
          <Button variant="secondary" onClick={() => exportPdf("pdf")} disabled={!!busy}>
            {busy === "pdf" ? "Generating…" : "Download PDF"}
          </Button>
          <Button onClick={onSave} disabled={!!busy}>
            {busy === "save" ? "Saving…" : isNew ? "Save Quotation" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* ---------- Company switcher (always visible) ---------- */}
      <div className="-mx-4 border-y border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:sticky sm:top-14 sm:z-30 sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Quotation For</span>
          <Select
            value={form.company_id}
            onChange={(e) => selectCompany(e.target.value)}
            className="w-auto min-w-0 flex-1 font-medium sm:max-w-md"
            aria-label="Quotation for company"
            invalid={!!errors.company_id}
          >
            <option value="">Select company…</option>
            {activeCompanies.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
            {company && !company.is_active && <option value={company.id}>{company.company_name} (inactive)</option>}
          </Select>
          {company && (
            <span className="text-xs text-slate-500">
              No: <b className="text-slate-700">{shownNumber ?? `${previewNumber} (on save)`}</b>
            </span>
          )}
        </div>
      </div>

      {/* ---------- Stepper ---------- */}
      <ol className="grid grid-cols-4 gap-1 sm:gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              onClick={() => (i === 0 || form.company_id ? setStep(i) : undefined)}
              className={cx(
                "w-full rounded-lg border px-2 py-2 text-left text-xs transition sm:px-3 sm:text-sm",
                step === i ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <span className="block text-[10px] text-slate-400 sm:text-xs">Step {i + 1}</span>
              <span className="font-medium">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* ---------- Step 1: Company ---------- */}
      {step === 0 && (
        <Card title="Select Company">
          {activeCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">
              No active companies. <Link href="/settings?tab=companies" className="text-brand-700 underline">Add one in Settings</Link>.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectCompany(c.id);
                    setStep(1);
                  }}
                  className={cx(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition hover:shadow-md",
                    form.company_id === c.id ? "border-brand-500 ring-2 ring-brand-500/30" : "border-slate-200",
                  )}
                  data-testid="company-card"
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center">
                    <CompanyLogo company={c} size={56} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800">{c.company_name}</span>
                    <span className="block text-xs text-slate-500">{companyAddressLines(c).join(", ") || "Address not set"}</span>
                    {c.gstin && <span className="block text-xs text-slate-500">GSTIN: {c.gstin}</span>}
                    <span className="mt-1 inline-block"><Badge tone="blue">{c.quotation_prefix}</Badge></span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {errors.company_id && <p className="mt-2 text-sm text-red-600">{errors.company_id}</p>}
          <p className="mt-4 text-xs text-slate-500">
            Company details, logo, terms and numbering load automatically. Manage them in{" "}
            <Link href="/settings?tab=companies" className="text-brand-700 underline">Settings → Companies</Link>.
          </p>
        </Card>
      )}

      {/* ---------- Step 2: Customer ---------- */}
      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Customer Details" className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer / Company Name" required error={errors["customer.name"]} className="sm:col-span-2">
                <Input value={form.customer.name} onChange={(e) => setCustomer("name", e.target.value)} invalid={!!errors["customer.name"]} autoFocus />
              </Field>
              <Field label="Contact Person">
                <Input value={form.customer.contact_person} onChange={(e) => setCustomer("contact_person", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={form.customer.phone} onChange={(e) => setCustomer("phone", e.target.value)} />
              </Field>
              <Field label="Email" error={errors["customer.email"]}>
                <Input type="email" value={form.customer.email} onChange={(e) => setCustomer("email", e.target.value)} invalid={!!errors["customer.email"]} />
              </Field>
              <Field label="GSTIN" error={errors["customer.gstin"]}>
                <Input value={form.customer.gstin} onChange={(e) => setCustomer("gstin", e.target.value.toUpperCase())} maxLength={15} invalid={!!errors["customer.gstin"]} />
              </Field>
              <Field label="Billing Address" className="sm:col-span-2">
                <Textarea rows={2} value={form.customer.address} onChange={(e) => setCustomer("address", e.target.value)} />
              </Field>
              <Field label="Delivery Address" hint="Leave empty if same as billing" className="sm:col-span-2">
                <Textarea rows={2} value={form.customer.delivery_address} onChange={(e) => setCustomer("delivery_address", e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card title="Quotation Details">
            <div className="grid gap-3">
              <Field label="Quotation Date" required error={errors.quotation_date}>
                <Input type="date" value={form.quotation_date} onChange={(e) => set("quotation_date", e.target.value)} />
              </Field>
              <Field label="Valid Until" error={errors.valid_until}>
                <Input type="date" value={form.valid_until ?? ""} onChange={(e) => set("valid_until", e.target.value || null)} />
              </Field>
              <Field label="Reference" hint="Enquiry no., PO, phone call…">
                <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
              </Field>
              <Field label="Subject">
                <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Quotation for supply of…" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {/* ---------- Step 3: Materials ---------- */}
      {step === 2 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card
            title="Materials"
            className="lg:col-span-2"
            actions={
              <Select value={form.tax_mode} onChange={(e) => set("tax_mode", e.target.value as TaxMode)} className="w-auto py-1.5 text-xs" aria-label="Tax type">
                <option value="CGST_SGST">GST: CGST + SGST (within state)</option>
                <option value="IGST">GST: IGST (other state)</option>
                <option value="NONE">No GST</option>
              </Select>
            }
          >
            <ItemsEditor
              items={form.items}
              onChange={(items) => set("items", items)}
              materials={materials}
              units={units}
              defaultGst={settings.default_gst_rate}
              showGst={form.tax_mode !== "NONE"}
              errors={errors}
            />
            <p className="mt-3 text-xs text-slate-500">
              Missing a material or unit? Add it in <Link href="/settings?tab=materials" className="text-brand-700 underline">Settings → Materials</Link>.
            </p>
          </Card>
          <div className="space-y-5">
            <TotalsCard totals={totals} />
            <Card title="Terms & Notes">
              <div className="grid gap-3">
                <Field label="Terms & Conditions" hint="One term per line">
                  <Textarea rows={6} value={form.terms_conditions} onChange={(e) => set("terms_conditions", e.target.value)} />
                </Field>
                <Field label="Notes">
                  <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------- Step 4: Review ---------- */}
      {step === 3 && (
        <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
          <div>{view ? <QuotationPreview v={view} /> : <Card><p className="text-sm text-slate-500">Select a company to preview.</p></Card>}</div>
          <div className="space-y-5">
            <TotalsCard totals={totals} />
            <Card title="Next steps">
              <div className="grid gap-2">
                <Button onClick={onSave} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save Quotation"}</Button>
                <Button variant="secondary" onClick={() => exportPdf("pdf")} disabled={!!busy}>
                  {busy === "pdf" ? "Generating…" : "Download PDF"}
                </Button>
                <Button variant="secondary" onClick={() => exportPdf("print")} disabled={!!busy}>Print</Button>
                {company && (
                  <p className="pt-1 text-xs text-slate-500">
                    Using details of <b>{companyTitle(company)}</b>. Edit them in{" "}
                    <Link href="/settings?tab=companies" className="text-brand-700 underline">Settings</Link>.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------- Step navigation ---------- */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</Button>
        {step < 3 && (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Next: {STEPS[step + 1]} →
          </Button>
        )}
      </div>
    </div>
  );
}

function TotalsCard({ totals }: { totals: ReturnType<typeof computeTotals> }) {
  return (
    <Card title="Totals">
      <dl className="space-y-1.5 text-sm" data-testid="totals">
        <Row k="Sub Total" v={totals.subtotal} />
        {totals.discount_total > 0 && <Row k="Discount" v={-totals.discount_total} />}
        {totals.discount_total > 0 && <Row k="Taxable Value" v={totals.taxable_total} />}
        {totals.tax_lines.map((t, i) => (
          <Row key={i} k={`${t.label} @ ${formatPct(t.rate)}`} v={t.amount} />
        ))}
        {totals.round_off !== 0 && <Row k="Round Off" v={totals.round_off} />}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
          <dt>Grand Total</dt>
          <dd data-testid="grand-total">₹{formatAmount(totals.grand_total)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{k}</dt>
      <dd>{v < 0 ? `- ₹${formatAmount(-v)}` : `₹${formatAmount(v)}`}</dd>
    </div>
  );
}
