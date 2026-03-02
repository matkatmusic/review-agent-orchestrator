import type { QuestionStatus } from '../types.js';

export interface StatusAction { key: string; label: string; }

export function getValidActions(status: QuestionStatus): StatusAction[] {
    const actions: StatusAction[] = [];
    if (status !== 'Deferred' && status !== 'User_Deferred' && status !== 'Resolved')
        actions.push({ key: 'd', label: 'Defer' });
    if (status === 'Awaiting')
        actions.push({ key: 'a', label: 'Make Active' });
    if (status === 'Deferred' || status === 'User_Deferred' || status === 'Resolved')
        actions.push({ key: 'a', label: 'Activate' });
    if (status !== 'Resolved')
        actions.push({ key: 'r', label: 'Resolve' });
    return actions;
}
