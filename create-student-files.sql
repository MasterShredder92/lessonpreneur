INSERT INTO storage.buckets (id, name, public) VALUES ('student-files', 'student-files', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY IF NOT EXISTS "student_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-files');
CREATE POLICY IF NOT EXISTS "student_files_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'student-files');
CREATE POLICY IF NOT EXISTS "student_files_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'student-files');
CREATE POLICY IF NOT EXISTS "student_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'student-files');
