
import { View, ViewType } from "./views.js";
import { Key } from 'ink';

export function handleGlobalKey(
    input: string,
    key: Key,
    currentView: ViewType,
    callbacks: {
        onBack?: () => void;
        onQuit?: () => void;
        onNavigate?: (view: View) => void;
    }
): boolean {
    if (key.escape) {
        callbacks.onBack?.();
        return true;
    }
    if (input === 'q') {
        callbacks.onQuit?.();
        return true;
    }
    // Skip same-view navigation to prevent duplicate stack entries
    if (input === 's' && currentView !== 'AgentStatus') {
        callbacks.onNavigate?.({ type: 'AgentStatus' });
        return true;
    }
    if (input === 'b' && currentView !== 'BlockingMap') {
        callbacks.onNavigate?.({ type: 'BlockingMap' });
        return true;
    }
    if (input === 'g' && currentView !== 'GroupView') {
        callbacks.onNavigate?.({ type: 'GroupView' });
        return true;
    }
    if (input === 'n') {
        callbacks.onNavigate?.({ type: 'NewIssue' });
        return true;
    }
    return false;
}