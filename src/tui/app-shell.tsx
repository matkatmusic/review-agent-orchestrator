import React, { useState } from 'react';
import { Box } from 'ink';
import { type View, type TerminalProps, type LayoutProps } from './views.js';
import { Header, HEADER_LINES } from './header.js';
import { Footer, computeFooterLines, getFooterShortcuts } from './footer.js';
import type { FooterOptions } from './footer.js';

export interface AppShellProps {
    columns: number;
    rows: number;
    currentView: View;
    activeAgents?: number;
    maxAgents?: number;
    unreadCount?: number;
    threadInfo?: { inThread: boolean };
    children: (
        setFooterOptions: (opts: FooterOptions) => void,
        terminal: TerminalProps,
        layout: LayoutProps,
    ) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
    columns,
    rows,
    currentView,
    activeAgents,
    maxAgents,
    unreadCount,
    threadInfo,
    children,
}) => {
    const [footerOptions, setFooterOptions] = useState<FooterOptions>({});

    const viewType = currentView.type;
    const shortcuts = getFooterShortcuts(viewType, footerOptions);
    const footerLines = computeFooterLines(shortcuts, columns);
    const contentHeight = Math.max(0, rows - HEADER_LINES - footerLines);

    return (
        <Box flexDirection="column" height={rows}>
            <Header
                currentView={currentView}
                columns={columns}
                activeAgents={activeAgents}
                maxAgents={maxAgents}
                unreadCount={unreadCount}
                threadInfo={threadInfo}
            />
            <Box flexDirection="column" height={contentHeight} flexGrow={1}>
                {children(setFooterOptions, { columns, rows }, { headerLines: HEADER_LINES, footerLines })}
            </Box>
            <Footer viewType={viewType} {...footerOptions} columns={columns} />
        </Box>
    );
};
