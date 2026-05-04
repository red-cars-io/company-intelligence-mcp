#!/bin/bash
# Setup git hooks for company-intelligence-mcp
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
HOOK_FILE="$REPO_DIR/.git/hooks/pre-push"

mkdir -p "$(dirname "$HOOK_FILE")"

cat > "$HOOK_FILE" << 'HOOK'
#!/bin/bash
echo "Running syntax check on src/main.js..."
node --check src/main.js || { echo "SYNTAX ERROR in src/main.js — fix before pushing"; exit 1; }
echo "Syntax OK — safe to push"
HOOK

chmod +x "$HOOK_FILE"
echo "Pre-push hook installed at $HOOK_FILE"
