#!/bin/zsh

set -u

HEALTH_URL="https://api.drivinggodj.dpdns.org/api/health"
ALLOWED_ORIGIN="https://drivinggodj.github.io"
LOCAL_HEALTH_URL="http://127.0.0.1:8787/api/health"
PROXY_LABEL="com.drivinggodj.shiguang-memory-proxy"
TUNNEL_LABEL="com.drivinggodj.shiguang-memory-tunnel"
RESTART_COOLDOWN_SECONDS=600
STATE_FILE="${TMPDIR:-/tmp}/com.drivinggodj.shiguang-memory-watchdog.last-restart"

check_health() {
  /usr/bin/curl \
    --silent \
    --show-error \
    --fail \
    --noproxy '*' \
    --max-time 8 \
    --header "Origin: ${ALLOWED_ORIGIN}" \
    "$1" \
    >/dev/null
}

user_id=$(/usr/bin/id -u)
if ! check_health "${LOCAL_HEALTH_URL}"; then
  # Give the proxy time to finish starting when all agents load at login.
  /bin/sleep 3
  if ! check_health "${LOCAL_HEALTH_URL}"; then
    echo "$(/bin/date "+%Y-%m-%dT%H:%M:%S%z") Local proxy is unavailable; restarting ${PROXY_LABEL}"
    if ! /bin/launchctl kickstart -k "gui/${user_id}/${PROXY_LABEL}"; then
      exit 1
    fi
    /bin/sleep 3
    if ! check_health "${LOCAL_HEALTH_URL}"; then
      echo "Local proxy is still unavailable; skipping Tunnel restart"
      exit 1
    fi
  fi
fi

if check_health "${HEALTH_URL}"; then
  exit 0
fi

/bin/sleep 8

if check_health "${HEALTH_URL}"; then
  exit 0
fi

timestamp=$(/bin/date "+%Y-%m-%dT%H:%M:%S%z")
now=$(/bin/date "+%s")
last_restart=0
if [[ -r "${STATE_FILE}" ]]; then
  last_restart=$(<"${STATE_FILE}")
fi
if [[ "${last_restart}" == <-> ]] && (( now - last_restart < RESTART_COOLDOWN_SECONDS )); then
  echo "${timestamp} Tunnel remains unhealthy; restart skipped during cooldown"
  exit 0
fi

echo "${timestamp} Tunnel health check failed twice; restarting ${TUNNEL_LABEL}"
if /bin/launchctl kickstart -k "gui/${user_id}/${TUNNEL_LABEL}"; then
  print -r -- "${now}" >"${STATE_FILE}"
else
  exit 1
fi
