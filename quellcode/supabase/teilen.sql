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
