-- Keep the reviewed memo without retaining the full OCR payload.
alter table public.receipts
  add column if not exists memo text;

update public.receipts
set memo = nullif(btrim(raw_ai_json ->> 'memo'), '')
where memo is null
  and jsonb_typeof(raw_ai_json) = 'object'
  and jsonb_typeof(raw_ai_json -> 'memo') = 'string';

-- Keep the legacy nullable column for compatibility, but remove stored OCR payloads.
update public.receipts
set raw_ai_json = null
where raw_ai_json is not null;
