import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import type { View } from './views.js';
import { Header, HEADER_LINES } from './header.js';
import { Footer } from './footer.js';

interface AppProps {
    initialView?: View;
    onExit?: () => void;
}

function App({ initialView, onExit }: AppProps) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const columns = (stdout as import('node:tty').WriteStream)?.columns ?? 80;
    const [viewStack, setViewStack] = useState<View[]>([initialView ?? { type: 'Dashboard' }]);
    const currentView = viewStack[viewStack.length - 1];

    const navigate = useCallback((view: View) => {
        setViewStack(prev => [...prev, view]);
    }, []);

    const goBack = useCallback(() => {
        setViewStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }, []);

    useInput((input, key) => {
        if (input === 'q') {
            onExit?.();
            exit();
            return;
        }

        if (key.escape) {
            goBack();
            return;
        }

        // Navigation shortcuts (available from any view for now — per-view
        // shortcuts will be refined when real view components are built)
        switch (input) {
            case 'v':
                navigate({ type: 'Detail', inum: 1 });
                break;
            case 'n':
                navigate({ type: 'NewIssue' });
                break;
            case 's':
                navigate({ type: 'AgentStatus' });
                break;
            case 'b':
                navigate({ type: 'BlockingMap' });
                break;
            case 'g':
                navigate({ type: 'GroupView' });
                break;
        }
    });

    let content: React.ReactNode;
    switch (currentView.type) {
        case 'Dashboard':
            content = <Text>Dashboard</Text>;
            break;
        case 'Detail':
            content = <Text>Detail I{currentView.inum}</Text>;
            break;
        case 'NewIssue':
            content = <Text>New Issue</Text>;
            break;
        case 'AgentStatus':
            content = <Text>Agent Status</Text>;
            break;
        case 'BlockingMap':
            content = <Text>Blocking Map</Text>;
            break;
        case 'GroupView':
            content = <Text>Group View</Text>;
            break;
    }

    return (
        <Box flexDirection="column">
            <Header currentView={currentView} columns={columns} />
            {content}
            <Footer viewType={currentView.type} />
        </Box>
    );
}

export { App };
