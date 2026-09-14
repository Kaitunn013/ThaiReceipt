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

### Step 3 — Multi-upload and automatic save

The dashboard accepts multiple receipt images, optimizes each image on the device, scans them sequentially, and automatically saves each successful OCR result to the private receipt-images bucket and public.receipts through Supabase RLS. The full OCR payload is not retained; saved fields can be edited later from each receipt's detail page.

### Step 4 — Receipt history and details

The dashboard reads the signed-in user's 20 most recently saved receipts from Supabase, newest first. Saving a receipt refreshes the history immediately; refreshing the page reads the persisted records again.

Each history item opens `/dashboard/receipts/<id>` with the approved fields, memo, and receipt image. Both pages require authentication and filter by the current user in addition to RLS. Images use a five-minute signed URL from the private bucket; the reload button can request a fresh link. The PWA configuration uses NetworkOnly for authenticated pages and Supabase data/images.

To check the flow locally: sign in, select one or more receipt images, and wait for each successful image to be scanned and saved automatically. Open a saved item from history to edit its fields after upload, then refresh both the dashboard and detail page. The same saved data and image should still be available. Missing or inaccessible receipts show a not-found page; query and image failures offer a reload action. The detail page includes a user-confirmed permanent delete action for both the database row and its private image.

Verification: TypeScript and an isolated production build passed. Browser checks with mocked OCR/Supabase covered multi-upload, automatic saving, post-upload editing, automatic history updates, page reloads, detail/image retries, access filtering, owner-only deletion, and mobile layout. Existing database RLS was checked read-only. PWA service-worker activation timed out in the test environment, so runtime offline/cache behavior still needs verification before relying on PWA support.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase and Gemini values.
2. Apply the migration with the Supabase CLI or SQL Editor.
3. Install dependencies and run `npm run dev`.

## LINE Login account linking

The dashboard can link an existing Supabase account to LINE without replacing email login.

1. Create a LINE Login channel under the same `Seepla` provider as the Messaging API channel.
2. Register `https://seepla.vercel.app/auth/line/callback` as the LINE Login callback URL.
3. Add `LINE_LOGIN_CHANNEL_ID` as a Config variable and `LINE_LOGIN_CHANNEL_SECRET` as a Secret in Vercel Production.
4. Redeploy, sign in to the website, and select `เชื่อมต่อด้วย LINE` in the Dashboard.

The LINE Login and Messaging API channels must stay under the same provider so the LINE user ID can be matched across both channels.

Text messages are also supported in the LINE chat. Send a description followed by the amount, for example: กะเพรา 40 or ค่าไฟ 850 บาท. The server uses the Bangkok date, classifies the category with local keywords, and saves the entry without an image. Receipt images use Gemini's suggested category and fall back to the same keyword classifier when Gemini returns other.

## LINE webhook receipt intake

The webhook accepts one-to-one image messages from LINE users who have already linked their LINE account in the Dashboard. It verifies the LINE signature, acknowledges the message immediately, then downloads the private image, scans it with Gemini, saves the image and approved receipt fields, and sends the result back to LINE. Group chats are intentionally ignored in this first version.

Production setup:

1. Add SUPABASE_SERVICE_ROLE_KEY as a Secret in Vercel Production. Do not use a public prefix and do not expose this key to the browser.
2. Deploy the latest commit.
3. In the LINE Developers Console, open the Messaging API channel and set the webhook URL to https://seepla.vercel.app/api/line/webhook.
4. Enable Use webhook. Disable automatic replies and greeting messages to avoid duplicate responses.
5. Send a receipt image to the LINE Official Account. The LINE user must first be connected from the signed-in Seepla Dashboard.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`, which is suited to low-latency structured receipt extraction. The route automatically tries a fallback model when Gemini reports temporary unavailability.
