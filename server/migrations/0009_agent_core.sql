-- Stock Agent persistent domain, ownership policies, and Realtime publication.

CREATE TABLE IF NOT EXISTS agent_threads (
  id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id    VARCHAR(36) NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_threads_user_stock_uq
  ON agent_threads(user_id, stock_id);
CREATE INDEX IF NOT EXISTS agent_threads_user_updated_idx
  ON agent_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content     TEXT NOT NULL,
  provider    VARCHAR(20) CHECK (provider IS NULL OR provider IN ('deepseek', 'openai', 'minimax')),
  model       VARCHAR(100),
  run_id      VARCHAR(36),
  citations   JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_messages_thread_order_idx
  ON agent_messages(thread_id, created_at, id);
CREATE INDEX IF NOT EXISTS agent_messages_user_id_idx
  ON agent_messages(user_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id                 VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id          VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message_id    VARCHAR(36) NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  client_request_id  VARCHAR(100) NOT NULL,
  provider           VARCHAR(20) NOT NULL CHECK (provider IN ('deepseek', 'openai', 'minimax')),
  model              VARCHAR(100) NOT NULL,
  credential_mode    VARCHAR(20) CHECK (credential_mode IS NULL OR credential_mode IN ('api', 'coding_plan')),
  status             VARCHAR(20) NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  stage              VARCHAR(30) NOT NULL DEFAULT 'queued'
                     CHECK (stage IN ('queued', 'loading_context', 'calling_tools', 'searching', 'generating', 'completed', 'failed')),
  attempt_count      INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts       INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts = 2),
  locked_at          TIMESTAMPTZ,
  locked_by          VARCHAR(100),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  error_code         VARCHAR(100),
  error_message      TEXT,
  retry_after        INTEGER CHECK (retry_after IS NULL OR retry_after >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_user_request_uq
  ON agent_runs(user_id, client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_one_active_per_thread_uq
  ON agent_runs(thread_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS agent_runs_queue_idx
  ON agent_runs(status, created_at, id);
CREATE INDEX IF NOT EXISTS agent_runs_user_id_idx
  ON agent_runs(user_id);

ALTER TABLE agent_messages
  DROP CONSTRAINT IF EXISTS agent_messages_run_id_fkey;
ALTER TABLE agent_messages
  ADD CONSTRAINT agent_messages_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        VARCHAR(36) NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  thread_id     VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name     VARCHAR(100) NOT NULL,
  arguments     JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error_code    VARCHAR(100),
  duration_ms   INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_tool_calls_run_created_idx
  ON agent_tool_calls(run_id, created_at, id);
CREATE INDEX IF NOT EXISTS agent_tool_calls_user_id_idx
  ON agent_tool_calls(user_id);

ALTER TABLE ai_reports
  ADD COLUMN IF NOT EXISTS agent_run_id VARCHAR(36)
  REFERENCES agent_runs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_reports_agent_run_uq
  ON ai_reports(agent_run_id) WHERE agent_run_id IS NOT NULL;

ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_threads_select_own ON agent_threads;
DROP POLICY IF EXISTS agent_threads_insert_own ON agent_threads;
DROP POLICY IF EXISTS agent_threads_update_own ON agent_threads;
DROP POLICY IF EXISTS agent_threads_delete_own ON agent_threads;
CREATE POLICY agent_threads_select_own ON agent_threads FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY agent_threads_insert_own ON agent_threads FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_threads_update_own ON agent_threads FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_threads_delete_own ON agent_threads FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS agent_messages_select_own ON agent_messages;
DROP POLICY IF EXISTS agent_messages_insert_own ON agent_messages;
DROP POLICY IF EXISTS agent_messages_update_own ON agent_messages;
DROP POLICY IF EXISTS agent_messages_delete_own ON agent_messages;
CREATE POLICY agent_messages_select_own ON agent_messages FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY agent_messages_insert_own ON agent_messages FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_messages_update_own ON agent_messages FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_messages_delete_own ON agent_messages FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS agent_runs_select_own ON agent_runs;
DROP POLICY IF EXISTS agent_runs_insert_own ON agent_runs;
DROP POLICY IF EXISTS agent_runs_update_own ON agent_runs;
DROP POLICY IF EXISTS agent_runs_delete_own ON agent_runs;
CREATE POLICY agent_runs_select_own ON agent_runs FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY agent_runs_insert_own ON agent_runs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_runs_update_own ON agent_runs FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_runs_delete_own ON agent_runs FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS agent_tool_calls_select_own ON agent_tool_calls;
DROP POLICY IF EXISTS agent_tool_calls_insert_own ON agent_tool_calls;
DROP POLICY IF EXISTS agent_tool_calls_update_own ON agent_tool_calls;
DROP POLICY IF EXISTS agent_tool_calls_delete_own ON agent_tool_calls;
CREATE POLICY agent_tool_calls_select_own ON agent_tool_calls FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY agent_tool_calls_insert_own ON agent_tool_calls FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_tool_calls_update_own ON agent_tool_calls FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY agent_tool_calls_delete_own ON agent_tool_calls FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

GRANT SELECT ON agent_runs, agent_messages TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;

DROP TRIGGER IF EXISTS agent_threads_set_updated_at ON agent_threads;
CREATE TRIGGER agent_threads_set_updated_at BEFORE UPDATE ON agent_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS agent_runs_set_updated_at ON agent_runs;
CREATE TRIGGER agent_runs_set_updated_at BEFORE UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
