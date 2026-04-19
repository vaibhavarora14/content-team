create table if not exists public.messages (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) > 0),
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Allow anonymous read access'
  ) then
    create policy "Allow anonymous read access"
      on public.messages
      for select
      to anon
      using (true);
  end if;
end $$;
