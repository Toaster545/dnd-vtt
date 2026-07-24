-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- 1. User profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  username text not null unique,
  role text not null default 'player' check (role in ('admin', 'player')),
  created_at timestamptz default now()
);

-- 2. Characters (owned by the player who created them)
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  race text not null default '',
  class text not null default '',
  subclass text default '',
  level integer not null default 1,
  background text not null default '',
  alignment text not null default 'True Neutral',
  ability_scores jsonb not null default '{"strength":10,"dexterity":10,"constitution":10,"intelligence":10,"wisdom":10,"charisma":10}'::jsonb,
  max_hp integer not null default 10,
  current_hp integer not null default 10,
  armor_class integer not null default 10,
  speed integer not null default 30,
  proficiency_bonus integer not null default 2,
  skills jsonb not null default '{}'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  spells jsonb not null default '[]'::jsonb,
  notes text default '',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- 4. Battle maps
create table public.battle_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  name text not null,
  image_url text not null,
  uvtt_data jsonb,
  grid_size integer not null default 50,
  created_at timestamptz default now()
);

-- 5. Map tokens (live positions, sync via Realtime)
create table public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references public.battle_maps(id) on delete cascade not null,
  label text not null,
  color text not null default '#e74c3c',
  x integer not null default 0,
  y integer not null default 0,
  size integer not null default 1,
  hp integer,
  max_hp integer,
  is_player boolean not null default false
);

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.campaigns enable row level security;
alter table public.battle_maps enable row level security;
alter table public.map_tokens enable row level security;

-- profiles: users read their own; admins read all
create policy "Users read own profile"      on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile"    on public.profiles for update using (auth.uid() = id);
create policy "Service insert profile"      on public.profiles for insert with check (auth.uid() = id);

-- characters: players manage their own; admin can read all
create policy "Players manage own chars"    on public.characters for all using (auth.uid() = user_id);
create policy "Admin reads all chars"       on public.characters for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- battle_maps: everyone authenticated can read; admin can write
create policy "Anyone reads maps"           on public.battle_maps for select using (auth.role() = 'authenticated');
create policy "Admin writes maps"           on public.battle_maps for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- map_tokens: everyone can read; admin can write
create policy "Anyone reads tokens"         on public.map_tokens for select using (auth.role() = 'authenticated');
create policy "Admin writes tokens"         on public.map_tokens for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- campaigns: admin only
create policy "Admin manages campaigns"     on public.campaigns for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ─── Enable Realtime for token sync ───────────────────────────────────────────
alter publication supabase_realtime add table public.map_tokens;

-- ─── Storage bucket for map images ────────────────────────────────────────────
-- Run this separately in Storage → New Bucket (or via SQL):
insert into storage.buckets (id, name, public) values ('maps', 'maps', true)
  on conflict do nothing;

create policy "Anyone reads map images"     on storage.objects for select using (bucket_id = 'maps');
create policy "Admin uploads map images"    on storage.objects for insert with check (
  bucket_id = 'maps' and
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
