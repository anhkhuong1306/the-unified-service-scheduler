#!/usr/bin/env bash
# ==============================================================================
# Database Helper Script — The Unified Service Scheduler
#
# Provides easy CLI commands to apply database schema and seed data on demand,
# decoupled from docker-compose startup.
#
# Usage:
#   ./scripts/db.sh init         # Apply 01-init.sql (extensions, test database creation)
#   ./scripts/db.sh schema       # Apply 02-schema.sql (tables, constraints, indexes)
#   ./scripts/db.sh seed         # Apply 03-seed.sql (dealerships, bays, techs, skills)
#   ./scripts/db.sh reset        # Run init then schema then seed on scheduler database
#   ./scripts/db.sh test-schema  # Apply 02-schema.sql on scheduler_test database
#   ./scripts/db.sh psql         # Open interactive psql session
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env safely if present
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # Source .env safely
  . "$ROOT_DIR/.env" 2>/dev/null || true
  set +a
fi

DB_USER="${POSTGRES_USER:-${DB_USERNAME:-scheduler}}"
DB_PASS="${POSTGRES_PASSWORD:-${DB_PASSWORD:-secret}}"
DB_NAME="${POSTGRES_DB:-${DB_DATABASE:-scheduler}}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${FORWARD_DB_PORT:-${DB_PORT:-5432}}"
CONTAINER_NAME="scheduler-postgres"

INIT_FILE="$ROOT_DIR/docker/postgres/01-init.sql"
SCHEMA_FILE="$ROOT_DIR/docker/postgres/02-schema.sql"
SEED_FILE="$ROOT_DIR/docker/postgres/03-seed.sql"

# Check if docker container is running
is_docker_running() {
  if command -v docker >/dev/null 2>&1; then
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"
    return $?
  fi
  return 1
}

# Execute a SQL file against a target database
run_sql_file() {
  local sql_file="$1"
  local target_db="${2:-$DB_NAME}"
  local file_name="$(basename "$sql_file")"

  if [ ! -f "$sql_file" ]; then
    echo "❌ Error: SQL file '$sql_file' does not exist."
    exit 1
  fi

  echo "🚀 Running $file_name on database '$target_db'..."

  if is_docker_running; then
    echo "🐳 Using running container '$CONTAINER_NAME'..."
    docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER_NAME" \
      psql -U "$DB_USER" -d "$target_db" < "$sql_file"
  elif command -v psql >/dev/null 2>&1; then
    echo "🖥️  Using local psql client ($DB_HOST:$DB_PORT)..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$target_db" -f "$sql_file"
  elif command -v node >/dev/null 2>&1; then
    echo "📦 Using Node.js database runner (scripts/run-sql.js)..."
    node "$ROOT_DIR/scripts/run-sql.js" "$sql_file" "$target_db"
  else
    echo "❌ Error: Neither docker, psql, nor node was found to execute SQL."
    exit 1
  fi

  echo "✅ Finished running $file_name!"
}

# Command dispatcher
ACTION="${1:-help}"

case "$ACTION" in
  init)
    run_sql_file "$INIT_FILE" "$DB_NAME"
    ;;

  schema)
    run_sql_file "$SCHEMA_FILE" "$DB_NAME"
    ;;

  seed)
    run_sql_file "$SEED_FILE" "$DB_NAME"
    ;;

  reset)
    echo "🔄 Resetting database '$DB_NAME'..."
    run_sql_file "$INIT_FILE" "$DB_NAME"
    run_sql_file "$SCHEMA_FILE" "$DB_NAME"
    run_sql_file "$SEED_FILE" "$DB_NAME"
    echo "🎉 Database '$DB_NAME' has been successfully initialized, reset and seeded!"
    ;;

  test-schema)
    run_sql_file "$INIT_FILE" "$DB_NAME"
    run_sql_file "$SCHEMA_FILE" "scheduler_test"
    run_sql_file "$SEED_FILE" "scheduler_test"
    ;;

  psql)
    if is_docker_running; then
      docker exec -it -e PGPASSWORD="$DB_PASS" "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"
    elif command -v psql >/dev/null 2>&1; then
      PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
    else
      echo "❌ Error: psql is not available."
      exit 1
    fi
    ;;

  *)
    echo "The Unified Service Scheduler — Database CLI"
    echo ""
    echo "Usage:"
    echo "  ./scripts/db.sh init         Apply 01-init.sql (extensions & test database)"
    echo "  ./scripts/db.sh schema       Apply 02-schema.sql to $DB_NAME"
    echo "  ./scripts/db.sh seed         Apply 03-seed.sql to $DB_NAME"
    echo "  ./scripts/db.sh reset        Apply init, schema, followed by seed"
    echo "  ./scripts/db.sh test-schema  Apply schema and seed to scheduler_test"
    echo "  ./scripts/db.sh psql         Open interactive psql session"
    echo ""
    exit 0
    ;;
esac
