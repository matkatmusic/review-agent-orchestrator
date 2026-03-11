
/**
 * The list of possible statuses that an issue can have
 */

export enum IssueStatus {
  Active,
  InQueue,
  Blocked,
  Deferred,
  Resolved,
  Trashed = 5,
  Inactive = 6
}

export interface ChangedStatusProps {
    inum: number;
    newStatus: IssueStatus;
}

export const IssueStatusStringsMap = new Map<IssueStatus, string>([
  [IssueStatus.Active, "Active"],
  [IssueStatus.InQueue, "In Queue"],
  [IssueStatus.Blocked, "Blocked"],
  [IssueStatus.Deferred, "Deferred"],
  [IssueStatus.Resolved, "Resolved"],
  [IssueStatus.Trashed, "Trashed"],
  [IssueStatus.Inactive, "Inactive"],
]);

export interface Issue {
    inum: number;
    title: string;
    description: string;
    status: IssueStatus;
    created_at: string;
    resolved_at: string | null;
    trashed_at: string | null;
    issue_revision: number;
    agent_last_read_at: string | null;
    user_last_viewed_at: string | null;
    blocked_by: number[];
}

export enum ResponseType {
    Question,
    Implementation,
    Clarification,
    Analysis,
    Fix,
    Other,
    None,
}

export const ResponseTypeStringsMap = new Map<ResponseType, string>([
    [ResponseType.Question, "Question"],
    [ResponseType.Implementation, "Implementation"],
    [ResponseType.Clarification, "Clarification"],
    [ResponseType.Analysis, "Analysis"],
    [ResponseType.Fix, "Fix"],
    [ResponseType.Other, "Other"],
    [ResponseType.None, "None"],
]);

export enum AuthorType {
    User,
    Agent,
}

export const AuthorTypeStringsMap = new Map<AuthorType, string>([
    [AuthorType.User, "You"],
    [AuthorType.Agent, "Agent"],
]);

export interface Message {
    author: AuthorType;
    type: ResponseType;
    body: string;
    timestamp: string;        // ISO 8601 (was created_at)
    seen: string | null;      // ISO 8601 or null
}

export interface Response {
    id: number;
    content: Message;
    responding_to: Response | null;   // previous in chain (back pointer, up)
    response: Response | null;        // next in chain (forward pointer, down)
    replying_to: Response | null;     // parent thread (back pointer, left)
    reply: Response | null;           // first reply (forward pointer, right)
    is_continuation: boolean;         // true = paragraph 2+ of same message
    thread_resolved_at: string | null; // ISO 8601 when thread was resolved, null if unresolved
    quoted_response_id: number | null; // ID of the response being quoted, or null
}

export interface ResponseRow {
    id: number;
    inum: number;
    author: string;           // 'user' | 'agent' as stored in SQLite
    type: string;             // 'analysis' etc as stored in SQLite
    body: string;
    created_at: string;
    responding_to_id: number | null;
    replying_to_id: number | null;
    is_continuation: number;  // 0 or 1 in SQLite
    thread_resolved_at: string | null;
    quoted_response_id: number | null;
}

export interface Dependency {
    blocker_inum: number;
    blocked_inum: number;
}

export type ContainerType = 'group' | 'sprint';
export type ContainerStatus = 'Open' | 'Closed';

export interface Container {
    id: number;
    name: string;
    type: ContainerType;
    parent_id: number | null;
    description: string;
    status: ContainerStatus;
    created_at: string;
    closed_at: string | null;
}

export interface IssueContainer {
    inum: number;
    container_id: number;
    sort_order: number | null;
}

export interface AgentSession {
    inum: number;
    pane_id: string;
    head_commit: string;
    created_at: string;
}

export interface Config {
    maxAgents: number;
    tmuxSession: string;
    scanInterval: number;
    terminalApp: string;
    agentPrompt: string;
    codeRoot: string;
    teardownTimeout: number;
}
