#!/bin/bash
# Helper script to load environment and run backup

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables from .env file (but skip lines that might cause issues)
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "Loading environment from $PROJECT_ROOT/.env"
    
    # Export each line, handling quoted values properly
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        
        # Export the variable
        if [[ "$line" =~ ^[A-Z_]+=.* ]]; then
            export "$line"
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
