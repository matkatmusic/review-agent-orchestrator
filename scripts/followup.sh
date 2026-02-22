#!/usr/bin/env bash
set -euo pipefail

# followup.sh — Reopen a resolved question for follow-up
# Moves the file from Resolved/ back to Awaiting/, strips **RESOLVED** header,
# and appends an empty <user_response> block for the user to fill in.
# Next daemon scan will pick it up and spawn an agent.
#
# Usage: followup.sh <Q_number> <project_root>
# Example: followup.sh Q154 /path/to/project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBMODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SUBMODULE_DIR/config.sh"

Q_NUM="${1:?Usage: followup.sh <Q_number> <project_root>}"
PROJECT_ROOT="${2:?Usage: followup.sh <Q_number> <project_root>}"

RESOLVED_PATH="$PROJECT_ROOT/$RESOLVED_DIR"
AWAITING_PATH="$PROJECT_ROOT/$AWAITING_DIR"

# Find matching file in Resolved/
shopt -s nullglob
matches=("$RESOLVED_PATH"/${Q_NUM}_*.md)
shopt -u nullglob

if [[ ${#matches[@]} -eq 0 ]]; then
    echo "[followup] No file matching ${Q_NUM}_*.md found in $RESOLVED_DIR/"
    exit 1
fi

if [[ ${#matches[@]} -gt 1 ]]; then
    echo "[followup] Multiple files matching ${Q_NUM}_*.md — ambiguous:"
    printf '  %s\n' "${matches[@]}"
    exit 1
fi

file="${matches[0]}"
filename="$(basename "$file")"

echo "[followup] Reopening: $filename"

# Move file back to Awaiting/
mv "$file" "$AWAITING_PATH/$filename"

target="$AWAITING_PATH/$filename"

# Strip **RESOLVED** header (first line if it matches)
first_line=$(head -1 "$target")
if [[ "$first_line" == "**RESOLVED**" ]]; then
    # Remove first line, and any blank line immediately after it
    tail -n +2 "$target" | sed '1{/^$/d;}' > "$target.tmp"
    mv "$target.tmp" "$target"
    echo "[followup] Stripped **RESOLVED** header"
fi

# Append empty <user_response> block for the user to fill in
printf '\n<user_response>\n    <text>\n    </text>\n</user_response>\n' >> "$target"

echo "[followup] Added empty <user_response> block"
echo "[followup] Done. Edit $AWAITING_DIR/$filename to add your follow-up, then the daemon will pick it up."
