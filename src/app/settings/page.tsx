"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useData } from "@/components/DataProvider";
import { CompaniesTab } from "@/components/settings/CompaniesTab";
import { MaterialsTab } from "@/components/settings/MaterialsTab";
import { QuotationSettingsTab } from "@/components/settings/QuotationSettingsTab";
import { UnitsTab } from "@/components/settings/UnitsTab";
import { Button, Card, Field, Input, Spinner, cx } from "@/components/ui";

const TABS = [
  { id: "companies", label: "Companies" },
  { id: "materials", label: "Materials" },
  { id: "units", label: "Unit Types" },
  { id: "quotation", label: "Quotation Settings" },
] as const;

function Settings() {
  const params = useSearchParams();
  const router = useRouter();
  const { isAdmin, pinLocked, mode, companies, materials, units } = useData();
  const tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "companies";
  const counts: Record<string, number | undefined> = { companies: companies.length, materials: materials.length, units: units.length };

  if (pinLocked) return <Unlock />;
  if (!isAdmin)
    return (
      <Card title="Settings">
        <p className="text-sm text-slate-600">
          Only administrators can manage companies, materials, unit types and quotation settings.
          {mode === "supabase" && " Ask an admin to change your role in the profiles table."}
        </p>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Everything here is saved centrally — no code changes needed to add companies, materials or units.</p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => router.replace(`/settings?tab=${t.id}`, { scroll: false })}
              className={cx(
                "rounded-lg px-4 py-2 text-sm font-medium transition",
                tab === t.id ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {t.label}
              {counts[t.id] != null && <span className={cx("ml-1.5 text-xs", tab === t.id ? "text-white/70" : "text-slate-400")}>{counts[t.id]}</span>}
            </button>
          ))}
        </nav>
      </div>
      {tab === "companies" && <CompaniesTab />}
      {tab === "materials" && <MaterialsTab />}
      {tab === "units" && <UnitsTab />}
      {tab === "quotation" && <QuotationSettingsTab />}
    </div>
  );
}

function Unlock() {
  const { unlock } = useData();
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form
      className="mx-auto max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBad(!(await unlock(pin)));
      }}
    >
      <Card title="Settings are locked">
        <div className="grid gap-3">
          <p className="text-sm text-slate-500">Enter the admin PIN to manage companies, materials and units.</p>
          <Field label="Admin PIN" error={bad ? "Incorrect PIN" : undefined}>
            <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          </Field>
          <Button type="submit">Unlock</Button>
        </div>
      </Card>
    </form>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Settings />
    </Suspense>
  );
}
