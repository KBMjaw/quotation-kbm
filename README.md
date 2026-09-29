# KIPIPL Quotation Maker

Create professional, A4 PDF quotations for the Kannan group companies:
**Kannan Blue Metals**, **Kannan Ready Mix Concrete** and **Kannan Infra Projects India Private Limited**.
Add more companies, materials and unit types from **Settings**; no code changes needed.

## Features

- **Company selection & switching.** Pick "Quotation For" before you start. The company's logo, address, GSTIN, terms, footer and numbering load automatically. Switching company updates the preview straight away and keeps the customer and material lines.
- **Company-specific numbering.** For example `KBM-QTN-0001`, `KRMC-QTN-0001`, `KIPIPL-QTN-0001`. The format is configurable (`{PREFIX}`, `{SEQ}`, `{YYYY}`, `{YY}`, `{MM}`, `{FY}`) and so is each company's next number.
- **Materials & unit types.** Both are managed in Settings. Each material has a default unit and a list of available units, for example Flyash → MT and M3. Inactive materials and units can't be picked on new quotations, but old quotations still show them.
- **Line items.** Each line has material, description, HSN, quantity, unit, rate, discount % and GST %. Totals are calculated automatically: CGST+SGST or IGST split by rate, optional round-off, and amount in words (lakh/crore).
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
2. Run `supabase/migrations/20260929000000_quotation_maker.sql` in the SQL editor, or use `supabase db push`. It creates the tables (`companies`, `materials`, `material_units`, `unit_types`, `quotation_settings`, `quotations`, `quotation_items`, `profiles`), the RLS policies, the logo bucket and the seed data. It is idempotent and never creates duplicate records.
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

- `src/lib/`: types, calculations, numbering, validation, seed data
- `src/lib/data/`: `Repo` (business rules) over a `LocalBackend` or `SupabaseBackend`
- `src/components/quotation/`: editor, items, HTML preview
- `src/components/pdf/`: PDF document and download/print
- `src/components/settings/`: Companies, Materials, Unit Types, Quotation Settings
- `public/fonts/`: Noto Sans, subset with the ₹ glyph added, embedded in PDFs
