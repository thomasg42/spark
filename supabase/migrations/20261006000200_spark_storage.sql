-- =============================================================================
-- Spark media storage: one private bucket, one folder per couple.
-- Object names must start with "<couple_id>/". Only that couple's two members
-- can upload, view (via signed URLs), or delete inside their folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'couple-media', 'couple-media', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy couple_media_select on storage.objects for select to authenticated
  using (bucket_id = 'couple-media' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);

create policy couple_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'couple-media' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);

create policy couple_media_update on storage.objects for update to authenticated
  using (bucket_id = 'couple-media' and (storage.foldername(name))[1] = (select public.my_couple_id())::text)
  with check (bucket_id = 'couple-media' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);

create policy couple_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'couple-media' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);
