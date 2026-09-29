"use client";

import { useState } from "react";
import { unitLabel } from "@/lib/calc";
import { InUseError } from "@/lib/data/repo";
import type { UnitInput, UnitType } from "@/lib/types";
import { ValidationError, type Errors } from "@/lib/validation";
import { useData } from "../DataProvider";
import { Badge, Button, Field, Input, Modal, Toggle, errorMessage, useToast } from "../ui";

export function UnitsTab() {
  const { units, repo, refresh } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState<UnitInput | null>(null);

  const remove = async (u: UnitType) => {
    if (!confirm(`Delete unit "${u.name}"?`)) return;
    try {
      await repo.deleteUnit(u.id);
      await refresh();
      toast("Unit deleted");
    } catch (e) {
      toast(errorMessage(e), e instanceof InUseError ? "info" : "error");
    }
  };

  const toggle = async (u: UnitType) => {
    try {
      await repo.saveUnit({ ...u, is_active: !u.is_active });
      await refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Unit types load into the quotation Unit dropdown. Units in use can be disabled but not deleted.</p>
        <Button onClick={() => setEditing({ name: "", code: "", is_active: true })}>+ Add Unit</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <th className="px-4 py-2 font-medium">Unit Name</th>
              <th className="px-2 py-2 font-medium">Code</th>
              <th className="px-2 py-2 font-medium">Shown As</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-b border-slate-100" data-testid="unit-row">
                <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                <td className="px-2 py-2.5"><Badge tone="blue">{u.code}</Badge></td>
                <td className="px-2 py-2.5 text-slate-600">{unitLabel(u)}</td>
                <td className="px-2 py-2.5">
                  <button onClick={() => toggle(u)} title="Click to toggle">
                    <Badge tone={u.is_active ? "green" : "slate"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...u })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(u)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UnitForm initial={editing} onClose={() => setEditing(null)} onSaved={async (u) => { await refresh(); setEditing(null); toast(`${u.name} saved`); }} />}
    </div>
  );
}

function UnitForm({ initial, onClose, onSaved }: { initial: UnitInput; onClose: () => void; onSaved: (u: UnitType) => void }) {
  const { repo } = useData();
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await repo.saveUnit(f));
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
      title={initial.id ? `Edit ${initial.name}` : "Add Unit Type"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Unit Name (display name)" required error={errors.name} hint="e.g. Metric Tons">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} autoFocus name="unit_name" />
        </Field>
        <Field label="Short Code" required error={errors.code} hint="e.g. MT — printed on the quotation">
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} invalid={!!errors.code} maxLength={10} name="unit_code" />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-between">
          <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label={f.is_active ? "Active" : "Inactive"} />
          {f.name && f.code && <span className="text-xs text-slate-500">Shown as: <b>{unitLabel(f)}</b></span>}
        </div>
      </div>
    </Modal>
  );
}
