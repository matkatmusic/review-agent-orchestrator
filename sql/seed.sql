INSERT INTO metadata (key, value) VALUES ('lastIssueCreated', '0');

INSERT INTO containers (name, type, description)
VALUES ('Inbox', 'group', 'Default group for uncategorized issues');

INSERT INTO metadata (key, value)
VALUES ('inboxContainerId', (SELECT id FROM containers WHERE name = 'Inbox' AND type = 'group'));
