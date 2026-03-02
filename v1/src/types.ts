export type QuestionStatus = 'Awaiting' | 'Active' | 'Deferred' | 'User_Deferred' | 'Resolved';

export interface Question {
    qnum: number;
    title: string;
    description: string;
    group: string | null;
    status: QuestionStatus;
    created_at: string;
    resolved_at: string | null;
    last_user_response: string | null;
    last_agent_response: string | null;
    last_responder: 'user' | 'agent' | null;
    last_reprompted_at: string | null;
    created_from: number | null;
}

export interface Response {
    id: number;
    qnum: number;
    author: 'user' | 'agent';
    body: string;
    created_at: string;
}

export interface Dependency {
    blocker_qnum: number;
    blocked_qnum: number;
}

export type PendingAction =
    | { action: 'respond'; qnum: number; author: 'user' | 'agent'; body: string }
    | { action: 'block-by'; blocked: number; blocker: number }
    | { action: 'block-by-group'; blocked: number; group: string }
    | { action: 'add-to-group'; qnum: number; group: string }
    | { action: 'create'; title: string; description: string; group?: string };

export interface Config {
    maxAgents: number;
    tmuxSession: string;
    projectRoot: string;
    scanInterval: number;
    terminalApp: string;
    agentPrompt: string;
    codeRoot: string;
}

export interface LockfileData {
    paneId: string;
    qnum: number;
    headCommit: string;
}
