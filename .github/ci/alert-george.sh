#!/usr/bin/env bash
# alert-george.sh BRANCH TIP KIND SUMMARY_FILE (U3 r9, governed): @-mentions George on the branch's open PR,
# else in a new issue. KIND is "failed" or "held". It posts EVERY time it is called (no de-duplication).
# - Main counts as protected only if the default branch requires a `referee` check BOUND to the Referee
#   App (integration_id = REFEREE_APP_ID, supplied by the trusted workflow or local caller as a positive whole number; the
#   check's integration_id must be that same number). A name alone, null or a malformed ID proves nothing.
# - On a PUBLIC repo (or when visibility cannot be read) it posts only "a push rule fired; see the run":
#   no branch, commit, path or summary, and nothing of them on stdout.
# - A long summary is split into numbered parts ("part i of n") of at most 60,000 bytes, at line ends; a
#   longer line is cut into "(continued)" pieces. Nothing is dropped (GitHub's body limit is 65,536).
# A failed post exits non-zero.
set -euo pipefail
export LC_ALL=C
branch=$1 tip=$2 kind=$3 summary_file=$4
R=${GITHUB_REPOSITORY:?} OWNER=${GITHUB_REPOSITORY_OWNER:?}
RUN=${RUN_URL:-}
enc() { jq -rn --arg s "$1" '$s | @uri'; }
case $kind in
  failed) what="a push rule failed" ;;
  held)   what="files are held (git shows them as binary; they were not scanned and their contents are unknown)" ;;
  *)      echo "bad kind: $kind" >&2; exit 2 ;;
esac
repo=$(gh api "repos/$R" 2>/dev/null) || repo='{}'
public=$(jq -r 'if .private == true then "no" else "yes" end' <<<"$repo" 2>/dev/null || echo yes)   # unknown = public
if [ "$public" = yes ]; then
  body="@georgesamuelson a push rule fired in this repository. Details are withheld because it is public${RUN:+; see the run: $RUN}."
  gh api "repos/$R/issues" -f title="Push rules: an alert" -f body="$body" >/dev/null
  echo "alerted (public: details withheld)"; exit 0
fi
main=${DEFAULT_BRANCH:-$(jq -r '.default_branch // "main"' <<<"$repo" 2>/dev/null || echo main)}
rules=$(gh api "repos/$R/rules/branches/$(enc "$main")" 2>/dev/null) || rules='[]'
referee=no
if [[ ${REFEREE_APP_ID:-} =~ ^[1-9][0-9]{0,15}$ ]] && jq -e --argjson app "$REFEREE_APP_ID" \
     'any(.[]?; .type == "required_status_checks" and any(.parameters.required_status_checks[]?; .context == "referee" and (.integration_id | type) == "number" and .integration_id == $app))' \
     <<<"$rules" >/dev/null 2>&1; then
  referee=yes
fi
if [ "$referee" = yes ]; then wall="Main is protected here: the Referee's check (its App) is required on $main."
else wall="Main is NOT yet protected by the Referee in this repo: treat this as urgent."; fi
# Held files landing on main after the bound Referee check was required have already waited for George's go.
if [ "$kind" = held ] && [ "$branch" = "$main" ] && [ "$referee" = yes ]; then
  echo "not alerted: held files on $main after the Referee's check (already reviewed)"; exit 0
fi
prs=$(gh api "repos/$R/pulls?state=open&head=$(enc "$OWNER:$branch")") || prs='[]'
pr=$(jq -r '.[0].number // empty' <<<"$prs" 2>/dev/null || true)
work=$(mktemp -d)
if [ -s "$summary_file" ]; then cp "$summary_file" "$work/summary"; else echo "The check could not finish; open the Actions run." >"$work/summary"; fi
awk -v max=60000 -v dir="$work" '
  function flush() { if (buf != "") { n++; f = sprintf("%s/part-%05d", dir, n); printf "%s", buf > f; close(f); buf = ""; len = 0 } }
  { line = $0 "\n"
    while (length(line) > max) { flush(); n++; f = sprintf("%s/part-%05d", dir, n); printf "%s\n", substr(line, 1, max - 1) > f; close(f); line = "(continued) " substr(line, max) }
    if (len + length(line) > max) flush()
    buf = buf line; len += length(line) }
  END { flush() }' "$work/summary"
parts=("$work"/part-*); n=${#parts[@]}; i=0
for part in "${parts[@]}"; do
  i=$((i + 1)); label=""; (( n > 1 )) && label=" (part $i of $n)"
  body=$(printf '@georgesamuelson %s on branch %s at %s%s.\n\n%s\n\n%s If a key or password is listed, rotate it first, then delete the branch: %s/%s/blob/HEAD/.github/ci/PUSH-RULES.md%s' \
    "$what" "$(enc "$branch")" "${tip:0:8}" "$label" "$(cat "$part")" "$wall" "${GITHUB_SERVER_URL:-https://github.com}" "$R" "${RUN:+ Run: $RUN}")
  if [ -n "$pr" ]; then
    gh api "repos/$R/issues/$pr/comments" -f body="$body" >/dev/null
  else
    gh api "repos/$R/issues" -f title="Push rules: $kind on $(enc "$branch")$label" -f body="$body" >/dev/null
  fi
done
echo "alerted: $kind at ${tip:0:8} ($n part(s))"
