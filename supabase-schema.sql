-- Study Quest Cloud schema for Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exam_name text,
  exam_date date,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exam_date date not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_completed boolean not null default false,
  completed_on date,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hours numeric(5,2) not null check (hours > 0),
  studied_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  priority int not null check (priority between 1 and 10),
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Keep Auth signup compatible with this schema by inserting profiles.user_id.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  exception
    when others then
      -- Do not block auth user creation if legacy profiles schema is incompatible.
      raise warning 'handle_new_user skipped profile insert: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Migration guard: if these tables already existed from an older schema,
-- ensure required columns exist before policies and queries reference them.
alter table public.profiles add column if not exists user_id uuid;
alter table public.habits add column if not exists user_id uuid;
alter table public.study_logs add column if not exists user_id uuid;
alter table public.study_logs add column if not exists studied_at timestamptz;
alter table public.rewards add column if not exists user_id uuid;

-- Backfill study_logs.studied_at if legacy rows relied on created_at.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_logs'
      and column_name = 'created_at'
  ) then
    execute 'update public.study_logs set studied_at = created_at where studied_at is null';
  end if;
end
$$;

update public.study_logs
set studied_at = timezone('utc'::text, now())
where studied_at is null;

alter table public.study_logs
  alter column studied_at set default timezone('utc'::text, now()),
  alter column studied_at set not null;

-- Backfill profiles.user_id from profiles.id if that legacy column exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
  ) then
    execute 'update public.profiles set user_id = id where user_id is null';
  end if;
end
$$;

alter table public.profiles
  alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.habits enable row level security;
alter table public.study_logs enable row level security;
alter table public.rewards enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

drop policy if exists "exams_select_own" on public.exams;
drop policy if exists "exams_insert_own" on public.exams;
drop policy if exists "exams_update_own" on public.exams;
drop policy if exists "exams_delete_own" on public.exams;

drop policy if exists "habits_select_own" on public.habits;
drop policy if exists "habits_insert_own" on public.habits;
drop policy if exists "habits_update_own" on public.habits;
drop policy if exists "habits_delete_own" on public.habits;

drop policy if exists "study_logs_select_own" on public.study_logs;
drop policy if exists "study_logs_insert_own" on public.study_logs;
drop policy if exists "study_logs_update_own" on public.study_logs;
drop policy if exists "study_logs_delete_own" on public.study_logs;

drop policy if exists "rewards_select_own" on public.rewards;
drop policy if exists "rewards_insert_own" on public.rewards;
drop policy if exists "rewards_update_own" on public.rewards;
drop policy if exists "rewards_delete_own" on public.rewards;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "exams_select_own"
  on public.exams for select
  to authenticated
  using (auth.uid() = user_id);

create policy "exams_insert_own"
  on public.exams for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "exams_update_own"
  on public.exams for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exams_delete_own"
  on public.exams for delete
  to authenticated
  using (auth.uid() = user_id);
