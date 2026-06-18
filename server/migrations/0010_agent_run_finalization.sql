-- Ensure exactly one assistant message per Agent Run (partial unique index).

CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_assistant_run_uq
  ON agent_messages(run_id)
  WHERE role = 'assistant';