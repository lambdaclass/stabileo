#!/bin/sh
# ntfy-send <urgent|high|default|low> <title> <body>: the servers' monitoring/ntfy-send, reading
# NTFY_TOPIC, NTFY_SERVER and NTFY_TOKEN from the environment. Without a topic it only prints.
set -eu
[ $# -eq 3 ] || { echo "usage: ntfy-send <prio> <title> <body>" >&2; exit 2; }
topic="${NTFY_TOPIC:-}"; server="${NTFY_SERVER:-https://ntfy.sh}"; token="${NTFY_TOKEN:-}"
printf '%s\n%s\n' "$2" "$3"
if [ -z "$topic" ]; then echo "ntfy-send: no NTFY_TOPIC; not sent" >&2; exit 0; fi
printf '%s' "$topic" | grep -Eq '^[A-Za-z0-9_-]{24,64}$' || { echo "ntfy-send: invalid NTFY_TOPIC" >&2; exit 1; }
cfg="$(umask 077; mktemp)"; trap 'rm -f "$cfg"' EXIT
printf 'url = "%s/%s"\n' "${server%/}" "$topic" > "$cfg"
if [ -n "$token" ]; then printf 'header = "Authorization: Bearer %s"\n' "$token" >> "$cfg"; fi
printf '%s' "$3" | curl -fsS -m 20 --retry 2 -K "$cfg" -H "Title: [stabileo CI] $2" -H "Priority: $1" --data-binary @- >/dev/null
