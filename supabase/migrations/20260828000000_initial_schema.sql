-- Personal & Family Expense & Tax Receipt Scanner
-- Supabase/PostgreSQL migration for Step 1.
-- Storage convention: <uploader-user-id>/<receipt-id>.<ext> in the receipt-images bucket

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'member');
create type public.household_member_role as enum ('owner', 'admin', 'member');
create type public.split_bill_status as enum ('pending', 'settled', 'cancelled');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  line_user_id text unique,
  display_name text not null default 'New user',
  avatar_url text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.household_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Maps LINE group chats to a household. This is used by the Step 3 webhook.
create table public.line_group_households (
  line_group_id text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete restrict,
  image_url text not null,
  vendor_name text,
  tax_id text check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  date date,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  withholding_tax numeric(12, 2) not null default 0 check (withholding_tax >= 0),
  is_tax_invoice boolean not null default false,
  category text not null default 'other',
  is_shared_expense boolean not null default false,
  raw_ai_json jsonb,
  created_at timestamptz not null default now(),
  constraint receipts_shared_household_check check (
    (is_shared_expense = false and household_id is null)
    or (is_shared_expense = true and household_id is not null)
  )
);

create table public.split_bills (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  payer_id uuid not null references public.users(id) on delete restrict,
  debtor_id uuid not null references public.users(id) on delete restrict,
  amount_owed numeric(12, 2) not null check (amount_owed > 0),
  status public.split_bill_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint split_bill_distinct_users check (payer_id <> debtor_id)
);

create table public.merchant_mappings (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null check (length(trim(raw_name)) between 1 and 200),
  mapped_category text not null default 'other',
  default_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index household_members_user_id_idx on public.household_members(user_id);
create index receipts_user_id_created_at_idx on public.receipts(user_id, created_at desc);
create index receipts_household_id_created_at_idx on public.receipts(household_id, created_at desc);
create index receipts_shared_expense_idx on public.receipts(is_shared_expense) where is_shared_expense = true;
create index split_bills_receipt_id_idx on public.split_bills(receipt_id);
create index split_bills_debtor_status_idx on public.split_bills(debtor_id, status);
create index split_bills_payer_status_idx on public.split_bills(payer_id, status);
create index merchant_mappings_raw_name_idx on public.merchant_mappings(lower(raw_name));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.add_household_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (household_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute procedure public.add_household_owner();

create or replace function public.is_household_member(
  p_household_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function public.is_household_admin(
  p_household_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = coalesce(p_user_id, auth.uid())
      and hm.role in ('owner', 'admin')
  );
$$;

create or replace function public.enforce_shared_receipt_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_shared_expense then
    if new.household_id is null
       or not exists (
         select 1
         from public.household_members hm
         where hm.household_id = new.household_id
           and hm.user_id = new.user_id
       ) then
      raise exception 'Shared receipts require the owner to belong to the household';
    end if;
  else
    new.household_id := null;
  end if;
  return new;
end;
$$;

create trigger receipts_shared_household_guard
  before insert or update on public.receipts
  for each row execute procedure public.enforce_shared_receipt_household();

create or replace function public.prevent_user_role_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'User role changes must be performed by a trusted server process';
  end if;
  return new;
end;
$$;

create trigger users_role_guard
  before update on public.users
  for each row execute procedure public.prevent_user_role_escalation();

alter table public.users enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.line_group_households enable row level security;
alter table public.receipts enable row level security;
alter table public.split_bills enable row level security;
alter table public.merchant_mappings enable row level security;

create policy "Users can read their own profile"
  on public.users for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.users for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.users for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Household members can read their households"
  on public.households for select to authenticated
  using ((select public.is_household_member(id, (select auth.uid()))));

create policy "Users can create households"
  on public.households for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Household admins can update households"
  on public.households for update to authenticated
  using ((select public.is_household_admin(id, (select auth.uid()))))
  with check ((select public.is_household_admin(id, (select auth.uid()))));

create policy "Household owners can delete households"
  on public.households for delete to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = id
        and hm.user_id = (select auth.uid())
        and hm.role = 'owner'
    )
  );

create policy "Household members can read membership"
  on public.household_members for select to authenticated
  using ((select public.is_household_member(household_id, (select auth.uid()))));

create policy "Household admins can add members"
  on public.household_members for insert to authenticated
  with check ((select public.is_household_admin(household_id, (select auth.uid()))));

create policy "Household admins can update members"
  on public.household_members for update to authenticated
  using ((select public.is_household_admin(household_id, (select auth.uid()))))
  with check ((select public.is_household_admin(household_id, (select auth.uid()))));

create policy "Household admins can remove members"
  on public.household_members for delete to authenticated
  using ((select public.is_household_admin(household_id, (select auth.uid()))));

create policy "Household members can read LINE group mappings"
  on public.line_group_households for select to authenticated
  using ((select public.is_household_member(household_id, (select auth.uid()))));

create policy "Household admins can manage LINE group mappings"
  on public.line_group_households for all to authenticated
  using ((select public.is_household_admin(household_id, (select auth.uid()))))
  with check ((select public.is_household_admin(household_id, (select auth.uid()))));

create policy "Users can read private or shared household receipts"
  on public.receipts for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_shared_expense
      and (select public.is_household_member(household_id, (select auth.uid())))
    )
  );

create policy "Users can insert their own receipts"
  on public.receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (is_shared_expense = false and household_id is null)
      or (
        is_shared_expense = true
        and (select public.is_household_member(household_id, (select auth.uid())))
      )
    )
  );

create policy "Users can update their own receipts"
  on public.receipts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      (is_shared_expense = false and household_id is null)
      or (
        is_shared_expense = true
        and (select public.is_household_member(household_id, (select auth.uid())))
      )
    )
  );

create policy "Users can delete their own receipts"
  on public.receipts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read permitted split bills"
  on public.split_bills for select to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_id
        and (
          r.user_id = (select auth.uid())
          or (
            r.is_shared_expense
            and (select public.is_household_member(r.household_id, (select auth.uid())))
          )
        )
    )
  );

create policy "Receipt owners can create split bills"
  on public.split_bills for insert to authenticated
  with check (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_id
        and r.user_id = (select auth.uid())
        and (
          r.is_shared_expense = false
          or (
            (select public.is_household_member(r.household_id, payer_id))
            and (select public.is_household_member(r.household_id, debtor_id))
          )
        )
    )
  );

create policy "Receipt owners can update split bills"
  on public.split_bills for update to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

create policy "Receipt owners can delete split bills"
  on public.split_bills for delete to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

create policy "Authenticated users can read merchant mappings"
  on public.merchant_mappings for select to authenticated
  using (true);

-- Admin mappings are intended to be managed by a trusted backend/service role.
-- The admin policy also supports authenticated admin tooling once role management exists.
create policy "Admins can manage merchant mappings"
  on public.merchant_mappings for all to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public)
values ('receipt-images', 'receipt-images', false)
on conflict (id) do update set public = false;

create policy "Users can upload their own receipt images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can read private or shared receipt images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipt-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.receipts r
        where r.image_url = name
          and r.is_shared_expense
          and (select public.is_household_member(r.household_id, (select auth.uid())))
      )
    )
  );

create policy "Users can update their own receipt images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own receipt images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

revoke all on function public.is_household_member(uuid, uuid) from public;
revoke all on function public.is_household_admin(uuid, uuid) from public;
grant execute on function public.is_household_member(uuid, uuid) to authenticated;
grant execute on function public.is_household_admin(uuid, uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.line_group_households to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.split_bills to authenticated;
grant select, insert, update, delete on public.merchant_mappings to authenticated;
