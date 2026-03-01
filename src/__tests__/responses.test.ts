import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { createQuestion } from '../questions.js';
import {
    addResponse,
    listResponses,
    getLatestResponse,
    hasUnreadAgentResponse,
    needsReprompt,
    markReprompted,
} from '../responses.js';
import { getQuestion } from '../questions.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');
const SEED_PATH = join(__dirname, '../../templates/seed.sql');

describe('responses', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-responses-test-'));
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('addResponse returns an id and response appears in list', () => {
        const id = addResponse(db, 1, 'user', 'hello agent');
        expect(id).toBeGreaterThan(0);

        const responses = listResponses(db, 1);
        const added = responses.find(r => r.id === id);
        expect(added).toBeDefined();
        expect(added!.author).toBe('user');
        expect(added!.body).toBe('hello agent');
        expect(added!.qnum).toBe(1);
    });

    it('responses are ordered by created_at', () => {
        // Seed already has one agent response for qnum=1
        addResponse(db, 1, 'user', 'first user reply');
        addResponse(db, 1, 'agent', 'agent followup');
        addResponse(db, 1, 'user', 'second user reply');

        const responses = listResponses(db, 1);
        expect(responses).toHaveLength(4); // 1 seed + 3 added
        expect(responses[0]!.author).toBe('agent');  // seed
        expect(responses[1]!.author).toBe('user');
        expect(responses[2]!.author).toBe('agent');
        expect(responses[3]!.author).toBe('user');
    });

    it('listResponses returns empty array for question with no responses', () => {
        const qnum = createQuestion(db, 'empty', 'no responses');
        expect(listResponses(db, qnum)).toEqual([]);
    });

    it('responses are tied to correct qnum', () => {
        const q2 = createQuestion(db, 'q2', 'desc');
        addResponse(db, q2, 'agent', 'response for q2');
        addResponse(db, 1, 'user', 'response for q1');

        const q1Responses = listResponses(db, 1);
        const q2Responses = listResponses(db, q2);

        // q1 has seed response + 1 added
        expect(q1Responses).toHaveLength(2);
        expect(q1Responses.every(r => r.qnum === 1)).toBe(true);

        // q2 has 1 added
        expect(q2Responses).toHaveLength(1);
        expect(q2Responses[0]!.qnum).toBe(q2);
    });

    it('FK constraint rejects response for nonexistent qnum', () => {
        expect(() => {
            addResponse(db, 999, 'user', 'orphan');
        }).toThrow();
    });

    it('getLatestResponse returns the most recent response', () => {
        addResponse(db, 1, 'user', 'first');
        addResponse(db, 1, 'agent', 'second');

        const latest = getLatestResponse(db, 1);
        expect(latest).toBeDefined();
        expect(latest!.body).toBe('second');
        expect(latest!.author).toBe('agent');
    });

    it('getLatestResponse returns undefined for question with no responses', () => {
        const qnum = createQuestion(db, 'empty', 'no responses');
        expect(getLatestResponse(db, qnum)).toBeUndefined();
    });

    it('hasUnreadAgentResponse — true when last response is from agent', () => {
        // Seed has agent response for qnum=1, no user reply yet
        expect(hasUnreadAgentResponse(db, 1)).toBe(true);
    });

    it('hasUnreadAgentResponse — false after user responds', () => {
        addResponse(db, 1, 'user', 'user reply');
        expect(hasUnreadAgentResponse(db, 1)).toBe(false);
    });

    it('hasUnreadAgentResponse — true again after new agent response', () => {
        addResponse(db, 1, 'user', 'user reply');
        expect(hasUnreadAgentResponse(db, 1)).toBe(false);

        addResponse(db, 1, 'agent', 'agent followup');
        expect(hasUnreadAgentResponse(db, 1)).toBe(true);
    });

    it('hasUnreadAgentResponse — false for question with no responses', () => {
        const qnum = createQuestion(db, 'empty', 'no responses');
        expect(hasUnreadAgentResponse(db, qnum)).toBe(false);
    });

    // ---- Reprompt tracking ----

    it('addResponse updates last_responder and timestamp columns', () => {
        addResponse(db, 1, 'user', 'user reply');
        const q = getQuestion(db, 1);
        expect(q!.last_responder).toBe('user');
        expect(q!.last_user_response).not.toBeNull();
        expect(q!.last_agent_response).toBeNull();
    });

    it('addResponse updates last_agent_response for agent', () => {
        addResponse(db, 1, 'user', 'user reply');
        addResponse(db, 1, 'agent', 'agent reply');
        const q = getQuestion(db, 1);
        expect(q!.last_responder).toBe('agent');
        expect(q!.last_agent_response).not.toBeNull();
    });

    it('needsReprompt — true when last responder is user', () => {
        addResponse(db, 1, 'user', 'user reply');
        expect(needsReprompt(db, 1)).toBe(true);
    });

    it('needsReprompt — false when last responder is agent', () => {
        addResponse(db, 1, 'user', 'user reply');
        addResponse(db, 1, 'agent', 'agent reply');
        expect(needsReprompt(db, 1)).toBe(false);
    });

    it('needsReprompt — false after markReprompted', () => {
        addResponse(db, 1, 'user', 'user reply');
        expect(needsReprompt(db, 1)).toBe(true);

        markReprompted(db, 1);
        expect(needsReprompt(db, 1)).toBe(false);
    });

    it('needsReprompt — true again after new user response post-reprompt', () => {
        addResponse(db, 1, 'user', 'first reply');
        markReprompted(db, 1);
        expect(needsReprompt(db, 1)).toBe(false);

        addResponse(db, 1, 'user', 'second reply');
        expect(needsReprompt(db, 1)).toBe(true);
    });

    it('needsReprompt — false for question with no responses', () => {
        const qnum = createQuestion(db, 'empty', 'no responses');
        expect(needsReprompt(db, qnum)).toBe(false);
    });
});
