
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
    if (input === 's' && currentView !== ViewType.AgentStatus) {
        callbacks.onNavigate?.({ type: ViewType.AgentStatus });
        return true;
    }
    if (input === 'b' && currentView !== ViewType.BlockingMap) {
        callbacks.onNavigate?.({ type: ViewType.BlockingMap });
        return true;
    }
    if (input === 'g' && currentView !== ViewType.GroupView) {
        callbacks.onNavigate?.({ type: ViewType.GroupView });
        return true;
    }
    if (input === 'n') {
        callbacks.onNavigate?.({ type: ViewType.NewIssue });
        return true;
    }
    if (input === 't' && currentView !== ViewType.Trash) {
        callbacks.onNavigate?.({ type: ViewType.Trash });
        return true;
    }
    return false;
}