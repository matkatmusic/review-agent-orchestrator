INSERT INTO metadata (key, value) VALUES ('lastQuestionCreated', '1');

INSERT INTO questions (qnum, title, description, status)
VALUES (1, 'getting_started', 'Welcome to the Question Review system! This is a sample question to demonstrate how the system works. Press [i] to reply, or press [r] to resolve this demo question.', 'Awaiting');

INSERT INTO responses (qnum, author, body)
VALUES (1, 'agent', 'Welcome to the Question Review system!

This is a sample question to demonstrate how the system works:
- Questions are managed via a TUI (run `qr-tui` to open)
- Agents spawn automatically for Active questions with pending responses
- Respond to a question to instruct the agent
- Resolve to close a question, Defer to postpone it
- Dependencies are managed via `qr-tool` — blocked questions auto-defer

Try it now: press [r] to resolve this demo question, or press [i] to type a response to the agent.');
