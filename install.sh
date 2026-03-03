#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Review Agent Orchestrator — Install ==="

# Check runtime requirements
check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "ERROR: $1 is not installed."
        return 1
    fi
    echo "  ✓ $1"
    return 0
}

echo ""
echo "Checking dependencies..."
MISSING=0
check_cmd node || MISSING=1
check_cmd npm || MISSING=1
check_cmd git || MISSING=1
check_cmd tmux || MISSING=1

# Check Node.js version >= 18
if command -v node &> /dev/null; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VER" -lt 18 ]; then
        echo "ERROR: Node.js >= 18 required, found v$NODE_VER"
        MISSING=1
    fi
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "Please install missing dependencies and re-run."
    exit 1
fi

echo ""
echo "Installing npm dependencies..."
npm install

echo ""
echo "Building TypeScript..."
npm run build

echo ""
echo "Creating aidi symlink..."
cd dist/cli
ln -sf aidi.js agent-issue-db-interface.js 2>/dev/null || true
cd "$SCRIPT_DIR"

# Initialize DB if not present
if [ ! -f issues.db ]; then
    echo ""
    echo "Initializing database..."
    node -e "
        import { DB } from './dist/db/database.js';
        const db = new DB('issues.db');
        db.open();
        db.migrate('sql/schema.sql');
        db.seed('sql/seed.sql');
        db.close();
        console.log('  ✓ Database initialized');
    "
fi

# Write config.json if not present
if [ ! -f config.json ]; then
    echo ""
    echo "Writing config.json template..."
    cat > config.json << 'EOF'
{
    "maxAgents": 6,
    "tmuxSession": "issue-review",
    "scanInterval": 2,
    "terminalApp": "Terminal",
    "agentPrompt": "prompts/review-agent.md",
    "codeRoot": "",
    "teardownTimeout": 60
}
EOF
    echo "  ✓ config.json created"
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "Usage:"
echo "  node dist/cli/aidi.js respond <inum> \"<body>\""
echo "  node dist/cli/aidi.js read <inum>"
echo "  node dist/cli/aidi.js create \"<title>\" \"<description>\""
