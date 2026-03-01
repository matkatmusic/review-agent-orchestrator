export interface Question {
    qnum: number;
    title: string;
    description: string;
    group: string | null;
    status: 'Awaiting' | 'Active' | 'Deferred' | 'Resolved';
    created_at: string;
    resolved_at: string | null;
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
    | { action: 'respond'; qnum: number; author: 'agent'; body: string }
    | { action: 'block-by'; blocked: number; blocker: number }
    | { action: 'block-by-group'; blocked: number; group: string }
    | { action: 'add-to-group'; qnum: number; group: string }
    | { action: 'create'; title: string; description: string; group?: string };

export interface Config {
    maxAgents: number;
    tmuxSession: string;
    projectRoot: string;
    questionsDir: string;
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
