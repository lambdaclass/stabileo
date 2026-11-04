#!/usr/bin/env bash
# Pull requests read trusted/ but write only pr/, and queue and main runs never read here: a pull request must never feed the queue or a deploy.
set -uo pipefail
root=${STABILEO_HOST_CACHE:-/var/cache/stabileo-ci}/research-assets
out=${RESEARCH_ASSETS_DIR:-web/public/research-wasm}
event=${EVENT:?}
mode=${1:?restore or save}

usable() { [[ -d ${root%/*} && -w ${root%/*} ]]; }
valid_key() { [[ $1 =~ ^[A-Za-z0-9._-]+$ ]]; }
namespace() { [[ $event == pull_request ]] && echo pr || echo trusted; }

restore_one() {
  local name=$1 key=$2 ns entry tmp
  [[ $event == pull_request ]] && usable && valid_key "$key" || return 1
  for ns in trusted pr; do
    entry=$root/$ns/$key.tar
    [[ -f $entry ]] || continue
    tmp=$(mktemp -d "$out/.host-cache.XXXXXX") || return 1
    if tar -xf "$entry" -C "$tmp" && [[ -n $(ls -A "$tmp") ]]; then
      rm -rf "${out:?}/$name"
      mv "$tmp" "$out/$name"
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
  usable && valid_key "$key" && [[ -d $out/$name && -n $(ls -A "$out/$name") ]] || return 0
  dir=$root/$(namespace)
  mkdir -m 1777 "$root" 2> /dev/null
  mkdir -m 1777 "$dir" 2> /dev/null
  [[ -e $dir/$key.tar ]] && return 0
  tmp=$(mktemp "$dir/.tmp.XXXXXX") || return 0
  if tar -cf "$tmp" -C "$out/$name" . && ln "$tmp" "$dir/$key.tar" 2> /dev/null; then
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
