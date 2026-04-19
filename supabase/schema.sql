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

create extension if not exists pgcrypto;

create table if not exists public.search_runs (
  id uuid primary key default gen_random_uuid(),
  brand_brief text not null check (char_length(brand_brief) > 0),
  derived_queries jsonb not null default '[]'::jsonb,
  gl text not null default 'us',
  hl text not null default 'en',
  status text not null default 'created',
  source_provider text not null default 'oxylabs',
  query_latency_ms integer,
  fetched_count integer not null default 0,
  scraped_count integer not null default 0,
  provider_request_id text,
  failure_stage text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_runs(id) on delete cascade,
  query text not null,
  rank integer not null,
  title text not null,
  url text not null,
  snippet text not null default '',
  source text not null default 'organic',
  created_at timestamptz not null default now()
);

create unique index if not exists source_results_run_id_query_rank_idx
  on public.source_results (run_id, query, rank);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_runs(id) on delete cascade,
  source_result_id uuid references public.source_results(id) on delete set null,
  url text not null,
  title text not null default '',
  extracted_text text not null default '',
  char_count integer not null default 0,
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index if not exists source_documents_run_id_idx
  on public.source_documents (run_id);

create table if not exists public.topic_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_runs(id) on delete cascade,
  title text not null,
  angle text not null,
  why_now text not null,
  confidence numeric(4, 3) not null default 0.5,
  source_result_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists topic_candidates_run_id_idx
  on public.topic_candidates (run_id);

create table if not exists public.video_scripts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_runs(id) on delete cascade,
  topic_candidate_id uuid references public.topic_candidates(id) on delete set null,
  title text not null,
  hook text not null,
  body_points jsonb not null default '[]'::jsonb,
  cta text not null,
  duration_sec integer not null check (duration_sec between 30 and 60),
  llm_provider text not null default 'zen',
  llm_model text,
  llm_endpoint text not null default '/responses',
  prompt_version text not null default 'scripts_v1',
  latency_ms integer,
  token_usage_json jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists video_scripts_run_id_idx
  on public.video_scripts (run_id);
