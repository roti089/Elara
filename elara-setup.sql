-- =====================================================================
-- ELARA: complete database setup
-- Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run more than once. It replaces supabase-setup.sql and
-- elara-household-setup.sql (you do not need to run those any more).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Key/value store for every dashboard (tasks, devices, events ...)
-- ---------------------------------------------------------------------
create table if not exists public.elara_user_data (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.elara_user_data add column if not exists updated_by uuid;
alter table public.elara_user_data enable row level security;

-- every write gets an exact timestamp (used to detect two people saving at once)
create or replace function public.elara_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists elara_touch on public.elara_user_data;
create trigger elara_touch before insert or update on public.elara_user_data
  for each row execute function public.elara_touch();

-- personal keys never leave the person's own account
create or replace function public.elara_is_personal(k text) returns boolean
language sql immutable as $$
  select k ~ '^elara(FirstName|LastName|Email|Phone|ProfileImage|LoginActivity|Theme|NotifPrefs|LocationConsent|MyLocation|VoicePrefs|Alerts|Fired|NotifDismissed)(:.*)?$'
$$;

-- which part of the home a key belongs to (used for member permissions)
create or replace function public.elara_key_area(k text) returns text
language sql immutable as $$
  select case
    when k ~ '^elara(Tasks|Chores)$' then 'tasks'
    when k ~ '^elara(ShoppingItems|CartItems|Receipts|Warranties|ShoppingActivities|Pantry|Meals)$' then 'shopping'
    when k ~ '^elara(Schedules|ScheduleLog|CalendarSources)$' then 'schedule'
    when k ~ '^elara(Devices|EnergyLog|MeterState|MeterKwh|Automations|AutomationRuns|CbiLinked|EnergySample|IncludeEstimates|Tariff|Prepaid|Loadshedding|LoadsheddingArea)$' then 'smartHome'
    when k ~ '^elara(Activity|Presence|Availability)$' then 'common'
    else 'home'
  end
$$;

-- ---------------------------------------------------------------------
-- 2. Households: who belongs to whose home, and what they may see
--    permissions = {"tasks":"edit","shopping":"view","schedule":"edit",
--                   "smartHome":"none","analytics":"view","reports":"none"}
-- ---------------------------------------------------------------------
create table if not exists public.elara_household_links (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  member_id   uuid          references auth.users(id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        text not null default 'member',
  status      text not null default 'pending' check (status in ('pending','active')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (owner_id, email)
);
alter table public.elara_household_links add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.elara_household_links add column if not exists name text;
create index if not exists elara_links_member_idx on public.elara_household_links (member_id);

do $$ begin
  alter table public.elara_household_links add constraint elara_links_role_chk check (role in ('adult','member','guest')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.elara_household_links add constraint elara_links_name_chk check (name is null or char_length(name) <= 60) not valid;
exception when duplicate_object then null; end $$;

alter table public.elara_household_links enable row level security;

-- the household I belong to (my own id if I'm not a member of anyone else's)
create or replace function public.elara_my_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select owner_id from elara_household_links
      where member_id = auth.uid() and status = 'active'
      order by accepted_at limit 1),
    auth.uid())
$$;

-- my access level to one area of one home: 'edit' | 'view' | 'none'
create or replace function public.elara_access(p_owner uuid, p_area text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'none'
    when p_owner = auth.uid() then 'edit'
    else coalesce((
      select case
        when p_area = 'common' then 'edit'
        when p_area in ('home','members') then 'view'
        else coalesce(nullif(l.permissions ->> p_area, ''), 'none')
      end
      from elara_household_links l
      where l.owner_id = p_owner and l.member_id = auth.uid() and l.status = 'active'
      limit 1), 'none')
  end
$$;

create or replace function public.elara_can_read(p_owner uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when elara_is_personal(k) then p_owner = auth.uid()
    else elara_access(p_owner, elara_key_area(k)) <> 'none'
      -- analytics and reports are built from the device, task, shopping and schedule data
      or (elara_key_area(k) = 'smartHome' and (elara_access(p_owner,'analytics') <> 'none' or elara_access(p_owner,'reports') <> 'none'))
      or (elara_key_area(k) in ('tasks','shopping','schedule') and elara_access(p_owner,'reports') <> 'none')
  end
$$;

create or replace function public.elara_can_write(p_owner uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when elara_is_personal(k) then p_owner = auth.uid()
    else elara_access(p_owner, elara_key_area(k)) = 'edit'
  end
$$;

-- two people are in the same home (used for profiles and notifications)
create or replace function public.elara_same_household(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a = b or exists (
    select 1 from elara_household_links l
    where l.status = 'active' and (
         (l.owner_id = a and l.member_id = b)
      or (l.owner_id = b and l.member_id = a)
      or (l.member_id = a and exists (select 1 from elara_household_links m
                                       where m.owner_id = l.owner_id and m.member_id = b and m.status = 'active'))))
$$;

-- ----- data policies: one set that covers owners AND members -----
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'elara_user_data' loop
    execute format('drop policy %I on public.elara_user_data', p.policyname);
  end loop;
end $$;

create policy "elara read"   on public.elara_user_data for select to authenticated using (elara_can_read(user_id, key));
create policy "elara insert" on public.elara_user_data for insert to authenticated with check (elara_can_write(user_id, key));
create policy "elara update" on public.elara_user_data for update to authenticated using (elara_can_write(user_id, key)) with check (elara_can_write(user_id, key));
create policy "elara delete" on public.elara_user_data for delete to authenticated using (elara_can_write(user_id, key));

-- ----- household link policies -----
revoke all on public.elara_household_links from anon, authenticated;
grant select, insert, delete on public.elara_household_links to authenticated;
grant update (role, permissions, name) on public.elara_household_links to authenticated;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'elara_household_links' loop
    execute format('drop policy %I on public.elara_household_links', p.policyname);
  end loop;
end $$;

create policy "links owner select" on public.elara_household_links for select to authenticated using (owner_id = auth.uid());
create policy "links owner insert" on public.elara_household_links for insert to authenticated
  with check (owner_id = auth.uid() and status = 'pending' and member_id is null and email <> lower(coalesce(auth.jwt() ->> 'email','')));
create policy "links owner update" on public.elara_household_links for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "links owner delete" on public.elara_household_links for delete to authenticated using (owner_id = auth.uid());
-- members see the whole household roster (names, roles, permissions) but cannot change it
create policy "links household select" on public.elara_household_links for select to authenticated using (owner_id = elara_my_owner());
create policy "links member leave" on public.elara_household_links for delete to authenticated using (member_id = auth.uid());

-- accepting invitations (called by the app on every login)
drop function if exists public.elara_accept_invites();
create or replace function public.elara_accept_invites()
returns table (home_owner uuid, home_role text, home_permissions jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;

  update elara_household_links l
     set member_id = auth.uid(), status = 'active', accepted_at = now()
   where l.status = 'pending'
     and l.owner_id <> auth.uid()
     and l.email = lower(coalesce(auth.jwt() ->> 'email', ''))
     and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);

  return query
    select l.owner_id, l.role, l.permissions
      from elara_household_links l
     where l.member_id = auth.uid() and l.status = 'active'
     order by l.accepted_at
     limit 1;
end $$;
revoke all on function public.elara_accept_invites() from public, anon;
grant execute on function public.elara_accept_invites() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Profiles: the name and photo other members of the home see
-- ---------------------------------------------------------------------
create table if not exists public.elara_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  email        text,
  avatar       text check (avatar is null or char_length(avatar) <= 200000),
  updated_at   timestamptz not null default now()
);
alter table public.elara_profiles enable row level security;
drop policy if exists "profiles read"  on public.elara_profiles;
drop policy if exists "profiles write" on public.elara_profiles;
drop policy if exists "profiles update" on public.elara_profiles;
create policy "profiles read"   on public.elara_profiles for select to authenticated using (elara_same_household(user_id, auth.uid()));
create policy "profiles write"  on public.elara_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profiles update" on public.elara_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Notifications (bell + push) and push subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.elara_notifications (
  id         bigserial primary key,
  recipient  uuid not null references auth.users(id) on delete cascade,
  sender     uuid,
  owner_id   uuid,
  kind       text not null default 'general',
  title      text not null check (char_length(title) <= 120),
  body       text check (body is null or char_length(body) <= 400),
  href       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists elara_notif_recipient_idx on public.elara_notifications (recipient, created_at desc);
alter table public.elara_notifications enable row level security;
revoke all on public.elara_notifications from anon, authenticated;
grant select, delete on public.elara_notifications to authenticated;
grant update (read_at) on public.elara_notifications to authenticated;
drop policy if exists "notif read"   on public.elara_notifications;
drop policy if exists "notif update" on public.elara_notifications;
drop policy if exists "notif delete" on public.elara_notifications;
create policy "notif read"   on public.elara_notifications for select to authenticated using (recipient = auth.uid());
create policy "notif update" on public.elara_notifications for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy "notif delete" on public.elara_notifications for delete to authenticated using (recipient = auth.uid());
-- members may leave an in-app notification for someone in the SAME household (used when the push function isn't deployed)
grant insert (recipient, sender, owner_id, kind, title, body, href) on public.elara_notifications to authenticated;
grant usage on sequence public.elara_notifications_id_seq to authenticated;
drop policy if exists "notif send" on public.elara_notifications;
create policy "notif send" on public.elara_notifications for insert to authenticated
  with check (sender = auth.uid() and recipient <> auth.uid() and elara_same_household(recipient, auth.uid())
              and kind in ('tasks','schedule','shopping','smartHome','energy','members','security','general')
              and (href is null or href ~ '^[a-z0-9-]+\.html([?#][A-Za-z0-9=&#._-]*)?$'));

create table if not exists public.elara_push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.elara_push_subscriptions enable row level security;
drop policy if exists "push own" on public.elara_push_subscriptions;
create policy "push own" on public.elara_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reminders already sent by the scheduled job (server only, no policies)
create table if not exists public.elara_reminders_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);
alter table public.elara_reminders_sent enable row level security;

-- ---------------------------------------------------------------------
-- 5. Backups (owners only; the app keeps the 14 newest)
-- ---------------------------------------------------------------------
create table if not exists public.elara_backups (
  id         bigserial primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  label      text check (label is null or char_length(label) <= 80),
  size_bytes integer,
  data       jsonb not null
);
create index if not exists elara_backups_owner_idx on public.elara_backups (owner_id, created_at desc);
alter table public.elara_backups enable row level security;
drop policy if exists "backups own" on public.elara_backups;
create policy "backups own" on public.elara_backups for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Contact form: anyone may SEND a message, nobody can read them
--    through the website (read them in the Supabase Table Editor)
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id         bigserial primary key,
  name       text,
  email      text,
  phone      text,
  message    text,
  created_at timestamptz not null default now()
);
alter table public.contacts enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'contacts' loop
    execute format('drop policy %I on public.contacts', p.policyname);
  end loop;
end $$;
revoke all on public.contacts from anon, authenticated;
grant insert on public.contacts to anon, authenticated;
create policy "contact form insert" on public.contacts for insert to anon, authenticated
  with check (
    char_length(coalesce(name,'')) between 2 and 50
    and coalesce(email,'') ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and char_length(email) <= 120
    and coalesce(phone,'') ~ '^\+?[0-9]{10,15}$'
    and char_length(coalesce(message,'')) between 10 and 500
  );

-- ---------------------------------------------------------------------
-- 6b. Real energy from your smart switches (CBi / Smart Life power meters)
--     Readings are written ONLY through elara_record_power (by the elara-tuya
--     function, every few minutes, and whenever someone has Elara open).
--     Nobody can type in or change energy figures by hand.
-- ---------------------------------------------------------------------
create table if not exists public.elara_energy (
  owner_id uuid not null references auth.users(id) on delete cascade,
  device   text not null check (char_length(device) between 1 and 64),
  hour     timestamptz not null,
  kwh      double precision not null default 0 check (kwh >= 0),
  peak_w   double precision not null default 0,
  samples  integer not null default 0,
  primary key (owner_id, device, hour)
);
create index if not exists elara_energy_owner_hour on public.elara_energy (owner_id, hour);

create table if not exists public.elara_device_state (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  device    text not null check (char_length(device) between 1 and 64),
  last_at   timestamptz not null default now(),
  watts     double precision,          -- null = this switch has no power meter
  is_on     boolean,
  online    boolean,
  total_kwh double precision,          -- the meter's own running total, if it has one
  primary key (owner_id, device)
);
alter table public.elara_device_state add column if not exists on_since timestamptz;   -- when it was last switched on (for "left on" alerts)

alter table public.elara_energy enable row level security;
alter table public.elara_device_state enable row level security;
revoke all on public.elara_energy, public.elara_device_state from anon, authenticated;
grant select on public.elara_energy, public.elara_device_state to authenticated;
drop policy if exists "energy read" on public.elara_energy;
drop policy if exists "device state read" on public.elara_device_state;
create policy "energy read" on public.elara_energy for select to authenticated
  using (elara_access(owner_id, 'smartHome') <> 'none' or elara_access(owner_id, 'analytics') <> 'none' or elara_access(owner_id, 'reports') <> 'none');
create policy "device state read" on public.elara_device_state for select to authenticated
  using (elara_access(owner_id, 'smartHome') <> 'none' or elara_access(owner_id, 'analytics') <> 'none' or elara_access(owner_id, 'reports') <> 'none');

-- one reading from one switch -> kWh added to the right hour(s)
create or replace function public.elara_record_power(
  p_owner uuid, p_device text, p_watts double precision, p_on boolean,
  p_online boolean default true, p_total_kwh double precision default null)
returns double precision
language plpgsql security definer set search_path = public as $$
declare
  st      elara_device_state%rowtype;
  now_ts  timestamptz := clock_timestamp();
  dt      double precision;
  kwh     double precision := 0;
  a       timestamptz;
  seg_end timestamptz;
  part    double precision;
begin
  -- signed-in people may only record for a home whose Smart Home they can see (the server role has no auth.uid())
  if auth.uid() is not null and elara_access(p_owner, 'smartHome') = 'none' then
    raise exception 'not allowed';
  end if;
  if p_device !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad device id'; end if;
  if p_watts is not null and (p_watts < 0 or p_watts > 25000) then raise exception 'bad power reading'; end if;
  if p_total_kwh is not null and (p_total_kwh < 0 or p_total_kwh > 10000000) then p_total_kwh := null; end if;

  select * into st from elara_device_state where owner_id = p_owner and device = p_device for update;
  if not found then
    insert into elara_device_state (owner_id, device, last_at, watts, is_on, online, total_kwh, on_since)
    values (p_owner, p_device, now_ts, p_watts, p_on, p_online, p_total_kwh, case when p_on then now_ts end);
    return 0;
  end if;

  dt := extract(epoch from now_ts - st.last_at);
  if dt < 20 then                                   -- another screen just recorded this switch
    update elara_device_state set is_on = p_on, online = p_online,
           on_since = case when p_on is not true then null when st.is_on is true and st.on_since is not null then st.on_since else now_ts end
     where owner_id = p_owner and device = p_device;
    return 0;
  end if;

  if p_watts is not null and st.watts is not null and dt <= 1800 then
    kwh := (st.watts + p_watts) / 2.0 * dt / 3600.0 / 1000.0;          -- average power x time
  elsif p_total_kwh is not null and st.total_kwh is not null and p_total_kwh >= st.total_kwh
        and p_total_kwh - st.total_kwh <= 25.0 * dt / 3600.0 and dt <= 7 * 86400 then
    kwh := p_total_kwh - st.total_kwh;                                 -- the meter's own counter covers the gap
  end if;                                                              -- otherwise: unknown, nothing is invented

  if kwh > 0 then
    a := st.last_at;
    while a < now_ts loop
      seg_end := least(now_ts, date_trunc('hour', a) + interval '1 hour');
      part := kwh * extract(epoch from seg_end - a) / dt;
      insert into elara_energy (owner_id, device, hour, kwh, peak_w, samples)
      values (p_owner, p_device, date_trunc('hour', a), part, 0, 0)
      on conflict (owner_id, device, hour) do update set kwh = elara_energy.kwh + excluded.kwh;
      a := seg_end;
    end loop;
  end if;
  if p_watts is not null then
    insert into elara_energy (owner_id, device, hour, kwh, peak_w, samples)
    values (p_owner, p_device, date_trunc('hour', now_ts), 0, p_watts, 1)
    on conflict (owner_id, device, hour) do update
      set peak_w = greatest(elara_energy.peak_w, excluded.peak_w), samples = elara_energy.samples + 1;
  end if;

  update elara_device_state
     set last_at = now_ts, watts = p_watts, is_on = p_on, online = p_online, total_kwh = coalesce(p_total_kwh, total_kwh),
         on_since = case when p_on is not true then null when st.is_on is true and st.on_since is not null then st.on_since else now_ts end
   where owner_id = p_owner and device = p_device;
  return kwh;
end $$;
revoke all on function public.elara_record_power(uuid, text, double precision, boolean, boolean, double precision) from public, anon;
grant execute on function public.elara_record_power(uuid, text, double precision, boolean, boolean, double precision) to authenticated, service_role;

-- keep 400 days of hourly energy
create or replace function public.elara_energy_tidy() returns void language sql security definer set search_path = public as $$
  delete from elara_energy where hour < now() - interval '400 days';
$$;
revoke all on function public.elara_energy_tidy() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6c. Things the server writes into the home's activity log
--     ("Elara turned off the Geyser before load-shedding"). Server only.
-- ---------------------------------------------------------------------
create or replace function public.elara_try_json(t text) returns jsonb language plpgsql immutable as $$
begin return t::jsonb; exception when others then return null; end $$;

create or replace function public.elara_server_log(p_owner uuid, p_text text, p_icon text default 'fa-robot')
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; entry jsonb;
begin
  entry := jsonb_build_object('k', 's' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || substr(md5(random()::text), 1, 5),
                              't', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, 'who', 'Elara', 'by', null,
                              'text', left(p_text, 200), 'icon', coalesce(p_icon, 'fa-robot'));
  select elara_try_json(value->>'v') into cur from elara_user_data where user_id = p_owner and key = 'elaraActivity' for update;
  if cur is null or jsonb_typeof(cur) <> 'array' then cur := '[]'::jsonb; end if;
  cur := jsonb_path_query_array(entry || cur, '$[0 to 299]');
  insert into elara_user_data (user_id, key, value) values (p_owner, 'elaraActivity', jsonb_build_object('v', cur::text))
  on conflict (user_id, key) do update set value = excluded.value;
end $$;
revoke all on function public.elara_server_log(uuid, text, text) from public, anon, authenticated;
grant execute on function public.elara_server_log(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 6d. Guest links: a time-limited, VIEW-ONLY page for a house-sitter.
--     The owner makes a link (Members page). Anyone with the link can see
--     only the parts the owner ticked, until it expires or is revoked.
-- ---------------------------------------------------------------------
create table if not exists public.elara_guest_links (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  token       text not null unique check (token ~ '^[A-Za-z0-9_-]{32,80}$'),
  label       text not null check (char_length(label) between 1 and 60),
  areas       text[] not null default '{}',
  note        text check (note is null or char_length(note) <= 1000),
  expires_at  timestamptz not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now(),
  last_viewed timestamptz,
  views       integer not null default 0
);
alter table public.elara_guest_links enable row level security;
revoke all on public.elara_guest_links from anon;
grant select, insert, update, delete on public.elara_guest_links to authenticated;
drop policy if exists "guest links owner" on public.elara_guest_links;
create policy "guest links owner" on public.elara_guest_links for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and expires_at <= now() + interval '31 days'
              and areas <@ array['tasks','schedule','shopping','smartHome']::text[]);

-- what a guest sees (called from guest.html, no login)
create or replace function public.elara_guest_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g elara_guest_links%rowtype;
  out jsonb;
  v jsonb;
  today text;
  tz text;
  until_day text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,80}$' then return jsonb_build_object('error', 'This link is not valid.'); end if;
  select * into g from elara_guest_links where token = p_token;
  if not found or g.revoked then return jsonb_build_object('error', 'This link is not valid any more. Ask the home owner for a new one.'); end if;
  if g.expires_at < now() then return jsonb_build_object('error', 'This link expired on ' || to_char(g.expires_at, 'DD Mon YYYY') || '. Ask the home owner for a new one.'); end if;
  update elara_guest_links set last_viewed = now(), views = views + 1 where id = g.id;

  select coalesce(nullif(value->>'v', ''), 'Africa/Johannesburg') into tz from elara_user_data where user_id = g.owner_id and key = 'elaraTimezone';
  tz := trim(both '"' from coalesce(tz, 'Africa/Johannesburg'));
  begin today := to_char(now() at time zone tz, 'YYYY-MM-DD'); exception when others then today := to_char(now(), 'YYYY-MM-DD'); end;
  until_day := to_char((today::date + 14), 'YYYY-MM-DD');

  out := jsonb_build_object('label', g.label, 'note', g.note, 'expires', g.expires_at, 'areas', to_jsonb(g.areas), 'today', today,
    'home', (select trim(both '"' from value->>'v') from elara_user_data where user_id = g.owner_id and key = 'elaraHomeName'));

  if 'tasks' = any(g.areas) then
    select elara_try_json(value->>'v') into v from elara_user_data where user_id = g.owner_id and key = 'elaraTasks';
    out := out || jsonb_build_object('tasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', t->>'title', 'date', t->>'date', 'time', t->>'time', 'who', t->>'assignee') order by t->>'date', t->>'time')
      from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]' end) t
      where coalesce(t->>'status', '') <> 'Completed' and t->>'date' between today and until_day), '[]'::jsonb));
  end if;
  if 'schedule' = any(g.areas) then
    select elara_try_json(value->>'v') into v from elara_user_data where user_id = g.owner_id and key = 'elaraSchedules';
    out := out || jsonb_build_object('events', coalesce((
      select jsonb_agg(jsonb_build_object('title', e->>'title', 'date', e->>'date', 'time', e->>'time', 'category', e->>'category') order by e->>'date', e->>'time')
      from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]' end) e
      where e->>'date' between today and until_day), '[]'::jsonb));
  end if;
  if 'shopping' = any(g.areas) then
    select elara_try_json(value->>'v') into v from elara_user_data where user_id = g.owner_id and key = 'elaraShoppingItems';
    out := out || jsonb_build_object('shopping', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', i->'qty', 'details', i->>'details'))
      from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]' end) i
      where not exists (select 1 from elara_user_data c, jsonb_array_elements(case when jsonb_typeof(elara_try_json(c.value->>'v')) = 'array' then elara_try_json(c.value->>'v') else '[]' end) x
                        where c.user_id = g.owner_id and c.key = 'elaraCartItems' and x->'id' = i->'id')), '[]'::jsonb));
  end if;
  if 'smartHome' = any(g.areas) then
    select elara_try_json(value->>'v') into v from elara_user_data where user_id = g.owner_id and key = 'elaraDevices';
    out := out || jsonb_build_object('devices', coalesce((
      select jsonb_agg(jsonb_build_object('name', d->>'name', 'room', d->>'room', 'type', d->>'type',
                        'on', coalesce(s.is_on, (d->>'on')::boolean), 'online', s.online) order by d->>'room', d->>'name')
      from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]' end) d
      left join elara_device_state s on s.owner_id = g.owner_id and s.device = d->>'tuyaId'
      where d->>'tuyaId' is not null and coalesce((d->>'hidden')::boolean, false) = false), '[]'::jsonb));
  end if;
  return out;
end $$;
revoke all on function public.elara_guest_view(text) from public;
grant execute on function public.elara_guest_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Live updates: every member's screen updates when someone changes something
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.elara_user_data;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.elara_notifications;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.elara_household_links;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.elara_device_state;      exception when duplicate_object then null; end;
end $$;

-- Done. Check with:
--   select policyname, tablename from pg_policies where schemaname = 'public' order by tablename;
