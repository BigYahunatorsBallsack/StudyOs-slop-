-- ============================================================================
-- Fristen als Kalender-Abo (ab StudyOS 2.4): im SQL-Editor einmal ausführen.
-- Der Kalender-Link enthält ein zufälliges Token; die Edge Function liefert damit die Fristen
-- (dieselben, die für die Erinnerungen ohnehin unverschlüsselt bei Supabase liegen).
-- ============================================================================
alter table public.studyos_push add column if not exists cal_token text;
create unique index if not exists studyos_push_cal_token on public.studyos_push (cal_token) where cal_token is not null;
