create table public.category_budgets (
  user_id uuid not null references public.users(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  category text not null check (category in (
    'food',
    'groceries',
    'transportation',
    'utilities',
    'healthcare',
    'education',
    'shopping',
    'housing',
    'tax_deductible',
    'other'
  )),
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, month, category)
);

create index category_budgets_user_month_idx on public.category_budgets(user_id, month);

alter table public.category_budgets enable row level security;

create policy "Users can read their own category budgets"
  on public.category_budgets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own category budgets"
  on public.category_budgets for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own category budgets"
  on public.category_budgets for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own category budgets"
  on public.category_budgets for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.category_budgets to authenticated;
