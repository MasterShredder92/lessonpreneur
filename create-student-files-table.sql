CREATE TABLE IF NOT EXISTS student_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  uploaded_by_role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_files_student ON student_files(student_id);
ALTER TABLE student_files ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users see own tenant files" ON student_files FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users insert own tenant files" ON student_files FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users delete own tenant files" ON student_files FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
