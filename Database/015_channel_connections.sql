-- ============================================================
-- CHANNEL CONNECTIONS
-- Per-store Meta (Messenger / Instagram) connection.
-- Service-role only: page_access_token is AES-256-GCM encrypted at the app
-- layer and must never be exposed to the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  platform           TEXT NOT NULL CHECK (platform IN ('messenger', 'instagram')),
  page_id            TEXT,
  ig_id              TEXT,
  page_access_token  TEXT NOT NULL,
  page_name          TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_page ON channel_connections(page_id) WHERE page_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_ig   ON channel_connections(ig_id)   WHERE ig_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_connections_store ON channel_connections(store_id);

-- RLS: enabled, but NO policies for anon/authenticated → only the service role
-- (used by API routes) can read/write. Tokens never reach the client.
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_channel_connections_updated_at
  BEFORE UPDATE ON channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
