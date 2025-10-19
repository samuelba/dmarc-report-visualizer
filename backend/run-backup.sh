#!/bin/bash
# Helper script to load environment and run backup

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables from .env file (but skip lines that might cause issues)
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "Loading environment from $PROJECT_ROOT/.env"
    
    # Export each line, handling quoted values properly and preventing command injection
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        
        # Export the variable safely by parsing key and value separately
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            # Remove quotes if present
            value="${value#\"}"
            value="${value%\"}"
            value="${value#\'}"
            value="${value%\'}"
            # Export with explicit assignment to prevent command substitution
            export "$key=$value"
        fi
    done < "$PROJECT_ROOT/.env"
    
    # Override DATABASE_HOST for local development (Docker uses dmarc-postgres)
    export DATABASE_HOST=localhost
    
    echo "✓ Environment loaded (DATABASE_HOST overridden to localhost for local access)"
else
    echo "Warning: .env file not found at $PROJECT_ROOT/.env"
    exit 1
fi

# Navigate to backend directory
cd "$SCRIPT_DIR"

# Run the backup
echo "Running backup with loaded environment..."
npm run backup
