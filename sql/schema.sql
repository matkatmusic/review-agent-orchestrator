PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
PRAGMA user_version=1;

CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
    inum              INTEGER PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'Awaiting'
                      CHECK (status IN ('Awaiting', 'Active', 'Blocked', 'Deferred', 'Resolved')),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    resolved_at       TEXT,
    issue_revision    INTEGER NOT NULL DEFAULT 0,
    agent_last_read_at TEXT,
    user_last_viewed_at TEXT
);

CREATE TABLE IF NOT EXISTS responses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    inum       INTEGER NOT NULL REFERENCES issues(inum),
    author     TEXT NOT NULL CHECK (author IN ('user', 'agent')),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_responses_inum ON responses(inum);

CREATE TABLE IF NOT EXISTS dependencies (
    blocker_inum INTEGER NOT NULL REFERENCES issues(inum),
    blocked_inum INTEGER NOT NULL REFERENCES issues(inum),
    PRIMARY KEY (blocker_inum, blocked_inum),
    CHECK (blocker_inum != blocked_inum)
);
CREATE INDEX IF NOT EXISTS idx_deps_blocked ON dependencies(blocked_inum);
CREATE INDEX IF NOT EXISTS idx_deps_blocker ON dependencies(blocker_inum);

CREATE TABLE IF NOT EXISTS containers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('group', 'sprint')),
    parent_id   INTEGER REFERENCES containers(id),
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'Open'
                CHECK (status IN ('Open', 'Closed')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS issue_containers (
    inum         INTEGER NOT NULL REFERENCES issues(inum),
    container_id INTEGER NOT NULL REFERENCES containers(id),
    sort_order   INTEGER,
    PRIMARY KEY (inum, container_id)
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    inum        INTEGER PRIMARY KEY REFERENCES issues(inum),
    pane_id     TEXT NOT NULL,
    head_commit TEXT NOT NULL DEFAULT 'unknown',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
