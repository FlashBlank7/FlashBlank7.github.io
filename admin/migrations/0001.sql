CREATE TABLE sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE oauth_states (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
  base_sha TEXT NOT NULL, candidate_sha TEXT NOT NULL,
  selections TEXT NOT NULL, media TEXT NOT NULL DEFAULT '[]',
  cursor INTEGER NOT NULL DEFAULT 0, blobs TEXT NOT NULL DEFAULT '[]',
  commit_sha TEXT, message TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE publish_lock (id INTEGER PRIMARY KEY CHECK (id=1), job_id TEXT, lease INTEGER NOT NULL DEFAULT 0);
INSERT INTO publish_lock (id) VALUES (1);
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE INDEX jobs_created ON jobs(created);
