#!/bin/bash
# Mycelium v2 Development Management Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/tmp/mycelium-v2"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID="$LOG_DIR/backend.pid"
FRONTEND_PID="$LOG_DIR/frontend.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

# Get process status
get_backend_pid() {
    lsof -ti:8000 2>/dev/null || echo ""
}

get_frontend_pid() {
    lsof -ti:5173 2>/dev/null || echo ""
}

is_backend_running() {
    [ -n "$(get_backend_pid)" ]
}

is_frontend_running() {
    [ -n "$(get_frontend_pid)" ]
}

# Commands
cmd_start() {
    echo -e "${BLUE}Starting Mycelium v2...${NC}"

    # Start backend
    if is_backend_running; then
        echo -e "${YELLOW}Backend already running on port 8000${NC}"
    else
        echo -e "${GREEN}Starting backend...${NC}"
        cd "$PROJECT_DIR"
        nohup bun run dev:server > "$BACKEND_LOG" 2>&1 &
        echo $! > "$BACKEND_PID"
        sleep 2
        if is_backend_running; then
            echo -e "${GREEN}Backend started on http://0.0.0.0:8000${NC}"
        else
            echo -e "${RED}Backend failed to start. Check $BACKEND_LOG${NC}"
            tail -20 "$BACKEND_LOG"
            return 1
        fi
    fi

    # Start frontend
    if is_frontend_running; then
        echo -e "${YELLOW}Frontend already running on port 5173${NC}"
    else
        echo -e "${GREEN}Starting frontend...${NC}"
        cd "$PROJECT_DIR"
        nohup bun run dev:client > "$FRONTEND_LOG" 2>&1 &
        echo $! > "$FRONTEND_PID"
        sleep 3
        if is_frontend_running; then
            echo -e "${GREEN}Frontend started on http://0.0.0.0:5173${NC}"
        else
            echo -e "${RED}Frontend failed to start. Check $FRONTEND_LOG${NC}"
            tail -20 "$FRONTEND_LOG"
            return 1
        fi
    fi

    echo ""
    echo -e "${GREEN}Mycelium v2 is running!${NC}"
    echo -e "  Backend:  http://localhost:8000"
    echo -e "  Frontend: http://localhost:5173"
    echo -e "  API:      http://localhost:8000/api/health"
}

cmd_stop() {
    echo -e "${BLUE}Stopping Mycelium v2...${NC}"

    # Stop backend
    local backend_pid=$(get_backend_pid)
    if [ -n "$backend_pid" ]; then
        echo -e "${YELLOW}Stopping backend (PID: $backend_pid)...${NC}"
        kill $backend_pid 2>/dev/null || true
        sleep 1
        # Force kill if still running
        if is_backend_running; then
            kill -9 $(get_backend_pid) 2>/dev/null || true
        fi
        echo -e "${GREEN}Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend not running${NC}"
    fi

    # Stop frontend
    local frontend_pid=$(get_frontend_pid)
    if [ -n "$frontend_pid" ]; then
        echo -e "${YELLOW}Stopping frontend (PID: $frontend_pid)...${NC}"
        kill $frontend_pid 2>/dev/null || true
        sleep 1
        if is_frontend_running; then
            kill -9 $(get_frontend_pid) 2>/dev/null || true
        fi
        echo -e "${GREEN}Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend not running${NC}"
    fi

    # Clean up any orphaned bun processes
    pkill -f "bun.*mycelium-v2" 2>/dev/null || true

    echo -e "${GREEN}Mycelium v2 stopped${NC}"
}

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

cmd_status() {
    echo -e "${BLUE}Mycelium v2 Status${NC}"
    echo ""

    if is_backend_running; then
        local pid=$(get_backend_pid)
        echo -e "  Backend:  ${GREEN}Running${NC} (PID: $pid, port 8000)"
        # Check health
        local health=$(curl -s http://localhost:8000/api/health 2>/dev/null || echo "unreachable")
        echo -e "  Health:   $health"
    else
        echo -e "  Backend:  ${RED}Stopped${NC}"
    fi

    echo ""

    if is_frontend_running; then
        local pid=$(get_frontend_pid)
        echo -e "  Frontend: ${GREEN}Running${NC} (PID: $pid, port 5173)"
    else
        echo -e "  Frontend: ${RED}Stopped${NC}"
    fi

    echo ""
    echo -e "${BLUE}Network Access:${NC}"
    echo -e "  Backend:  http://localhost:8000"
    echo -e "  Frontend: http://localhost:5173"
}

cmd_logs() {
    local target="${1:-all}"

    case "$target" in
        backend|server)
            echo -e "${BLUE}Backend logs:${NC}"
            tail -f "$BACKEND_LOG"
            ;;
        frontend|client)
            echo -e "${BLUE}Frontend logs:${NC}"
            tail -f "$FRONTEND_LOG"
            ;;
        all)
            echo -e "${BLUE}All logs (backend=blue, frontend=green):${NC}"
            tail -f "$BACKEND_LOG" "$FRONTEND_LOG"
            ;;
        *)
            echo "Usage: $0 logs [backend|frontend|all]"
            ;;
    esac
}

cmd_clean() {
    echo -e "${BLUE}Cleaning up...${NC}"

    # Stop services
    cmd_stop

    # Clean logs
    rm -f "$BACKEND_LOG" "$FRONTEND_LOG" "$BACKEND_PID" "$FRONTEND_PID"
    echo -e "${GREEN}Cleaned log files${NC}"

    # Clean node_modules cache (optional)
    if [ "$1" = "--deep" ]; then
        echo -e "${YELLOW}Deep clean: removing node_modules...${NC}"
        cd "$PROJECT_DIR"
        rm -rf node_modules packages/*/node_modules
        echo -e "${GREEN}Removed node_modules${NC}"
    fi

    echo -e "${GREEN}Cleanup complete${NC}"
}

cmd_build() {
    echo -e "${BLUE}Building Mycelium v2...${NC}"
    cd "$PROJECT_DIR"
    bun run build
    echo -e "${GREEN}Build complete${NC}"
}

cmd_help() {
    echo "Mycelium v2 Development Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start       Start backend and frontend servers"
    echo "  stop        Stop all servers"
    echo "  restart     Restart all servers"
    echo "  status      Show server status and health"
    echo "  logs        Tail logs (backend|frontend|all)"
    echo "  clean       Stop servers and clean logs (--deep for node_modules)"
    echo "  build       Build all packages"
    echo "  help        Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start all services"
    echo "  $0 logs backend    # Tail backend logs"
    echo "  $0 clean --deep    # Full cleanup including node_modules"
}

# Main
case "${1:-help}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    status)  cmd_status ;;
    logs)    cmd_logs "$2" ;;
    clean)   cmd_clean "$2" ;;
    build)   cmd_build ;;
    help|*)  cmd_help ;;
esac
