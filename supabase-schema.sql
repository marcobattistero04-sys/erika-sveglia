-- ============================================================
-- Erika Bus · Sveglie Autisti – Schema Supabase
-- Esegui questo file nell'editor SQL di Supabase
-- ============================================================

create extension if not exists "uuid-ossp";

-- Autisti
create table if not exists drivers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text not null,
  created_at timestamptz default now()
);

-- Sveglie
create table if not exists alarms (
  id uuid default uuid_generate_v4() primary key,
  driver_id uuid references drivers(id) on delete cascade not null,
  alarm_date date not null,
  alarm_time time not null,
  note text default '',
  escalation_minutes int default 15,
  enabled boolean default true,
  state text default 'pending',   -- pending | ringing | escalating | done | dismissed
  triggered_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz default now()
);

-- Impostazioni globali (numero ufficio, ecc.)
create table if not exists settings (
  key text primary key,
  value text not null
);
insert into settings (key, value) values
  ('office_phone', '+39 06 0000000'),
  ('office_sms',   '+39 333 0000000')
on conflict (key) do nothing;

-- RLS: abilita ma permetti tutto (app interna)
alter table drivers enable row level security;
alter table alarms  enable row level security;
alter table settings enable row level security;

create policy "public_all_drivers"  on drivers  for all using (true) with check (true);
create policy "public_all_alarms"   on alarms   for all using (true) with check (true);
create policy "public_all_settings" on settings for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table alarms;
alter publication supabase_realtime add table drivers;
