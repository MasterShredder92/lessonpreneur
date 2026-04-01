CREATE POLICY "tenant_assets_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tenant-assets');
CREATE POLICY "tenant_assets_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'tenant-assets');
CREATE POLICY "tenant_assets_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'tenant-assets');
