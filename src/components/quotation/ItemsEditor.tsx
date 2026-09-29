"use client";

import { formatAmount, lineAmounts, unitLabel } from "@/lib/calc";
import { newId } from "@/lib/data/repo";
import type { Material, QuotationItem, UnitType } from "@/lib/types";
import type { Errors } from "@/lib/validation";
import { Button, Field, Input, Select, cx } from "../ui";

interface Props {
  items: QuotationItem[];
  onChange: (items: QuotationItem[]) => void;
  materials: Material[];
  units: UnitType[];
  defaultGst: number;
  showGst: boolean;
  errors: Errors;
}

export function newItem(defaultGst: number): QuotationItem {
  return {
    id: newId(),
    material_id: null,
    material_name: "",
    description: "",
    hsn_code: "",
    quantity: 1,
    unit_id: null,
    unit_code: "",
    unit_name: "",
    rate: 0,
    discount_pct: 0,
    gst_rate: defaultGst,
  };
}

/** Units a material may be quoted in (all active units when the material has no restriction). */
export function unitsFor(material: Material | undefined, units: UnitType[]): UnitType[] {
  const active = units.filter((u) => u.is_active);
  if (!material || material.unit_ids.length === 0) return active;
  return active.filter((u) => material.unit_ids.includes(u.id));
}

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ItemsEditor({ items, onChange, materials, units, defaultGst, showGst, errors }: Props) {
  const activeMaterials = materials.filter((m) => m.is_active);

  const update = (i: number, patch: Partial<QuotationItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const pickMaterial = (i: number, id: string) => {
    const it = items[i];
    const m = materials.find((x) => x.id === id);
    if (!m) return update(i, { material_id: null, material_name: "" });
    const allowed = unitsFor(m, units);
    const keepUnit = it.unit_id && allowed.some((u) => u.id === it.unit_id);
    const unit = keepUnit ? units.find((u) => u.id === it.unit_id) : allowed.find((u) => u.id === m.default_unit_id) ?? allowed[0];
    const descWasAuto = !it.description.trim() || it.description === it.material_name || it.description === materials.find((x) => x.id === it.material_id)?.description;
    update(i, {
      material_id: m.id,
      material_name: m.name,
      description: descWasAuto ? m.description || m.name : it.description,
      hsn_code: m.hsn_code,
      unit_id: unit?.id ?? null,
      unit_code: unit?.code ?? "",
      unit_name: unit?.name ?? "",
      rate: !it.rate && m.default_rate ? m.default_rate : it.rate,
    });
  };

  const pickUnit = (i: number, id: string) => {
    const u = units.find((x) => x.id === id);
    update(i, { unit_id: u?.id ?? null, unit_code: u?.code ?? "", unit_name: u?.name ?? "" });
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className={cx("rounded-lg border border-dashed px-4 py-8 text-center text-sm", errors.items ? "border-red-300 text-red-600" : "border-slate-300 text-slate-500")}>
          {errors.items ?? "No materials yet. Add the first material below."}
        </p>
      )}
      {items.map((it, i) => {
        const e = (k: string) => errors[`items.${i}.${k}`];
        const material = materials.find((m) => m.id === it.material_id);
        const allowedUnits = unitsFor(material, units);
        // Keep showing a unit/material that has since been disabled so old quotations stay editable.
        const unitOptions = it.unit_id && !allowedUnits.some((u) => u.id === it.unit_id) ? [...allowedUnits, ...units.filter((u) => u.id === it.unit_id)] : allowedUnits;
        const materialMissing = it.material_id && !activeMaterials.some((m) => m.id === it.material_id);
        const a = lineAmounts({ ...it, quantity: Number.isFinite(it.quantity) ? it.quantity : 0, rate: Number.isFinite(it.rate) ? it.rate : 0 });
        return (
          <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3" data-testid="item-row">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Item {i + 1}
                <span className="ml-2 text-sm text-slate-800" data-testid="item-amount">₹{formatAmount(a.taxable)}</span>
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-12">
              <Field label="Material" required error={e("material")} className="col-span-2 md:col-span-4">
                <Select value={it.material_id ?? ""} onChange={(ev) => pickMaterial(i, ev.target.value)} invalid={!!e("material")} aria-label={`Material for item ${i + 1}`}>
                  <option value="">Select material…</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                  {materialMissing && (
                    <option value={it.material_id!}>{it.material_name} (inactive)</option>
                  )}
                </Select>
              </Field>
              <Field label="Description" className="col-span-2 md:col-span-8">
                <Input value={it.description} onChange={(ev) => update(i, { description: ev.target.value })} placeholder="Size, grade, delivery notes…" />
              </Field>
              <Field label="Quantity" required error={e("quantity")} className="md:col-span-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={Number.isFinite(it.quantity) ? it.quantity : ""}
                  onChange={(ev) => update(i, { quantity: toNum(ev.target.value) })}
                  invalid={!!e("quantity")}
                  aria-label={`Quantity for item ${i + 1}`}
                />
              </Field>
              <Field label="Unit" required error={e("unit")} className="md:col-span-3">
                <Select value={it.unit_id ?? ""} onChange={(ev) => pickUnit(i, ev.target.value)} invalid={!!e("unit")} aria-label={`Unit for item ${i + 1}`}>
                  <option value="">Unit…</option>
                  {unitOptions.map((u) => (
                    <option key={u.id} value={u.id}>{unitLabel(u)}{u.is_active ? "" : " (inactive)"}</option>
                  ))}
                  {!it.unit_id && it.unit_code && <option value="">{it.unit_code}</option>}
                </Select>
              </Field>
              <Field label="Rate (₹)" required error={e("rate")} className="md:col-span-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={Number.isFinite(it.rate) ? it.rate : ""}
                  onChange={(ev) => update(i, { rate: toNum(ev.target.value) })}
                  invalid={!!e("rate")}
                  aria-label={`Rate for item ${i + 1}`}
                />
              </Field>
              <Field label="Discount %" error={e("discount")} className="md:col-span-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  value={Number.isFinite(it.discount_pct) ? it.discount_pct : ""}
                  onChange={(ev) => update(i, { discount_pct: ev.target.value === "" ? 0 : Number(ev.target.value) })}
                  invalid={!!e("discount")}
                />
              </Field>
              <Field label="GST %" error={e("gst")} className="md:col-span-2">
                <Select
                  value={String(it.gst_rate)}
                  onChange={(ev) => update(i, { gst_rate: Number(ev.target.value) })}
                  disabled={!showGst}
                >
                  {[...new Set([0, 5, 12, 18, 28, it.gst_rate])].sort((a, b) => a - b).map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        );
      })}
      <Button variant="secondary" onClick={() => onChange([...items, newItem(defaultGst)])}>
        + Add Material
      </Button>
    </div>
  );
}
