-- ============================================
-- OJT Attendance System — Schema v1
-- Run this in Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================

-- 1. ADMINS TABLE
CREATE TABLE IF NOT EXISTS admins (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO admins (email, password)
VALUES ('admin@ojt.edu', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- 2. INTERNS TABLE
CREATE TABLE IF NOT EXISTS interns (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  full_name       TEXT NOT NULL,
  username        TEXT UNIQUE NOT NULL,
  password        TEXT NOT NULL DEFAULT '',
  department      TEXT NOT NULL DEFAULT '',
  required_hours  INT NOT NULL DEFAULT 600,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ATTENDANCE LOG (one row per check-in session)
CREATE TABLE IF NOT EXISTS attendance (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intern_id   BIGINT REFERENCES interns(id) ON DELETE CASCADE,
  time_in     TIMESTAMPTZ DEFAULT NOW(),
  time_out    TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS attendance_intern_id_idx ON attendance(intern_id);
CREATE INDEX IF NOT EXISTS attendance_time_in_idx ON attendance(time_in);

-- ============================================
-- DONE! Default admin: admin@ojt.edu / admin123
-- ============================================
