"use client";

import { useState } from "react";
import { formatINR, unitLabel } from "@/lib/calc";
import { InUseError } from "@/lib/data/repo";
import type { Material, MaterialInput } from "@/lib/types";
import { ValidationError, type Errors } from "@/lib/validation";
import { useData } from "../DataProvider";
import { Badge, Button, Field, Input, Modal, Select, Textarea, Toggle, errorMessage, useToast } from "../ui";

const blank = (): MaterialInput => ({
  name: "",
  code: "",
  description: "",
  hsn_code: "",
  default_unit_id: null,
  unit_ids: [],
  default_rate: null,
  is_active: true,
});

export function MaterialsTab() {
  const { materials, units, repo, refresh } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState<MaterialInput | null>(null);
  const unitCode = (id: string | null) => units.find((u) => u.id === id)?.code ?? "";

  const remove = async (m: Material) => {
    if (!confirm(`Delete material "${m.name}"?`)) return;
    try {
      await repo.deleteMaterial(m.id);
      await refresh();
      toast("Material deleted");
    } catch (e) {
      toast(errorMessage(e), e instanceof InUseError ? "info" : "error");
    }
  };

  const toggle = async (m: Material) => {
    try {
      await repo.saveMaterial({ ...m, is_active: !m.is_active });
      await refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Active materials appear in the quotation material dropdown. Inactive ones stay on old quotations.</p>
        <Button onClick={() => setEditing(blank())}>+ Add Material</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <th className="px-4 py-2 font-medium">Material</th>
              <th className="px-2 py-2 font-medium">Code / HSN</th>
              <th className="px-2 py-2 font-medium">Default Unit</th>
              <th className="px-2 py-2 font-medium">Available Units</th>
              <th className="px-2 py-2 text-right font-medium">Default Rate</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">No materials yet.</td></tr>
            )}
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-slate-100" data-testid="material-row">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-800">{m.name}</p>
                  {m.description && m.description !== m.name && <p className="text-xs text-slate-500">{m.description}</p>}
                </td>
                <td className="px-2 py-2.5 text-slate-600">{[m.code, m.hsn_code].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-2 py-2.5">{unitCode(m.default_unit_id) || "—"}</td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {m.unit_ids.length ? m.unit_ids.map((id) => <Badge key={id}>{unitCode(id)}</Badge>) : <span className="text-xs text-slate-400">Any unit</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right">{m.default_rate != null ? formatINR(m.default_rate) : "—"}</td>
                <td className="px-2 py-2.5">
                  <button onClick={() => toggle(m)} title="Click to toggle">
                    <Badge tone={m.is_active ? "green" : "slate"}>{m.is_active ? "Active" : "Inactive"}</Badge>
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m, unit_ids: [...m.unit_ids] })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(m)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <MaterialForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (m) => {
            await refresh();
            setEditing(null);
            toast(`${m.name} saved`);
          }}
        />
      )}
    </div>
  );
}

function MaterialForm({ initial, onClose, onSaved }: { initial: MaterialInput; onClose: () => void; onSaved: (m: Material) => void }) {
  const { repo, units } = useData();
  const toast = useToast();
  const [f, setF] = useState<MaterialInput>(initial);
  const [rate, setRate] = useState(initial.default_rate == null ? "" : String(initial.default_rate));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MaterialInput>(k: K, v: MaterialInput[K]) => setF((x) => ({ ...x, [k]: v }));

  // Show active units plus any inactive unit already attached to this material.
  const selectable = units.filter((u) => u.is_active || f.unit_ids.includes(u.id));
  const defaultChoices = f.unit_ids.length ? selectable.filter((u) => f.unit_ids.includes(u.id)) : selectable;

  const toggleUnit = (id: string, on: boolean) => {
    setF((x) => {
      const unit_ids = on ? [...x.unit_ids, id] : x.unit_ids.filter((u) => u !== id);
      const default_unit_id = x.default_unit_id && (unit_ids.length === 0 || unit_ids.includes(x.default_unit_id)) ? x.default_unit_id : unit_ids[0] ?? null;
      return { ...x, unit_ids, default_unit_id };
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await repo.saveMaterial({ ...f, default_rate: rate.trim() === "" ? null : Number(rate) });
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
      title={initial.id ? `Edit ${initial.name}` : "Add Material"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Material Name" required error={errors.name} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} autoFocus name="material_name" />
        </Field>
        <Field label="Material Code" error={errors.code} hint="Optional">
          <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} invalid={!!errors.code} />
        </Field>
        <Field label="HSN Code" hint="Optional">
          <Input value={f.hsn_code} onChange={(e) => set("hsn_code", e.target.value)} />
        </Field>
        <Field label="Description" hint="Pre-filled on quotation lines" className="sm:col-span-2">
          <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-medium text-slate-600">Available Unit Types</legend>
          <div className="flex flex-wrap gap-2">
            {selectable.map((u) => (
              <label key={u.id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="checkbox" checked={f.unit_ids.includes(u.id)} onChange={(e) => toggleUnit(u.id, e.target.checked)} className="accent-brand-600" />
                {unitLabel(u)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">{errors.unit_ids ?? "Leave all unticked to allow every active unit."}</p>
        </fieldset>
        <Field label="Default Unit" error={errors.default_unit_id}>
          <Select value={f.default_unit_id ?? ""} onChange={(e) => set("default_unit_id", e.target.value || null)}>
            <option value="">None</option>
            {defaultChoices.map((u) => (
              <option key={u.id} value={u.id}>{unitLabel(u)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Default Rate (₹)" error={errors.default_rate} hint="Optional, pre-fills the rate">
          <Input type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} invalid={!!errors.default_rate} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={f.is_active} onChange={(v) => set("is_active", v)} label={f.is_active ? "Active" : "Inactive"} />
        </div>
      </div>
    </Modal>
  );
}
