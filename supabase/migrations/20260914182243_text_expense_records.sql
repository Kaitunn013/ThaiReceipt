-- Text entries from LINE do not have an uploaded receipt image.
alter table public.receipts
  alter column image_url drop not null;
