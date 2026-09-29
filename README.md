# KIPIPL Quotation Maker

Create professional, A4 PDF quotations for the Kannan group companies:
**Kannan Blue Metals**, **Kannan Ready Mix Concrete** and **Kannan Infra Projects India Private Limited**.
Add more companies, materials and unit types from **Settings**; no code changes needed.

## Features

- **Company selection & switching.** Pick "Quotation For" before you start. The company's logo, address, GSTIN, terms, footer and numbering load automatically. Switching company updates the preview straight away and keeps the customer and material lines.
- **Company-specific numbering.** For example `KBM-QTN-0001`, `KRMC-QTN-0001`, `KIPIPL-QTN-0001`. The format is configurable (`{PREFIX}`, `{SEQ}`, `{YYYY}`, `{YY}`, `{MM}`, `{FY}`) and so is each company's next number.
- **Materials & unit types.** Both are managed in Settings. Each material has a default unit and a list of available units, for example Flyash → MT and M3. Inactive materials and units can't be picked on new quotations, but old quotations still show them.
- **Line items.** Each line has material, description, HSN, quantity, unit, rate and discount %. Totals are calculated automatically, with optional round-off and amount in words (lakh/crore).
- **Product-level GST.** Each material has its own GST rate (0/5/12/18/28 % or any custom value) and tax type (GST or Exempt), set in Settings → Materials.
  - The rate fills in automatically when the material is picked, and GST is calculated per line.
  - The quotation shows Taxable Value, GST %, GST Amount and Total per line, plus a GST summary grouped by rate.
  - Tax type is CGST + SGST (intra-state) or IGST (inter-state). It is picked automatically when the company and customer GSTIN state codes are both known.
  - Each line stores the GST rate used when it was saved. If a material's rate changes later, old quotations keep their original GST.
  - Only admins can override a line's GST.
- **Professional PDF.** Uses @react-pdf/renderer to produce a real vector PDF on A4. It includes the logo, the company header, bill-to and delivery address, and quotation details. The table header repeats on every page and rows never split across pages. It also has a totals block, bank details, terms, the signature block, and a footer with "Page X of Y". Print sends the same PDF to the printer.
- **Four-step flow.** Company → Customer → Materials → Review (live preview) → Save → Download or Print.
- **Validation.** Required fields, positive quantities, valid rates, GSTIN/PAN/PIN/email formats. Duplicate company names, material names and unit codes are rejected. Units, materials and companies that are in use can be disabled but not deleted.

## Storage modes

| Mode | When | Data | Access control |
|---|---|---|---|
| **Browser** (default) | No Supabase env vars | `localStorage` on the device | Optional admin PIN locks Settings. This is a convenience lock, not real security. |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | Postgres tables plus the `company-logos` storage bucket | Email/password sign-in with row-level security. Only `admin` users can change companies, materials, units and settings. |

### Enabling Supabase

1. Create a Supabase project.
2. Run the files in `supabase/migrations/` in order, in the SQL editor or with `supabase db push`.
   - They create the tables (`companies`, `materials`, `material_units`, `unit_types`, `quotation_settings`, `quotations`, `quotation_items`, `profiles`), the RLS policies, the logo bucket and the seed data.
   - `…_product_gst.sql` adds the material GST columns and the company GSTINs. It also adds triggers that set each line's GST rate from the material configuration, compute line CGST/SGST/IGST, and recompute the quotation totals and GST summary in the database.
   - Both files are idempotent and never create duplicate records.
3. Set the two env vars (see `.env.example`) in Vercel and redeploy.
4. Sign up in the app. **The first account becomes admin.** Later accounts are normal users. Promote them with
   `update profiles set role = 'admin' where email = '…';`

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (calculations, numbering, validation, repository rules)
npm run lint       # type-check
npm run build
```

Code map:

- `src/lib/`: types, calculations, GST engine (`tax.ts`), numbering, validation, seed data
- `src/lib/data/`: `Repo` (business rules) over a `LocalBackend` or `SupabaseBackend`
- `src/components/quotation/`: editor, items, HTML preview
- `src/components/pdf/`: PDF document and download/print
- `src/components/settings/`: Companies, Materials, Unit Types, Quotation Settings
- `public/fonts/`: Noto Sans, subset with the ₹ glyph added, embedded in PDFs
