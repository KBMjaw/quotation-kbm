"use client";

import { useRef, useState } from "react";
import { emptyCompany } from "@/lib/defaults";
import { logoToPng } from "@/lib/image";
import { InUseError } from "@/lib/data/repo";
import type { Company, CompanyInput } from "@/lib/types";
import { ValidationError, type Errors } from "@/lib/validation";
import { companyAddressLines } from "@/lib/view";
import { useData } from "../DataProvider";
import { CompanyLogo } from "../quotation/QuotationPreview";
import { Badge, Button, Field, Input, Modal, Textarea, Toggle, errorMessage, useToast } from "../ui";

export function CompaniesTab() {
  const { companies, repo, refresh } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState<CompanyInput | null>(null);

  const remove = async (c: Company) => {
    if (!confirm(`Delete ${c.company_name}?`)) return;
    try {
      await repo.deleteCompany(c.id);
      await refresh();
      toast("Company deleted");
    } catch (e) {
      toast(errorMessage(e), e instanceof InUseError ? "info" : "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Company details and logos are saved once and loaded automatically on every quotation.</p>
        <Button onClick={() => setEditing(emptyCompany())}>+ Add Company</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => (
          <div key={c.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="company-settings-card">
            <div className="flex items-start gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center">
                <CompanyLogo company={c} size={56} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{c.company_name}</p>
                <p className="text-xs text-slate-500">{companyAddressLines(c).join(", ") || "Address not set"}</p>
                {c.gstin && <p className="text-xs text-slate-500">GSTIN: {c.gstin}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Badge tone="blue">{c.quotation_prefix}</Badge>
                  <Badge tone={c.is_active ? "green" : "slate"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  <Badge>Next #{c.next_number}</Badge>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button size="sm" variant="danger" onClick={() => remove(c)}>Delete</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing({ ...c, bank_details: { ...c.bank_details } })}>Edit</Button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <CompanyForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (c) => {
            await refresh();
            setEditing(null);
            toast(`${c.company_name} saved`);
          }}
        />
      )}
    </div>
  );
}

function CompanyForm({ initial, onClose, onSaved }: { initial: CompanyInput; onClose: () => void; onSaved: (c: Company) => void }) {
  const { repo } = useData();
  const toast = useToast();
  const [f, setF] = useState<CompanyInput>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [logoFile, setLogoFile] = useState<Blob | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo_url);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const setBank = (k: keyof CompanyInput["bank_details"], v: string) => setF((x) => ({ ...x, bank_details: { ...x.bank_details, [k]: v } }));
  const txt = (k: keyof CompanyInput, label: string, opts: { required?: boolean; hint?: string; upper?: boolean; className?: string; type?: string } = {}) => (
    <Field label={label} required={opts.required} error={errors[k]} hint={opts.hint} className={opts.className}>
      <Input
        type={opts.type ?? "text"}
        value={String(f[k] ?? "")}
        onChange={(e) => set(k, (opts.upper ? e.target.value.toUpperCase() : e.target.value) as never)}
        invalid={!!errors[k]}
        name={k}
      />
    </Field>
  );

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const png = await logoToPng(file);
      setLogoFile(png);
      setLogoPreview(URL.createObjectURL(png));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      // Save first so a new company has an id for its logo path.
      let saved = await repo.saveCompany(logoFile ? { ...f } : { ...f, logo_url: logoPreview });
      if (logoFile) {
        const url = await repo.uploadLogo(saved.id, logoFile);
        saved = await repo.saveCompany({ ...saved, logo_url: url });
      }
      onSaved(saved);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={initial.id ? `Edit ${initial.company_name}` : "Add Company"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Company"}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className="max-h-20 max-w-20 object-contain" />
            ) : (
              <span className="text-xs text-slate-400">No logo</span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Company Logo</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload logo</Button>
              {logoPreview && (
                <Button size="sm" variant="ghost" onClick={() => { setLogoPreview(null); setLogoFile(null); }}>Remove</Button>
              )}
            </div>
            <p className="text-xs text-slate-400">PNG/JPG/SVG/WebP up to 5 MB. Stored as PNG and used on every quotation.</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="logo-input" onChange={(e) => pickLogo(e.target.files?.[0])} />
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Identity</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {txt("company_name", "Company Name", { required: true })}
            {txt("display_name", "Display Name (on quotation header)", { hint: "e.g. KANNAN BLUE METALS" })}
            {txt("quotation_prefix", "Quotation Prefix", { required: true, upper: true, hint: "e.g. KBM → KBM-QTN-0001" })}
            <Field label="Next Quotation Number" error={errors.next_number} hint="Sequence for the next quotation">
              <Input type="number" min={1} value={f.next_number} onChange={(e) => set("next_number", Math.floor(Number(e.target.value)))} invalid={!!errors.next_number} />
            </Field>
            <Field label="Brand Colour" error={errors.brand_color} hint="Used for the quotation header and table">
              <div className="flex gap-2">
                <input type="color" value={f.brand_color} onChange={(e) => set("brand_color", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300" aria-label="Brand colour picker" />
                <Input value={f.brand_color} onChange={(e) => set("brand_color", e.target.value)} invalid={!!errors.brand_color} />
              </div>
            </Field>
            <div className="flex items-end pb-2">
              <Toggle checked={f.is_active} onChange={(v) => set("is_active", v)} label={f.is_active ? "Active" : "Inactive"} />
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Address</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {txt("address_line1", "Address Line 1")}
            {txt("address_line2", "Address Line 2")}
            {txt("area", "Area / Village")}
            {txt("city", "City")}
            {txt("district", "District")}
            {txt("state", "State")}
            {txt("pincode", "PIN Code")}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Contact & Tax</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {txt("phone", "Phone Number", { type: "tel" })}
            {txt("email", "Email", { type: "email" })}
            {txt("website", "Website")}
            {txt("gstin", "GSTIN", { upper: true })}
            {txt("pan", "PAN", { upper: true })}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Bank Details (optional)</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account Name"><Input value={f.bank_details.account_name} onChange={(e) => setBank("account_name", e.target.value)} /></Field>
            <Field label="Bank Name"><Input value={f.bank_details.bank_name} onChange={(e) => setBank("bank_name", e.target.value)} /></Field>
            <Field label="Account Number"><Input value={f.bank_details.account_number} onChange={(e) => setBank("account_number", e.target.value)} /></Field>
            <Field label="IFSC"><Input value={f.bank_details.ifsc} onChange={(e) => setBank("ifsc", e.target.value.toUpperCase())} /></Field>
            <Field label="Branch"><Input value={f.bank_details.branch} onChange={(e) => setBank("branch", e.target.value)} /></Field>
          </div>
        </section>

        <section className="grid gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Quotation Content</h4>
          <Field label="Additional Company Information" hint="Shown under the address, e.g. 'Manufacturers of Blue Metal & M-Sand'">
            <Input value={f.additional_info} onChange={(e) => set("additional_info", e.target.value)} />
          </Field>
          <Field label="Terms & Conditions" hint="One per line. Leave empty to use the default terms from Quotation Settings.">
            <Textarea rows={5} value={f.terms_conditions} onChange={(e) => set("terms_conditions", e.target.value)} />
          </Field>
          <Field label="Footer Text" hint="Leave empty to use the default footer.">
            <Input value={f.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
          </Field>
        </section>
      </div>
    </Modal>
  );
}
