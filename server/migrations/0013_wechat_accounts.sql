-- ============================================================
-- 0013 · wechat_accounts 微信小程序账号绑定
-- 微信登录:code2session 拿 openid → 查/建 Supabase 用户 → 绑定记录
-- user_id 指向 Supabase 托管的 auth.users(id),应用层不存 users 表
-- ============================================================

CREATE TABLE IF NOT EXISTS wechat_accounts (
  id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  openid     VARCHAR(64) NOT NULL,
  unionid    VARCHAR(64),
  nickname   VARCHAR(100),
  avatar_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_accounts_openid_uq
  ON wechat_accounts(openid);

CREATE INDEX IF NOT EXISTS wechat_accounts_user_id_idx
  ON wechat_accounts(user_id);

ALTER TABLE wechat_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wechat_accounts_select_own" ON wechat_accounts;
DROP POLICY IF EXISTS "wechat_accounts_insert_own" ON wechat_accounts;
DROP POLICY IF EXISTS "wechat_accounts_update_own" ON wechat_accounts;
DROP POLICY IF EXISTS "wechat_accounts_delete_own" ON wechat_accounts;

CREATE POLICY "wechat_accounts_select_own"
  ON wechat_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wechat_accounts_insert_own"
  ON wechat_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wechat_accounts_update_own"
  ON wechat_accounts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wechat_accounts_delete_own"
  ON wechat_accounts FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS wechat_accounts_set_updated_at ON wechat_accounts;
CREATE TRIGGER wechat_accounts_set_updated_at
  BEFORE UPDATE ON wechat_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
