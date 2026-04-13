-- =============================================================================
-- AI / Ziro observability: normalized sessions, messages, action logs, feedback
-- Preserves legacy flat message table as ai_legacy_message_log (if it existed).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_conversations' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.ai_conversations RENAME TO ai_legacy_message_log;
  END IF;
END $$;

-- Greenfield: no legacy flat `ai_conversations` row to rename — create shell so COMMENT/RLS/Dashboard work.
-- If rename above ran, this is a no-op (table already exists).
CREATE TABLE IF NOT EXISTS public.ai_legacy_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text,
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_legacy_message_log_tenant_profile_created
  ON public.ai_legacy_message_log(tenant_id, profile_id, created_at DESC);

-- Session = one Ziro chat thread (panel open / clear starts a new client session id)
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'ziro_unknown',
  client_route text,
  page_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_tenant_updated
  ON public.ai_conversations(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_profile_updated
  ON public.ai_conversations(profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text,
  error_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  usage jsonb,
  seq int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conv_seq ON public.ai_messages(conversation_id, seq);
CREATE INDEX IF NOT EXISTS ai_messages_tenant_created ON public.ai_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_conv_created ON public.ai_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.ai_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  action_id text NOT NULL,
  payload jsonb,
  result jsonb,
  ok boolean NOT NULL,
  error_code text,
  error_message text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_action_logs_tenant_created ON public.ai_action_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_action_logs_action ON public.ai_action_logs(action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_action_logs_conv ON public.ai_action_logs(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  rating smallint CHECK (rating IS NULL OR rating IN (-1, 0, 1)),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_feedback_message ON public.ai_feedback(message_id);
CREATE INDEX IF NOT EXISTS ai_feedback_tenant_created ON public.ai_feedback(tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS (tenant via profiles.tenant_id — same pattern as intake_submissions)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conversations_select_tenant ON public.ai_conversations
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ai_conversations_insert_tenant ON public.ai_conversations
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

CREATE POLICY ai_conversations_update_own ON public.ai_conversations
  FOR UPDATE USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

CREATE POLICY ai_messages_select_tenant ON public.ai_messages
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ai_messages_insert_tenant ON public.ai_messages
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

CREATE POLICY ai_action_logs_select_tenant ON public.ai_action_logs
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ai_action_logs_insert_tenant ON public.ai_action_logs
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

CREATE POLICY ai_feedback_select_tenant ON public.ai_feedback
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

CREATE POLICY ai_feedback_insert_tenant ON public.ai_feedback
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

CREATE POLICY ai_feedback_update_own ON public.ai_feedback
  FOR UPDATE USING (
    tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
    AND profile_id = auth.uid()
  );

-- Legacy flat log (onboarding + old edge writes): allow tenant-scoped read/update
DO $$
BEGIN
  IF to_regclass('public.ai_legacy_message_log') IS NOT NULL THEN
    ALTER TABLE public.ai_legacy_message_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ai_legacy_message_log_tenant ON public.ai_legacy_message_log;
    CREATE POLICY ai_legacy_message_log_tenant ON public.ai_legacy_message_log
      FOR ALL USING (
        tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
      )
      WITH CHECK (
        tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
      );
  END IF;
END $$;

COMMENT ON TABLE public.ai_conversations IS 'Ziro/AI chat session (thread). One row per client session id.';
COMMENT ON TABLE public.ai_messages IS 'Messages within an ai_conversations session.';
COMMENT ON TABLE public.ai_action_logs IS 'Structured CRM actions from Ziro (navigate, reassign, schedule moves, etc.).';
COMMENT ON TABLE public.ai_feedback IS 'Optional thumbs / feedback on assistant messages.';
COMMENT ON TABLE public.ai_legacy_message_log IS 'Legacy flat user/assistant rows (pre-normalization). Prefer ai_conversations + ai_messages.';

-- Auto-increment seq per conversation (concurrent-safe enough for assistant volume)
CREATE OR REPLACE FUNCTION public.set_ai_message_seq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.seq IS NULL OR NEW.seq = 0 THEN
    SELECT COALESCE(MAX(m.seq), 0) + 1 INTO NEW.seq FROM public.ai_messages m WHERE m.conversation_id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ai_messages_seq ON public.ai_messages;
CREATE TRIGGER tr_ai_messages_seq
  BEFORE INSERT ON public.ai_messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_ai_message_seq();
