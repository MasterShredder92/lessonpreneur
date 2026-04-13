-- ============================================================
-- Integration Platform: Tables, Encryption, RLS, Indexes
-- ============================================================
-- Tables: integration_configs, oauth_states, webhook_events, api_tokens
-- RPCs: encrypt_integration_credentials, decrypt_integration_credentials
-- Trigger: auto-encrypt credentials on insert/update
-- ============================================================

-- Enable pgcrypto for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- 1. INTEGRATION_CONFIGS
-- ────────────────────────────────────────────────────────────
-- One row per tenant + integration provider. Stores connection
-- status, settings, encrypted credentials, and health metadata.

CREATE TABLE IF NOT EXISTS public.integration_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  integration_id   text NOT NULL,                          -- e.g. 'google-calendar', 'twilio', 'zapier'
  status           text NOT NULL DEFAULT 'disconnected'    -- 'connected' | 'disconnected'
                   CHECK (status IN ('connected', 'disconnected')),
  enabled          boolean NOT NULL DEFAULT true,

  -- Credentials: frontend writes here (plaintext JSONB).
  -- A trigger encrypts this into credentials_encrypted and nulls it out.
  credentials      jsonb DEFAULT NULL,
  -- Encrypted blob — only readable via decrypt RPC (service_role).
  credentials_encrypted text,

  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Connection metadata
  connected_at     timestamptz,
  connected_by     uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Health tracking (updated by edge functions)
  last_health_check timestamptz,
  health_status    text NOT NULL DEFAULT 'unknown'
                   CHECK (health_status IN ('healthy', 'degraded', 'error', 'unknown')),
  health_message   text,
  last_activity_at timestamptz,

  -- Webhook URL (for webhook-type integrations — deterministic, stored for convenience)
  webhook_url      text,

  -- Unique: one config per tenant + integration
  UNIQUE (tenant_id, integration_id)
);

-- Indexes
CREATE INDEX idx_ic_tenant ON public.integration_configs(tenant_id);
CREATE INDEX idx_ic_tenant_integration ON public.integration_configs(tenant_id, integration_id);
CREATE INDEX idx_ic_enabled ON public.integration_configs(tenant_id, enabled) WHERE status = 'connected';

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION public.integration_configs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_configs_updated_at
  BEFORE UPDATE ON public.integration_configs
  FOR EACH ROW EXECUTE FUNCTION public.integration_configs_set_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. OAUTH_STATES
-- ────────────────────────────────────────────────────────────
-- Ephemeral rows for in-flight OAuth authorization flows.
-- Each row lives ~10 minutes and is consumed once.

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state                    text NOT NULL UNIQUE,           -- cryptographic random token
  tenant_id                uuid NOT NULL REFERENCES public.tenants(id),
  integration_id           text NOT NULL,
  user_id                  uuid NOT NULL REFERENCES auth.users(id),
  client_id                text NOT NULL,
  client_secret_encrypted  text NOT NULL,                  -- encrypted via RPC before insert
  redirect_uri             text NOT NULL,
  extra_params             jsonb NOT NULL DEFAULT '{}'::jsonb,
  used                     boolean NOT NULL DEFAULT false,
  expires_at               timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_state ON public.oauth_states(state);
CREATE INDEX idx_os_expires ON public.oauth_states(expires_at);


-- ────────────────────────────────────────────────────────────
-- 3. WEBHOOK_EVENTS
-- ────────────────────────────────────────────────────────────
-- Inbound and outbound webhook event log. Used by:
-- - Inbound webhook receiver (integration-webhook)
-- - Outbound dispatch (integration-webhook-dispatch)
-- - UI delivery log panel (useOutboundDeliveries, useWebhookEvents)

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  integration_id   text NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type       text NOT NULL DEFAULT 'webhook.received',
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'retrying', 'delivered', 'failed')),

  -- Outbound dispatch fields
  response_code    int,
  response_body    text,
  error_message    text,
  latency_ms       int,
  attempt_count    int NOT NULL DEFAULT 0,
  delivery_id      text,                                   -- unique per outbound dispatch batch
  target_url       text,                                   -- destination URL for outbound
  next_retry_at    timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common lookups
CREATE INDEX idx_we_tenant_integration ON public.webhook_events(tenant_id, integration_id, created_at DESC);
CREATE INDEX idx_we_tenant_direction ON public.webhook_events(tenant_id, direction, created_at DESC);
CREATE INDEX idx_we_outbound_queue ON public.webhook_events(direction, status, created_at ASC)
  WHERE direction = 'outbound' AND status IN ('queued', 'retrying');
