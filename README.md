# Thai Personal & Family Expense Scanner

Foundation for a Thai household expense and tax receipt scanner PWA.

## Implemented in this pass

### Step 1 — Supabase schema

`supabase/migrations/20260828000000_initial_schema.sql` creates:

- The requested `users`, `receipts`, `split_bills`, and `merchant_mappings` tables.
- Supporting `households`, `household_members`, and `line_group_households` tables required to enforce shared-expense access safely.
- RLS policies for private receipts, household-shared receipts, split bills, and private receipt-image storage.
- A private `receipt-images` Storage bucket.

The receipts.image_url field stores the bucket-relative Storage object path, using:
<uploader-user-id>/<receipt-id>.<ext> in the private receipt-images bucket.

### Step 2 — Gemini OCR

`POST /api/scan-receipt` accepts either:

- `multipart/form-data` with an `image` field; or
- JSON `{ "imageBase64": "...", "mimeType": "image/jpeg" }`.

The route requires a Supabase-authenticated user, sends the image to Gemini with a structured JSON schema, validates the response with Zod, and validates Thai 13-digit tax ID checksums.

### Step 3 — Review and save

The dashboard now lets users review and edit the OCR result, upload the receipt image to the private receipt-images bucket, and save the approved fields to public.receipts through Supabase RLS.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase and Gemini values.
2. Apply the migration with the Supabase CLI or SQL Editor.
3. Install dependencies and run `npm run dev`.

`GEMINI_MODEL` defaults to `gemini-1.5-flash` and can be overridden without changing the route.
