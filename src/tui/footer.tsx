import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ViewType } from './views.js';

export const FOOTER_LINES = 1;

export interface Shortcut {
    readonly key: string;
    readonly label: string;
    readonly disabled?: boolean;
}

export interface FooterProps {
    readonly viewType: ViewType;
    readonly inThread?: boolean;
}

export const VIEW_SHORTCUTS: Record<ViewType, readonly Shortcut[]> = {
    [ViewType.Home]: [
        { key: 'Enter', label: 'View' },
        { key: 'n',     label: 'New' },
        { key: 'a',     label: 'Activate' },
        { key: 'd',     label: 'Defer' },
        { key: 'r',     label: 'Resolve' },
        { key: 's',     label: 'Agents' },
        { key: 'b',     label: 'Blocking' },
        { key: 'g',     label: 'Groups' },
        { key: 'q',     label: 'Quit' },
    ],
    [ViewType.Detail]: [
        { key: 'Enter', label: 'Send' },
        { key: '\u2191\u2193', label: 'Scroll' },
        { key: '^⇧→', label: 'Thread' },
        { key: '^R', label: 'Resolve' },
        { key: 'Esc',   label: 'Back' },
        { key: '⌥h',   label: 'Home' },
        { key: 'd',     label: 'Defer', disabled: true },
        { key: 'r',     label: 'Resolve issue', disabled: true },
        { key: 'b',     label: 'Block', disabled: true },
        { key: 'w',     label: 'Rebase', disabled: true },
        { key: 's',     label: 'Show pane', disabled: true },
    ],
    [ViewType.NewIssue]: [
        { key: 'Enter', label: 'Create' },
        { key: 'Esc',   label: 'Cancel' },
    ],
    [ViewType.AgentStatus]: [
        { key: 'Enter', label: 'Focus pane' },
        { key: 'j/k',   label: 'Navigate' },
        { key: 'Esc',   label: 'Back' },
    ],
    [ViewType.BlockingMap]: [
        { key: 'Enter', label: 'View issue' },
        { key: 'j/k',   label: 'Navigate' },
        { key: 'Esc',   label: 'Back' },
    ],
    [ViewType.GroupView]: [
        { key: 'Enter', label: 'View issues' },
        { key: 'n',     label: 'Next issue' },
        { key: 'p',     label: 'Prev issue' },
        { key: 'Esc',   label: 'Back' },
    ],
};

const THREAD_SHORTCUTS: readonly Shortcut[] = [
    { key: 'Enter', label: 'Send' },
    { key: '\u2191\u2193', label: 'Scroll' },
    { key: '^⇧→', label: 'Sub-thread' },
    { key: '^⇧←', label: 'Exit thread' },
    { key: '^R', label: 'Resolve' },
    { key: 'Esc', label: 'Back' },
    { key: '⌥h', label: 'Home' },
];

const FooterComponent: React.FC<FooterProps> = ({ viewType, inThread }) => {
    const shortcuts = (viewType === ViewType.Detail && inThread)
        ? THREAD_SHORTCUTS
        : VIEW_SHORTCUTS[viewType];

    return (
        <Box>
            <Text wrap="wrap">
                {shortcuts.map((s, i) => {
                    const separator = i > 0 ? '  ' : '';
                    if (s.disabled) {
                        return (
                            <Text key={i} dimColor>{separator}[{s.key}] {s.label}</Text>
                        );
                    }
                    return (
                        <Text key={i}>{separator}<Text bold color="cyan">[{s.key}]</Text> {s.label}</Text>
                    );
                })}
            </Text>
        </Box>
    );
};

export const Footer = memo(FooterComponent);
