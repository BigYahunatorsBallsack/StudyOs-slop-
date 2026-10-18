-- StudyOS Cloud-Sync: im Supabase-Dashboard unter "SQL Editor" einmal ausführen.
-- Ein Datensatz pro Nutzer: der komplette, im Browser verschlüsselte StudyOS-Datenstand.
create table if not exists public.studyos_sync (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  version    bigint      not null default 1,
  payload    jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: Jeder Nutzer sieht und ändert nur seine eigene Zeile.
alter table public.studyos_sync enable row level security;

drop policy if exists "eigene Zeile lesen" on public.studyos_sync;
drop policy if exists "eigene Zeile anlegen" on public.studyos_sync;
drop policy if exists "eigene Zeile ändern" on public.studyos_sync;
drop policy if exists "eigene Zeile löschen" on public.studyos_sync;

create policy "eigene Zeile lesen" on public.studyos_sync
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eigene Zeile anlegen" on public.studyos_sync
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eigene Zeile ändern" on public.studyos_sync
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Zeile löschen" on public.studyos_sync
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- Push-Erinnerungen (ab StudyOS 2.2)
-- ============================================================================

-- Pro Nutzer: Push-Abos der Geräte und die Fristen (Titel und Datum unverschlüsselt, damit der Server erinnern kann)
create table if not exists public.studyos_push (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  subscriptions jsonb       not null default '[]'::jsonb,
  deadlines     jsonb       not null default '[]'::jsonb,
  sent          jsonb       not null default '{}'::jsonb,
  tz            text        not null default 'Europe/Berlin',
  updated_at    timestamptz not null default now()
);
alter table public.studyos_push enable row level security;
drop policy if exists "eigene Push-Zeile lesen" on public.studyos_push;
drop policy if exists "eigene Push-Zeile anlegen" on public.studyos_push;
drop policy if exists "eigene Push-Zeile ändern" on public.studyos_push;
drop policy if exists "eigene Push-Zeile löschen" on public.studyos_push;
create policy "eigene Push-Zeile lesen" on public.studyos_push for select to authenticated using ((select auth.uid()) = user_id);
create policy "eigene Push-Zeile anlegen" on public.studyos_push for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eigene Push-Zeile ändern" on public.studyos_push for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Push-Zeile löschen" on public.studyos_push for delete to authenticated using ((select auth.uid()) = user_id);

-- Server-Einstellungen: VAPID-Schlüssel (erzeugt die Funktion selbst) und Geheimnis für den Zeitplan.
-- RLS ohne Regeln = nur die Edge Function (mit Secret Key) kommt heran.
create table if not exists public.studyos_server (
  id            int  primary key default 1 check (id = 1),
  vapid_public  text,
  vapid_private jsonb,
  cron_secret   text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.studyos_server enable row level security;
insert into public.studyos_server (id) values (1) on conflict (id) do nothing;

-- Zeitplan: alle 15 Minuten fällige Erinnerungen verschicken
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'studyos-reminders';
select cron.schedule(
  'studyos-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://kjyfdijcfvvlxipwogkv.supabase.co/functions/v1/studyos?action=remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select cron_secret from public.studyos_server where id = 1)),
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- Karteikarten teilen (ab StudyOS 2.3): im SQL-Editor einmal ausführen.
-- Gespeichert wird nur das im Browser verschlüsselte Chiffrat; der Schlüssel steht im Link (#k=…)
-- und erreicht den Server nie. Lesen geht nur über die Funktion mit der genauen Kennung.
-- ============================================================================
create table if not exists public.studyos_shares (
  token      text primary key check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blob       text not null check (length(blob) <= 3000000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '180 days'
);
alter table public.studyos_shares enable row level security;
drop policy if exists "eigene Stapel lesen" on public.studyos_shares;
drop policy if exists "eigene Stapel anlegen" on public.studyos_shares;
drop policy if exists "eigene Stapel löschen" on public.studyos_shares;
create policy "eigene Stapel lesen" on public.studyos_shares for select to authenticated using ((select auth.uid()) = owner);
create policy "eigene Stapel anlegen" on public.studyos_shares for insert to authenticated
  with check ((select auth.uid()) = owner and (select count(*) from public.studyos_shares s where s.owner = (select auth.uid())) < 200);
create policy "eigene Stapel löschen" on public.studyos_shares for delete to authenticated using ((select auth.uid()) = owner);

create or replace function public.studyos_get_share(t text) returns text
  language sql stable security definer set search_path = '' as $$
  select blob from public.studyos_shares where token = t and expires_at > now()
$$;
revoke all on function public.studyos_get_share(text) from public;
grant execute on function public.studyos_get_share(text) to anon, authenticated;
