-- ============================================================================
-- Anhänge (ab StudyOS 2.5): im SQL-Editor einmal ausführen.
-- Privater Speicher-Bucket; jeder Nutzer nur in seinem Ordner (Nutzer-ID). Die Dateien sind im Browser
-- mit dem Sync-Schlüssel verschlüsselt, Supabase sieht nur Chiffrat. Höchstens 25 MB pro Datei.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('studyos-files', 'studyos-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "studyos eigene Dateien lesen" on storage.objects;
drop policy if exists "studyos eigene Dateien anlegen" on storage.objects;
drop policy if exists "studyos eigene Dateien ändern" on storage.objects;
drop policy if exists "studyos eigene Dateien löschen" on storage.objects;
create policy "studyos eigene Dateien lesen" on storage.objects for select to authenticated
  using (bucket_id = 'studyos-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studyos eigene Dateien anlegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'studyos-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studyos eigene Dateien ändern" on storage.objects for update to authenticated
  using (bucket_id = 'studyos-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'studyos-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studyos eigene Dateien löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'studyos-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
