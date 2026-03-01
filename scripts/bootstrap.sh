#!/usr/bin/env bash
set -euo pipefail

# --- Colors -------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error()   { echo -e "${RED}[bootstrap]${NC} $*"; exit 1; }

# --- Node version check --------------------------------------------------------
if command -v nvm &>/dev/null || [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  info "Switching to Node.js version from .nvmrc..."
  NVMRC_FILE="$(dirname "$0")/../.nvmrc"
  if [ -f "$NVMRC_FILE" ]; then
    NODE_VERSION=$(cat "$NVMRC_FILE" | tr -d '[:space:]')
    nvm use "$NODE_VERSION" || nvm install "$NODE_VERSION"
  else
    nvm use
  fi
else
  warn "nvm not found — skipping Node.js version switch (ensure you are on Node 20+)"
fi

# --- Check .env.local ---------------------------------------------------------
ENV_FILE="$(dirname "$0")/../.env.local"
ENV_FILE="$(realpath "$ENV_FILE")"

if [ ! -f "$ENV_FILE" ]; then
  error ".env.local not found at $ENV_FILE\n  Copy .env.example to .env.local and fill in your secrets."
fi

info "Loading environment variables from .env.local..."

# Parse and export each valid KEY=VALUE line, stripping carriage returns and
# ignoring comments/blank lines. Avoids bash interpreting unquoted URL values.
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line//$'\r'/}"                  # strip Windows CR
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  # Strip surrounding quotes if present
  val="${val%\"}" ; val="${val#\"}"
  val="${val%\'}" ; val="${val#\'}"
  export "$key=$val"
done < "$ENV_FILE"

# --- Validate required secrets ------------------------------------------------
REQUIRED_VARS=(
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  PLAID_CLIENT_ID
  PLAID_SECRET
  OPENAI_API_KEY
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  warn "The following required variables are missing or empty in .env.local:"
  for var in "${MISSING[@]}"; do
    echo "    - $var"
  done
  echo ""
  read -r -p "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# --- Build Java Lambda functions ----------------------------------------------
REPO_ROOT="$(realpath "$(dirname "$0")/..")"

info "Building Java Lambda functions..."
mvn -f "$REPO_ROOT/amplify/functions/pom.xml" clean package -DskipTests -q \
  || error "Maven build failed — fix compile errors before deploying."
info "Java build complete."

# --- Deploy Amplify sandbox ---------------------------------------------------
info "Starting Amplify sandbox (this will deploy secrets + Lambda functions)..."
info "Press Ctrl+C at any time to stop the sandbox watcher.\n"

npx ampx sandbox --profile default
