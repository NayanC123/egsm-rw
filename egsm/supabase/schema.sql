-- =============================================================
-- egsm. — Complete Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT        UNIQUE NOT NULL,
  password_hash   TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('admin', 'member')),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'suspended', 'terminated')),
  suspended_until TIMESTAMPTZ NULL,
  muted_until     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the main admin account (plain-text password stored as-is per spec;
-- the app layer handles verification against this value).
INSERT INTO profiles (username, password_hash, display_name, role, status)
VALUES ('admin', 'admin123', 'Administrator', 'admin', 'active')
ON CONFLICT (username) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. POSTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID        NOT NULL REFERENCES profiles(id),
  subject         TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  image_urls      TEXT[]      NOT NULL DEFAULT '{}',
  document_urls   JSONB       NOT NULL DEFAULT '[]',
  is_announcement BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Permanent Post Enforcement ──────────────────────────────
CREATE OR REPLACE FUNCTION prevent_post_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'POSTS ONCE MADE CANNOT BE DELETED';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_post_deletion_trigger ON posts;
CREATE TRIGGER prevent_post_deletion_trigger
  BEFORE DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION prevent_post_deletion();

-- ─────────────────────────────────────────────────────────────
-- 3. POST RATINGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_ratings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id),
  rater_id   UUID        NOT NULL REFERENCES profiles(id),
  score      INTEGER     NOT NULL CHECK (score >= 0 AND score <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, rater_id)
);

-- ─────────────────────────────────────────────────────────────
-- 4. MESSAGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID        NOT NULL REFERENCES profiles(id),
  content      TEXT        NOT NULL DEFAULT '',
  message_type TEXT        NOT NULL
                           CHECK (message_type IN ('text','gif','photo','video','voice','document','poll')),
  media_url    TEXT        NULL,
  media_meta   JSONB       NOT NULL DEFAULT '{}',
  is_pinned    BOOLEAN     NOT NULL DEFAULT false,
  is_deleted   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. POLLS & POLL VOTES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID        REFERENCES messages(id),
  question   TEXT        NOT NULL,
  options    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID    REFERENCES polls(id),
  voter_id     UUID    REFERENCES profiles(id),
  option_index INTEGER NOT NULL,
  UNIQUE (poll_id, voter_id)
);

-- ─────────────────────────────────────────────────────────────
-- 6. OFFENSE REPORTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offense_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID        REFERENCES messages(id),
  reporter_id      UUID        REFERENCES profiles(id),
  reported_user_id UUID        REFERENCES profiles(id),
  reason           TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 7. PASSWORD RESET REQUESTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT        NOT NULL,
  request_note TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'resolved')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 8. STORAGE BUCKETS
-- ─────────────────────────────────────────────────────────────
-- Create buckets (idempotent; skip if already exist via dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('post-attachments', 'post-attachments', true),
  ('chat-media',       'chat-media',       true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 9. REALTIME PUBLICATION
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  profiles,
  posts,
  post_ratings,
  messages,
  polls,
  poll_votes,
  offense_reports,
  password_reset_requests;
