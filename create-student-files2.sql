INSERT INTO storage.buckets (id, name, public) VALUES ('student-files', 'student-files', true) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  CREATE POLICY "student_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "student_files_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'student-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "student_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'student-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
