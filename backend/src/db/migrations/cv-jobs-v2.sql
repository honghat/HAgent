-- CV Jobs V2 - Simple Schema
-- Drop old tables
DROP TABLE IF EXISTS cv_job_applications;
DROP TABLE IF EXISTS cv_job_searches;
DROP TABLE IF EXISTS cv_profiles;

-- CV Profiles: Store uploaded CVs and parsed data
CREATE TABLE cv_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  parsed_data TEXT, -- JSON: {skills: [], roles: [], experience: [], education: []}
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cv_profiles_user ON cv_profiles(user_id);

-- Job Results: Store found jobs and AI analysis
CREATE TABLE job_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  source TEXT, -- 'manual', 'auto', 'careerviet', 'topcv', etc.
  description TEXT,

  -- AI Analysis (all stored as JSON for flexibility)
  match_score INTEGER DEFAULT 0, -- 0-100
  analysis TEXT, -- JSON: {skills_match: [], skills_gap: [], strengths: [], risks: []}
  learning_plan TEXT, -- JSON: [{topic, resources, priority}]
  interview_prep TEXT, -- JSON: {focus_areas: [], questions: [], tips: []}

  -- User actions
  status TEXT DEFAULT 'new', -- new, reviewing, interested, applied, rejected
  notes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(user_id, url)
);

CREATE INDEX idx_job_results_user ON job_results(user_id);
CREATE INDEX idx_job_results_profile ON job_results(profile_id);
CREATE INDEX idx_job_results_status ON job_results(status);
CREATE INDEX idx_job_results_score ON job_results(match_score DESC);
