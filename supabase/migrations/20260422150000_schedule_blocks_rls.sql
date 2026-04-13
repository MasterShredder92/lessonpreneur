-- Row-level security for schedule_blocks: enforce location/role boundaries at the database.
-- Authenticated clients use the Supabase JWT; service_role bypasses RLS (edge functions, jobs).

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_blocks_owner_all ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_location_staff_all ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_teacher_select ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_parent_select ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_student_select ON public.schedule_blocks;

-- Owner: full access within tenant
CREATE POLICY schedule_blocks_owner_all ON public.schedule_blocks
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = 'owner'::user_role)
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = 'owner'::user_role);

-- Directors / admins: only rows at assigned profile_locations
CREATE POLICY schedule_blocks_location_staff_all ON public.schedule_blocks
  FOR ALL TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('admin'::user_role, 'company_director'::user_role, 'studio_director'::user_role)
    AND location_id = ANY (get_user_location_ids())
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('admin'::user_role, 'company_director'::user_role, 'studio_director'::user_role)
    AND location_id = ANY (get_user_location_ids())
  );

-- Teacher: own teaching column only
CREATE POLICY schedule_blocks_teacher_select ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() = 'teacher'::user_role
    AND teacher_id = get_teacher_id_for_profile(auth.uid())
  );

-- Parent: lessons for children in their families
CREATE POLICY schedule_blocks_parent_select ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() = 'parent'::user_role
    AND student_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = schedule_blocks.student_id
        AND s.tenant_id = get_user_tenant_id()
        AND s.family_id = ANY (get_family_ids_for_parent(auth.uid()))
    )
  );

-- Student: own scheduled blocks
CREATE POLICY schedule_blocks_student_select ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() = 'student'::user_role
    AND student_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = schedule_blocks.student_id
        AND s.tenant_id = get_user_tenant_id()
        AND s.profile_id = auth.uid()
    )
  );

COMMENT ON TABLE public.schedule_blocks IS 'Schedule grid; RLS enforces owner / location staff / teacher / family scope.';
