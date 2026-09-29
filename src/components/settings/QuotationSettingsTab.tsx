"use client";

import { useState } from "react";
import { todayISO } from "@/lib/calc";
import { sha256 } from "@/lib/image";
import { formatQuotationNumber } from "@/lib/numbering";
import type { QuotationSettings, TaxMode } from "@/lib/types";
import { ValidationError, type Errors } from "@/lib/validation";
import { useData } from "../DataProvider";
import { Button, Card, Field, Input, Select, Textarea, Toggle, errorMessage, useToast } from "../ui";

export function QuotationSettingsTab() {
  const { settings, repo, refresh, mode, companies, lock } = useData();
  const toast = useToast();
  const [f, setF] = useState<QuotationSettings>(settings);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const set = <K extends keyof QuotationSettings>(k: K, v: QuotationSettings[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async (next = f) => {
    setBusy(true);
    try {
      await repo.saveSettings(next);
      await refresh();
      setErrors({});
      toast("Quotation settings saved");
      return true;
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
      toast(errorMessage(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setAdminPin = async () => {
    if (pin.length < 4) return toast("PIN must be at least 4 characters", "error");
    const next = { ...f, admin_pin_hash: await sha256(pin) };
    setF(next);
    if (await save(next)) setPin("");
  };

  const example = companies[0];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Numbering">
        <div className="grid gap-3">
          <Field label="Number Format" error={errors.number_format} hint="Tokens: {PREFIX} {SEQ} {YYYY} {YY} {MM} {FY}. The prefix is set per company.">
            <Input value={f.number_format} onChange={(e) => set("number_format", e.target.value)} invalid={!!errors.number_format} />
          </Field>
          <Field label="Sequence Digits" error={errors.seq_padding}>
            <Input type="number" min={1} max={10} value={f.seq_padding} onChange={(e) => set("seq_padding", Math.floor(Number(e.target.value)))} />
          </Field>
          {example && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Next for {example.company_name}:{" "}
              <b>{formatQuotationNumber(f.number_format, example.quotation_prefix, example.next_number, f.seq_padding, todayISO())}</b>
            </p>
          )}
        </div>
      </Card>

      <Card title="Tax & Totals">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default GST Rate (%)" error={errors.default_gst_rate}>
            <Input type="number" min={0} max={100} step="any" value={f.default_gst_rate} onChange={(e) => set("default_gst_rate", Number(e.target.value))} />
          </Field>
          <Field label="Default Tax Type">
            <Select value={f.default_tax_mode} onChange={(e) => set("default_tax_mode", e.target.value as TaxMode)}>
              <option value="CGST_SGST">CGST + SGST</option>
              <option value="IGST">IGST</option>
              <option value="NONE">No GST</option>
            </Select>
          </Field>
          <Field label="Default Validity (days)" error={errors.default_validity_days}>
            <Input type="number" min={0} value={f.default_validity_days} onChange={(e) => set("default_validity_days", Math.floor(Number(e.target.value)))} />
          </Field>
          <div className="grid content-end gap-2 pb-1">
            <Toggle checked={f.round_off_total} onChange={(v) => set("round_off_total", v)} label="Round off grand total" />
            <Toggle checked={f.show_amount_in_words} onChange={(v) => set("show_amount_in_words", v)} label="Show amount in words" />
            <Toggle checked={f.show_bank_details} onChange={(v) => set("show_bank_details", v)} label="Show bank details" />
          </div>
        </div>
      </Card>

      <Card title="Default Content" className="lg:col-span-2">
        <div className="grid gap-3">
          <Field label="Default Terms & Conditions" hint="One per line. Used when a company has no terms of its own.">
            <Textarea rows={6} value={f.default_terms} onChange={(e) => set("default_terms", e.target.value)} />
          </Field>
          <Field label="Default Footer Text">
            <Input value={f.default_footer} onChange={(e) => set("default_footer", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end lg:col-span-2">
        <Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save Settings"}</Button>
      </div>

      {mode === "local" && (
        <Card title="Settings Access (this browser)" className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-500">
            Protect Settings with a PIN so quotation users can only pick the companies, materials and units configured here.
            {f.admin_pin_hash ? " A PIN is currently set." : " No PIN is set."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={f.admin_pin_hash ? "New PIN" : "Set PIN"}>
              <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" className="w-48" />
            </Field>
            <Button variant="secondary" onClick={setAdminPin} disabled={busy}>Save PIN</Button>
            {f.admin_pin_hash && (
              <>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const next = { ...f, admin_pin_hash: null };
                    setF(next);
                    await save(next);
                  }}
                >
                  Remove PIN
                </Button>
                <Button variant="ghost" onClick={lock}>Lock now</Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
