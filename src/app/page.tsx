"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { CompanyLogo } from "@/components/quotation/QuotationPreview";
import { Badge, Button, Card, Input, Select, Spinner, errorMessage, useToast } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/calc";
import type { Quotation } from "@/lib/types";
import { buildView } from "@/lib/view";

const STATUS_TONE = { draft: "slate", sent: "blue", accepted: "green", rejected: "red" } as const;

export default function QuotationsPage() {
  const { repo, companies, settings } = useData();
  const toast = useToast();
  const [list, setList] = useState<Quotation[] | null>(null);
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    repo.listQuotations().then(setList).catch((e) => toast(errorMessage(e), "error"));
  }, [repo, toast]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list ?? []).filter(
      (x) =>
        (!companyId || x.company_id === companyId) &&
        (!needle ||
          [x.quotation_no, x.customer.name, x.customer.contact_person, x.subject, ...x.items.map((i) => i.material_name)]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  }, [list, q, companyId]);

  const companyOf = (x: Quotation) => companies.find((c) => c.id === x.company_id) ?? x.company_snapshot;

  const download = async (x: Quotation) => {
    const company = companyOf(x);
    if (!company) return toast("Company for this quotation no longer exists", "error");
    setBusyId(x.id);
    try {
      const { downloadPdf } = await import("@/components/pdf/actions");
      await downloadPdf(buildView({ ...x, company, settings }));
    } catch (e) {
      toast(`Could not create PDF: ${errorMessage(e)}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (x: Quotation) => {
    if (!confirm(`Delete quotation ${x.quotation_no}? This cannot be undone.`)) return;
    try {
      await repo.deleteQuotation(x.id);
      toast(`Deleted ${x.quotation_no}`);
      load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const active = companies.filter((c) => c.is_active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Quotations</h1>
          <p className="text-sm text-slate-500">Create, download and manage quotations for every Kannan group company.</p>
        </div>
        <Link href="/quotations/new">
          <Button>+ New Quotation</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((c) => {
          const mine = (list ?? []).filter((x) => x.company_id === c.id);
          return (
            <button
              key={c.id}
              onClick={() => setCompanyId(companyId === c.id ? "" : c.id)}
              className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow ${companyId === c.id ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200"}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                <CompanyLogo company={c} size={44} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{c.company_name}</span>
                <span className="block text-xs text-slate-500">
                  {mine.length} quotation{mine.length === 1 ? "" : "s"} · {formatINR(mine.reduce((s, x) => s + x.totals.grand_total, 0))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Card
        title="All quotations"
        actions={
          <>
            <Input placeholder="Search number, customer, material…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 py-1.5" />
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-auto py-1.5" aria-label="Filter by company">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </Select>
          </>
        }
      >
        {!list ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            {list.length ? "No quotations match your filters." : "No quotations yet."}{" "}
            <Link href="/quotations/new" className="text-brand-700 underline">Create a quotation</Link>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-2 font-medium sm:px-5">Quotation No</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Company</th>
                  <th className="px-2 py-2 font-medium">Customer</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid="quotation-row">
                    <td className="px-4 py-2.5 font-medium sm:px-5">
                      <Link href={`/quotations/${x.id}`} className="text-brand-700 hover:underline">{x.quotation_no}</Link>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">{formatDate(x.quotation_date)}</td>
                    <td className="max-w-[180px] truncate px-2 py-2.5 text-slate-600">{companyOf(x)?.company_name ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-2 py-2.5">{x.customer.name}</td>
                    <td className="px-2 py-2.5 text-right font-medium whitespace-nowrap">{formatINR(x.totals.grand_total)}</td>
                    <td className="px-2 py-2.5">
                      <Badge tone={STATUS_TONE[x.status]}>{x.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 sm:px-5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => download(x)} disabled={busyId === x.id}>
                          {busyId === x.id ? "…" : "PDF"}
                        </Button>
                        <Link href={`/quotations/new?from=${x.id}`}>
                          <Button size="sm" variant="ghost">Duplicate</Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(x)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
