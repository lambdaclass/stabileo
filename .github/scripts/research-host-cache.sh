#!/usr/bin/env bash
# Queue and main runs never read here and pull requests write only pr/: a pull request must never feed the queue or a deploy.
# The namespace directories must be root-owned and sticky (provisioned by the host), so no runner user can swap another's files.
set -uo pipefail
root=${STABILEO_HOST_CACHE:-/var/cache/stabileo-ci}/research-assets
out=${RESEARCH_ASSETS_DIR:-web/public/research-wasm}
event=${EVENT:?}
mode=${1:?restore or save}

provisioned() { [[ -d $1 && ! -L $1 && -k $1 && -w $1 && $(stat -c %u "$1") == "${STABILEO_HOST_CACHE_OWNER:-0}" ]]; }
valid_key() { [[ $1 =~ ^[A-Za-z0-9._-]+$ && $1 != none ]]; }
namespace() { [[ $event == pull_request ]] && echo pr || echo trusted; }

restore_one() {
  local name=$1 key=$2 ns entry tmp
  [[ $event == pull_request ]] && valid_key "$key" || return 1
  for ns in trusted pr; do
    entry=$root/$ns/$key.tar
    provisioned "$root/$ns" && [[ -f $entry && ! -L $entry ]] || continue
    tmp=$(mktemp -d "$out/.host-cache.XXXXXX") || return 1
    if dd if="$entry" iflag=nofollow status=none | tar -xf - --no-same-owner -C "$tmp" && [[ -n $(ls -A "$tmp") ]] \
      && rm -rf "${out:?}/$name" && mv -T "$tmp" "$out/$name"; then
      touch "$entry" 2> /dev/null || true
      echo "$name: from this host's cache ($ns)"
      return 0
    fi
    rm -rf "$tmp"
  done
  return 1
}

save_one() {
  local name=$1 key=$2 dir tmp
  dir=$root/$(namespace)
  provisioned "$dir" && valid_key "$key" && [[ -d $out/$name && -n $(ls -A "$out/$name") ]] || return 0
  [[ -e $dir/$key.tar ]] && return 0
  tmp=$(mktemp "$dir/.tmp.XXXXXX") || return 0
  if chmod 644 "$tmp" && tar -cf - -C "$out/$name" . > "$tmp" && ln "$tmp" "$dir/$key.tar" 2> /dev/null; then
    echo "$name: saved to this host's cache ($(namespace))"
  fi
  rm -f "$tmp"
}

mkdir -p "$out"
build=()
for pair in ${BUNDLES:-}; do
  name=${pair%%=*}
  value=${pair#*=}
  case $mode in
    restore)
      [[ $value == hit ]] && continue
      restore_one "$name" "$value" || build+=("$name")
      ;;
    save)
      [[ -n $value ]] && save_one "$name" "$value"
      ;;
    *)
      echo "unknown mode: $mode" >&2
      exit 2
      ;;
  esac
done
if [[ $mode == restore ]]; then
  echo "to build: ${build[*]:-none}"
  [[ -z ${GITHUB_OUTPUT:-} ]] || echo "build=${build[*]}" >> "$GITHUB_OUTPUT"
fi
exit 0
