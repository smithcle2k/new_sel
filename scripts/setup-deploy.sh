#!/usr/bin/env bash
#
# One-shot provisioning for My Day Buddy:
#   1. creates (or reuses) a Turso database
#   2. mints a database auth token
#   3. generates a JWT signing secret
#   4. pushes all three to Vercel for production, preview and development
#   5. writes server/.env for local development
#   6. verifies the deployed database is reachable and the schema applies
#
# Safe to re-run: every step checks for what already exists before creating it.
# Nothing here is destructive unless you pass --seed-remote.
#
# Usage:
#   ./scripts/setup-deploy.sh [--db-name NAME] [--seed-remote]

set -euo pipefail

DB_NAME="my-day-buddy"
SEED_REMOTE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --db-name)     DB_NAME="${2:?--db-name needs a value}"; shift 2 ;;
    --seed-remote) SEED_REMOTE=1; shift ;;
    -h|--help)     sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- prereqs ---

bold "Checking prerequisites"

TURSO_INSTALL_HINT="Install the Turso platform CLI, then re-run:
       curl -sSfL https://get.tur.so/install.sh | bash
     (then restart your shell, or source the line it adds to your profile)
     Note: 'npm i -g turso' installs a DIFFERENT tool - the local SQL shell
     (tursodb) - which has no 'db create'. It will not work here."

if ! command -v turso >/dev/null 2>&1; then
  die "The Turso CLI is not installed. $TURSO_INSTALL_HINT"
fi
# Confirm this is the platform CLI and not the same-named local SQL shell.
if ! turso db --help >/dev/null 2>&1; then
  die "'$(command -v turso)' is not the Turso platform CLI - it has no 'db' command.
     $TURSO_INSTALL_HINT"
fi
ok "turso CLI (platform)"

if ! command -v vercel >/dev/null 2>&1; then
  die "The Vercel CLI is not installed. Install it, then re-run:
       npm i -g vercel"
fi
ok "vercel CLI"

command -v openssl >/dev/null 2>&1 || die "openssl is required to generate a signing secret."
ok "openssl"

# ------------------------------------------------------------------- auth ---

bold "Turso account"
if ! turso auth token >/dev/null 2>&1; then
  warn "Not signed in — opening a browser to authenticate."
  turso auth login
fi
ok "signed in as $(turso auth whoami 2>/dev/null || echo 'unknown')"

# --------------------------------------------------------------- database ---

bold "Database"
if turso db show "$DB_NAME" >/dev/null 2>&1; then
  ok "reusing existing database '$DB_NAME'"
else
  turso db create "$DB_NAME" >/dev/null
  ok "created database '$DB_NAME'"
fi

DATABASE_URL="$(turso db show "$DB_NAME" --url)"
[ -n "$DATABASE_URL" ] || die "Could not read the database URL."
ok "url: $DATABASE_URL"

# A fresh token each run; old ones keep working until explicitly invalidated.
DATABASE_AUTH_TOKEN="$(turso db tokens create "$DB_NAME")"
[ -n "$DATABASE_AUTH_TOKEN" ] || die "Could not mint a database token."
ok "auth token minted (not printed)"

JWT_SECRET="$(openssl rand -base64 48)"
ok "JWT signing secret generated (not printed)"

# ------------------------------------------------------------ local .env ----

bold "Local development environment"
# NOTE: npm runs workspace scripts with cwd=server/, so dotenv reads
# server/.env — not a .env at the repo root.
LOCAL_ENV="server/.env"
if [ -f "$LOCAL_ENV" ]; then
  cp "$LOCAL_ENV" "$LOCAL_ENV.bak"
  warn "existing $LOCAL_ENV backed up to $LOCAL_ENV.bak"
fi
cat > "$LOCAL_ENV" <<ENV
# Written by scripts/setup-deploy.sh — local development only.
# Local runs stay on a local SQLite file on purpose: 'npm run seed' DELETES all
# schools, and pointing it at the deployed database would wipe it.
DATABASE_URL=file:./data/my-day-buddy.db
JWT_SECRET=$JWT_SECRET
CLIENT_ORIGIN=http://localhost:5173
ENV
ok "wrote $LOCAL_ENV (local DB stays a local file)"

# ----------------------------------------------------------------- vercel ---

bold "Vercel project"
if [ ! -f .vercel/project.json ]; then
  warn "This directory is not linked to a Vercel project yet."
  warn "vercel link is interactive - answer its prompts to pick the project."
  vercel link
fi
ok "linked: $(node -pe "require('./.vercel/project.json').projectId" 2>/dev/null || echo 'unknown')"

# `--force` overwrites an existing value, so re-runs update in place instead of
# failing on a duplicate. The value goes in on stdin rather than via --value so
# it never appears in the process list or shell history. Secrets are marked
# --sensitive, which Vercel supports for production and preview only.
set_env() {
  local name="$1" value="$2" sensitive="${3:-0}" target flags
  for target in production preview development; do
    flags="--force"
    if [ "$sensitive" = "1" ] && [ "$target" != "development" ]; then
      flags="$flags --sensitive"
    fi
    # shellcheck disable=SC2086
    if ! printf '%s' "$value" | vercel env add "$name" "$target" $flags >/dev/null 2>&1; then
      die "Failed to set $name for $target. Run the same command without the
     output redirect to see why:
       printf '%%s' \"\$VALUE\" | vercel env add $name $target $flags"
    fi
  done
  ok "$name set for production, preview and development"
}

bold "Pushing environment variables"
set_env DATABASE_URL        "$DATABASE_URL"        0
set_env DATABASE_AUTH_TOKEN "$DATABASE_AUTH_TOKEN"  1
set_env JWT_SECRET          "$JWT_SECRET"           1

# ------------------------------------------------------------- verify/seed --

bold "Verifying the deployed database"
DATABASE_URL="$DATABASE_URL" DATABASE_AUTH_TOKEN="$DATABASE_AUTH_TOKEN" \
  node scripts/verify-db.mjs || die "Could not reach the database with those credentials."

if [ "$SEED_REMOTE" = "1" ]; then
  bold "Seeding the deployed database"
  warn "This DELETES every school in $DB_NAME and replaces it with demo data."
  read -r -p "  Type the database name to confirm: " confirm
  [ "$confirm" = "$DB_NAME" ] || die "Not confirmed — nothing was seeded."
  DATABASE_URL="$DATABASE_URL" DATABASE_AUTH_TOKEN="$DATABASE_AUTH_TOKEN" \
    npm run seed
  ok "demo data loaded"
fi

bold "Done"
cat <<DONE

  Deploy with:            vercel --prod
  Seed the demo roster:   ./scripts/setup-deploy.sh --seed-remote
  Local development:      npm run seed && npm run dev

  The database token and JWT secret were written straight to Vercel and to
  server/.env. Neither was printed here, and server/.env is gitignored.
DONE
