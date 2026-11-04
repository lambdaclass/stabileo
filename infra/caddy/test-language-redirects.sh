#!/usr/bin/env bash
# Serves infra/caddy/Caddyfile over a fixture site and checks that a page missing in one language
# answers 301 to its English page. Needs caddy, curl and python3 on PATH (make test.infra.caddy.redirects).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
caddy_pid=
cleanup() {
	if [ -n "$caddy_pid" ]; then kill "$caddy_pid" 2>/dev/null || true; wait "$caddy_pid" 2>/dev/null || true; fi
	rm -rf "$work"
}
trap cleanup EXIT

app="$work/live/frontends/app"
mkdir -p "$app" "$work/live/frontends/admin"
page() { mkdir -p "$(dirname "$app/$1")"; printf '%s\n' "$2" > "$app/$1"; }
page index.html 'ROOT-SHELL'
page en/index.html 'EN-LANDING'
page es/index.html 'ES-LANDING'
page de/index.html 'DE-LANDING'
page en/paper/index.html 'EN-PAPER'
page en/research/index.html 'EN-GALLERY'
page es/research/index.html 'ES-GALLERY'
page en/research/benchmarks/riks-crisfield/index.html 'EN-RIKS'
page en/research/benchmarks/navier-plate/index.html 'EN-NAVIER'
page es/research/benchmarks/navier-plate/index.html 'ES-NAVIER'
page en/blog/a-post/index.html 'EN-POST'
page de/blog/translated/index.html 'DE-TRANSLATED'
page en/blog/translated/index.html 'EN-TRANSLATED'
page assets/index-abc123.js 'console.log(1)'
printf 'ADMIN-SHELL\n' > "$work/live/frontends/admin/admin.html"

port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
app_port=$(port)
cat > "$work/test.env" <<EOF
APP_DOMAIN=http://app.test:$app_port
ADMIN_DOMAIN=http://admin.test:$(port)
STABILEO_ROOT=$work
BACKEND_PORT=$(port)
ROBOTS_TAG=noindex, nofollow
EOF
grep -v '^import /etc/caddy/' "$here/Caddyfile" | sed "s#https://snapshots\.{\$APP_DOMAIN}#http://snapshots.test:$(port)#" > "$work/Caddyfile"
if grep -q 'https://' <(grep -E '^[^[:space:]#].*\{$' "$work/Caddyfile"); then echo "FAIL: an https site in the fixture would bind :443"; exit 1; fi

CADDY_ADMIN="127.0.0.1:$(port)" caddy run --config "$work/Caddyfile" --adapter caddyfile --envfile "$work/test.env" > "$work/caddy.log" 2>&1 &
caddy_pid=$!
for _ in $(seq 1 100); do
	curl -s -o /dev/null --resolve "app.test:$app_port:127.0.0.1" "http://app.test:$app_port/" && break
	sleep 0.1
done

failures=0
expect() {
	local path=$1 status=$2 needle=${3:-}
	curl -s -D "$work/headers" -o "$work/body" --resolve "app.test:$app_port:127.0.0.1" "http://app.test:$app_port$path"
	local got
	got=$(head -n 1 "$work/headers" | awk '{print $2}')
	if [ "$got" != "$status" ]; then
		echo "FAIL $path: status $got, expected $status"; failures=$((failures + 1)); return
	fi
	if [ -n "$needle" ] && ! grep -qiF -- "$needle" "$work/headers" "$work/body"; then
		echo "FAIL $path: response lacks '$needle'"; failures=$((failures + 1)); return
	fi
	echo "ok   $path -> $status${needle:+ ($needle)}"
}

expect /de/paper/ 301 'Location: /en/paper/'
expect /de/paper 301 'Location: /en/paper/'
expect /es/paper/ 301 'Location: /en/paper/'
expect /tr/research/ 301 'Location: /en/research/'
expect /fr/research 301 'Location: /en/research/'
expect /es/research/benchmarks/riks-crisfield/ 301 'Location: /en/research/benchmarks/riks-crisfield/'
expect /pt/research/benchmarks/navier-plate/ 301 'Location: /en/research/benchmarks/navier-plate/'
expect /de/blog/a-post/ 301 'Location: /en/blog/a-post/'
expect /es/research/ 200 'ES-GALLERY'
expect /es/research/benchmarks/navier-plate/ 200 'ES-NAVIER'
expect /de/blog/translated/ 200 'DE-TRANSLATED'
expect /de/ 200 'DE-LANDING'
expect /es/research/benchmarks/navier-plate 301 'Location: /es/research/benchmarks/navier-plate/'
expect /en/research/benchmarks/riks-crisfield/ 200 'EN-RIKS'
expect /assets/index-abc123.js 200

status=$(curl -s -o /dev/null -w '%{http_code}' --resolve "app.test:$app_port:127.0.0.1" "http://app.test:$app_port/de/no-such-page/")
if [ "$status" = 301 ]; then
	echo "FAIL /de/no-such-page/: redirected although no English page exists"; failures=$((failures + 1))
else
	echo "ok   /de/no-such-page/ -> $status (not redirected)"
fi

if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed; caddy log:"; tail -n 20 "$work/caddy.log"
	exit 1
fi
echo "Caddy language redirects: all checks passed"
