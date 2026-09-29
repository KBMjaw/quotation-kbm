"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useData } from "@/components/DataProvider";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { Spinner } from "@/components/ui";
import type { Quotation } from "@/lib/types";

function NewQuotation() {
  const from = useSearchParams().get("from");
  const { repo } = useData();
  const [source, setSource] = useState<Quotation | null | undefined>(from ? undefined : null);

  useEffect(() => {
    if (from) repo.getQuotation(from).then(setSource);
  }, [from, repo]);

  if (source === undefined) return <Spinner />;
  return <QuotationEditor duplicateOf={source ?? undefined} />;
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewQuotation />
    </Suspense>
  );
}
