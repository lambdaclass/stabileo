#!/usr/bin/env bash
# Serves infra/caddy/Caddyfile over a fixture site (or a built web/dist, given as $1) and checks
# what each kind of address answers. Needs caddy and curl on PATH (make test.infra.caddy).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
dist=${1:-}
work=$(mktemp -d)
caddy_pid=
cleanup() {
	if [ -n "$caddy_pid" ]; then kill "$caddy_pid" 2>/dev/null || true; wait "$caddy_pid" 2>/dev/null || true; fi
	rm -rf "$work"
}
trap cleanup EXIT

app="$work/live/frontends/app"
admin="$work/live/frontends/admin"
mkdir -p "$app" "$admin/assets"
page() { mkdir -p "$(dirname "$app/$1")"; printf '%s\n' "$2" > "$app/$1"; }

if [ -n "$dist" ]; then
	cp -R "$dist/." "$app/"
	paper=$(cd "$app" && find en/research -mindepth 3 -name index.html | head -n 1)
	paper="/${paper%index.html}"
	post=$(cd "$app" && find en/blog -mindepth 2 -name index.html | head -n 1)
	post="/${post#en/}"
	post="${post%index.html}"
	asset=$(cd "$app" && find assets -name '*.js' | head -n 1)
	root_marker='id="prerender"'
else
	page index.html 'ROOT-SHELL'
	page en/index.html '<html lang="en">EN-LANDING</html>'
	page en/research/benchmarks/navier-plate/index.html 'PAPER'
	page en/blog/a-post/index.html 'POST'
	page 404.html '<meta name="robots" content="noindex">NOT-FOUND-EN'
	page en/404.html '<meta name="robots" content="noindex">NOT-FOUND-EN'
	page es/404.html '<meta name="robots" content="noindex">NOT-FOUND-ES'
	page assets/index-abc123.js 'console.log(1)'
	page robots.txt 'User-agent: *'
	paper=/en/research/benchmarks/navier-plate/
	post=/blog/a-post/
	asset=assets/index-abc123.js
	root_marker=ROOT-SHELL
fi
printf 'ADMIN-SHELL\n' > "$admin/admin.html"
printf 'console.log(2)\n' > "$admin/assets/admin-abc123.js"

port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
app_port=$(port)
admin_port=$(port)
cat > "$work/test.env" <<EOF
APP_DOMAIN=http://app.test:$app_port
ADMIN_DOMAIN=http://admin.test:$admin_port
STABILEO_ROOT=$work
BACKEND_PORT=$(port)
ROBOTS_TAG=noindex, nofollow
EOF
grep -v '^import /etc/caddy/' "$here/Caddyfile" > "$work/Caddyfile"

CADDY_ADMIN="127.0.0.1:$(port)" caddy run --config "$work/Caddyfile" --adapter caddyfile --envfile "$work/test.env" > "$work/caddy.log" 2>&1 &
caddy_pid=$!
for _ in $(seq 1 100); do
	curl -s -o /dev/null --resolve "app.test:$app_port:127.0.0.1" "http://app.test:$app_port/" && break
	sleep 0.1
done

failures=0
fetch() {
	local host=$1 port=$2 path=$3
	curl -s -D "$work/headers" -o "$work/body" --resolve "$host:$port:127.0.0.1" "http://$host:$port$path"
}
expect() {
	local host=$1 port=$2 path=$3 status=$4 needle=${5:-}
	fetch "$host" "$port" "$path"
	local got
	got=$(head -n 1 "$work/headers" | awk '{print $2}')
	if [ "$got" != "$status" ]; then
		echo "FAIL $host$path: status $got, expected $status"; failures=$((failures + 1)); return
	fi
	if [ -n "$needle" ] && ! grep -qiF -- "$needle" "$work/headers" "$work/body"; then
		echo "FAIL $host$path: response lacks '$needle'"; failures=$((failures + 1)); return
	fi
	echo "ok   $host$path -> $status${needle:+ ($needle)}"
}
a() { expect app.test "$app_port" "$@"; }

a / 200 "$root_marker"
a / 200 'X-Robots-Tag: noindex, nofollow'
a /en/ 200 '<html lang="en"'
a /en 301 "Location: /en/"
a "$paper" 200
a "${paper%/}" 301 "Location: $paper"
a /app/basic 200 "$root_marker"
a /app/pro/ 200 "$root_marker"
a /app 200 "$root_marker"
a /demo 200 "$root_marker"
a "$post" 200 "$root_marker"
a "${post%/}" 200 "$root_marker"
a "/$asset" 200 "immutable"
a /robots.txt 200
a /en/research/nonexistent-paper/ 404 'content="noindex"'
a /en/research/nonexistent-paper/ 404 'X-Robots-Tag: noindex'
a /en/research/nonexistent-paper/ 404 'X-Content-Type-Options: nosniff'
a /en/research/nonexistent-paper 404 'NOT-FOUND-EN'
a /es/no-existe/ 404 'NOT-FOUND-ES'
a /no-such-page 404 'NOT-FOUND-EN'
a /blog/no-such-post/ 404 'content="noindex"'
a /application 404
a /assets/missing.js 404

expect admin.test "$admin_port" /users/42 200 ADMIN-SHELL
expect admin.test "$admin_port" /assets/admin-abc123.js 200 immutable

if [ -n "$dist" ]; then
	a /es/no-existe/ 404 '<html lang="es"'
	a /en/research/nonexistent-paper/ 404 '<html lang="en"'
else
	sed -i 's/NOT-FOUND-EN/NOT-FOUND-ROOT/' "$app/404.html"
	a /no-such-page 404 'NOT-FOUND-ROOT'
	a /xx/no-such-page 404 'NOT-FOUND-ROOT'
fi

if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed; caddy log:"; tail -n 20 "$work/caddy.log"
	exit 1
fi
echo "Caddy routing: all checks passed"
