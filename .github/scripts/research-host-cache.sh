#!/usr/bin/env bash
# Only runner users the host lists (queue-only runners) can write trusted/, and only pull requests read it: a pull request never supplies another run's bundle.
set -uo pipefail
dir=${STABILEO_HOST_CACHE:-/var/cache/stabileo-ci}/research-assets/trusted
out=${RESEARCH_ASSETS_DIR:-web/public/research-wasm}
event=${EVENT:?}
mode=${1:?restore or save}
manifest=.host-cache-SHA256SUMS

provisioned() {
  [[ -d $dir && ! -L $dir && $(stat -c %u "$dir") == "${STABILEO_HOST_CACHE_OWNER:-0}" ]] && (( ($(stat -c %#a "$dir") & 2) == 0 ))
}
valid_key() { [[ $1 =~ ^[A-Za-z0-9._-]+$ && $1 != none ]]; }

intact() {
  local tmp=$1
  [[ -f $tmp/$manifest && ! -L $tmp/$manifest ]] || return 1
  (cd "$tmp" && sha256sum --quiet --strict -c "$manifest" > /dev/null 2>&1) || return 1
  diff <(cd "$tmp" && find . -type f ! -name "$manifest" | sort) <(sed -E 's/^[0-9a-f]{64}  //' "$tmp/$manifest" | sort) > /dev/null
}

restore_one() {
  local name=$1 key=$2 entry=$dir/$2.tar tmp
  [[ $event == pull_request ]] && valid_key "$key" && provisioned && [[ -f $entry && ! -L $entry ]] || return 1
  tmp=$(mktemp -d "$out/.host-cache.XXXXXX") || return 1
  if dd if="$entry" iflag=nofollow status=none | tar -xf - --no-same-owner -C "$tmp" && intact "$tmp" \
    && rm -f "$tmp/$manifest" && rm -rf "${out:?}/$name" && mv -T "$tmp" "$out/$name"; then
    echo "$name: from this host's cache"
    return 0
  fi
  rm -rf "$tmp"
  return 1
}

save_one() {
  local name=$1 key=$2 tmp sums
  [[ $event != pull_request ]] && provisioned && [[ -w $dir ]] && valid_key "$key" || return 0
  [[ -d $out/$name && -n $(ls -A "$out/$name") && ! -e $out/$name/$manifest && ! -e $dir/$key.tar ]] || return 0
  tmp=$(mktemp "$dir/.tmp.XXXXXX") || return 0
  sums=$(mktemp -d) || { rm -f "$tmp"; return 0; }
  if (cd "$out/$name" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$sums/$manifest" && [[ -s $sums/$manifest ]] \
    && chmod 644 "$tmp" && tar -cf - -C "$out/$name" . -C "$sums" "$manifest" > "$tmp" && ln "$tmp" "$dir/$key.tar" 2> /dev/null; then
    echo "$name: saved to this host's cache"
  fi
  rm -rf "$tmp" "$sums"
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
