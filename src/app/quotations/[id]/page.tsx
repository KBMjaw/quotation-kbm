"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useData } from "@/components/DataProvider";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { Spinner } from "@/components/ui";
import type { Quotation } from "@/lib/types";

export default function EditQuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { repo } = useData();
  const [q, setQ] = useState<Quotation | null | undefined>(undefined);

  useEffect(() => {
    repo.getQuotation(id).then(setQ).catch(() => setQ(null));
  }, [id, repo]);

  if (q === undefined) return <Spinner />;
  if (q === null)
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Quotation not found. <Link href="/" className="text-brand-700 underline">Back to quotations</Link>
      </div>
    );
  return <QuotationEditor key={q.id} initial={q} />;
}
