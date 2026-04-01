CREATE POLICY "Owner can update own tenant" ON tenants FOR UPDATE TO authenticated USING (id = get_user_tenant_id()) WITH CHECK (id = get_user_tenant_id());