CREATE INDEX idx_we_delivery ON public.webhook_events(delivery_id) WHERE delivery_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. API_TOKENS
-- ────────────────────────────────────────────────────────────
-- LP-issued API tokens. Raw token shown once at creation,
-- only the SHA-256 hash is stored.

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  name             text NOT NULL,
  token_hash       text NOT NULL,                          -- SHA-256 of raw token
  token_prefix     text NOT NULL,                          -- first 11 chars for display (lp_tk_xxxxx)
  scopes           text[] NOT NULL DEFAULT '{}',
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  last_used_at     timestamptz,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_at_tenant ON public.api_tokens(tenant_id, created_at DESC);
CREATE INDEX idx_at_hash ON public.api_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_at_prefix ON public.api_tokens(token_prefix);


-- ════════════════════════════════════════════════════════════
-- ENCRYPTION RPCs
-- ════════════════════════════════════════════════════════════
-- Symmetric encryption using pgcrypto. The passphrase is stored
-- in a Supabase vault secret (or env var). For now we use a
-- server-side constant derived from the service_role key.
-- Only service_role can call these functions.

-- Private schema for internal-only functions
CREATE SCHEMA IF NOT EXISTS private;

-- Encryption key: stable passphrase for pgcrypto symmetric encryption.
-- In production, replace with a Supabase Vault secret lookup.
-- Wrapped in a function so the key is easy to rotate later.
CREATE OR REPLACE FUNCTION private.integration_encryption_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 'lp-integration-secrets-v1';
$$;


-- encrypt_integration_credentials(plain_creds text) → text
-- Called by: integration-oauth-start to encrypt client_secret before storing in oauth_states
CREATE OR REPLACE FUNCTION public.encrypt_integration_credentials(plain_creds text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
BEGIN
  RETURN encode(
    pgp_sym_encrypt(plain_creds, private.integration_encryption_key()),
    'base64'
  );
END;
$$;

-- decrypt_integration_credentials(encrypted_creds text) → text
-- Called by: edge functions to read credentials at runtime
CREATE OR REPLACE FUNCTION public.decrypt_integration_credentials(encrypted_creds text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    decode(encrypted_creds, 'base64'),
    private.integration_encryption_key()
  );
END;
$$;

-- Only service_role should be able to call these
REVOKE ALL ON FUNCTION public.encrypt_integration_credentials(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_integration_credentials(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_integration_credentials(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_integration_credentials(text) TO service_role;


-- ════════════════════════════════════════════════════════════
-- AUTO-ENCRYPT TRIGGER
-- ════════════════════════════════════════════════════════════
-- When credentials (plaintext JSONB) is written, encrypt it
-- into credentials_encrypted and null out the plaintext.
-- This ensures the plaintext never persists in the table.

CREATE OR REPLACE FUNCTION public.integration_configs_encrypt_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
BEGIN
  IF NEW.credentials IS NOT NULL AND NEW.credentials::text != 'null' AND NEW.credentials::text != '{}' THEN
    NEW.credentials_encrypted := encode(
      pgp_sym_encrypt(NEW.credentials::text, private.integration_encryption_key()),
      'base64'
    );
    NEW.credentials := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_integration_configs_encrypt
  BEFORE INSERT OR UPDATE OF credentials ON public.integration_configs
  FOR EACH ROW EXECUTE FUNCTION public.integration_configs_encrypt_credentials();


-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

-- ── integration_configs ──────────────────────────────────

ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "ic_owner_all" ON public.integration_configs
  FOR ALL USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'owner'
  );

-- Admin: full access
CREATE POLICY "ic_admin_all" ON public.integration_configs
  FOR ALL USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('admin', 'company_director')
  );

-- Service role bypass (edge functions use service_role key)
-- Service role inherently bypasses RLS, no policy needed.

-- Deny all other roles (teachers, students, studio_directors — no integration access)


-- ── oauth_states ─────────────────────────────────────────

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Service role only — these are never queried from the client.
-- Edge functions use service_role key which bypasses RLS.
-- No authenticated-user policies needed.


-- ── webhook_events ───────────────────────────────────────

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Owner: read all events in tenant
CREATE POLICY "we_owner_read" ON public.webhook_events
  FOR SELECT USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'owner'
  );

-- Admin: read all events in tenant
CREATE POLICY "we_admin_read" ON public.webhook_events
  FOR SELECT USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('admin', 'company_director')
  );

-- Insert/update done by edge functions via service_role (bypasses RLS)


-- ── api_tokens ───────────────────────────────────────────

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "at_owner_all" ON public.api_tokens
  FOR SELECT USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'owner'
  );

-- Admin: read access
CREATE POLICY "at_admin_read" ON public.api_tokens
  FOR SELECT USING (
    tenant_id = (SELECT (raw_user_meta_data->>'tenant_id')::uuid FROM auth.users WHERE id = auth.uid())
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('admin', 'company_director')
  );

-- Insert/update/delete done by edge functions via service_role (bypasses RLS)


-- ════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════
-- Authenticated users can select (gated by RLS).
-- Service role has full access inherently.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_configs TO authenticated;
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT SELECT ON public.api_tokens TO authenticated;
-- oauth_states: no grant to authenticated — service_role only
