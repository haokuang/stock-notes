-- ============================================================
-- 0005 · error_logs 错误监控表
-- 捕获 NestJS 全局 5xx + cron 任务失败
-- ============================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id          varchar(36)   PRIMARY KEY DEFAULT gen_random_uuid()::text,
  level       varchar(10)   NOT NULL,        -- 'error' | 'warn' | 'critical'
  source      varchar(50)   NOT NULL,        -- 'http' | 'cron-sync' | 'cron-brief' | 'manual'
  message     text          NOT NULL,
  stack       text,
  context     jsonb         NOT NULL DEFAULT '{}'::jsonb,  -- request id, path, uid, payload
  user_id     uuid,                           -- nullable(系统级错误)
  notified    varchar(1)    NOT NULL DEFAULT 'f',           -- 't' / 'f',复用 stock_briefs 的 boolean 模式
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_level_idx ON error_logs (level);
CREATE INDEX IF NOT EXISTS error_logs_source_idx ON error_logs (source);
CREATE INDEX IF NOT EXISTS error_logs_notified_idx ON error_logs (notified) WHERE notified = 'f';
