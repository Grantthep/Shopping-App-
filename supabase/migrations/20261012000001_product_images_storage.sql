-- Public bucket for product photos. Files go in a folder named after the seller's user id:
--   product-images/<user id>/<file name>
-- Anyone can view (public URL); only sellers can add, change or delete files in their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "sellers upload own images" on storage.objects for insert to authenticated with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'seller')
);

create policy "sellers update own images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sellers delete own images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
