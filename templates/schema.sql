CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    qnum                INTEGER PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    "group"             TEXT,
    status              TEXT NOT NULL DEFAULT 'Awaiting'
                        CHECK (status IN ('Awaiting', 'Active', 'Deferred', 'User_Deferred', 'Resolved')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    resolved_at         TEXT,
    last_user_response  TEXT,
    last_agent_response TEXT,
    last_responder      TEXT CHECK (last_responder IN ('user', 'agent') OR last_responder IS NULL),
    last_reprompted_at  TEXT,
    created_from        INTEGER REFERENCES questions(qnum)
);

CREATE TABLE IF NOT EXISTS responses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    qnum       INTEGER NOT NULL REFERENCES questions(qnum),
    author     TEXT NOT NULL CHECK (author IN ('user', 'agent')),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_responses_qnum ON responses(qnum);

CREATE TABLE IF NOT EXISTS dependencies (
    blocker_qnum INTEGER NOT NULL REFERENCES questions(qnum),
    blocked_qnum INTEGER NOT NULL REFERENCES questions(qnum),
    PRIMARY KEY (blocker_qnum, blocked_qnum),
    CHECK (blocker_qnum != blocked_qnum)
);
CREATE INDEX IF NOT EXISTS idx_deps_blocked ON dependencies(blocked_qnum);
CREATE INDEX IF NOT EXISTS idx_deps_blocker ON dependencies(blocker_qnum);
