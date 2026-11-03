#!/usr/bin/env bash
# push-log-scan.sh (U3 r10, governed): George's option (b), picked 10/31 ~12:10 AM ("I would say immediate
# alerts"). Every 6 hours, in each repo, by that repo's own workflow and from its own main copy of the rules:
# read GitHub's push log (the repository activity API) and re-scan EVERY pushed range since this workflow's
# last successful run, whatever the branch's own branch-scan did (never trusted). This catches a branch that
# switched off its own scan (edited workflow, [skip ci]) and a branch deleted or force-replaced after the push.
# - The start point is this repo's own last successful SCHEDULED run of this workflow on main (the workflow
#   has no manual trigger: a token with Actions write could start one). Nothing is stored by us. Unreadable,
#   malformed or in the future: alert, exit 2. None at all: alert EVERY time (the first scheduled run after
#   setup, or a lost start point) and scan from the install time, readable and not in the future. Wider,
#   never narrower.
# - Every push-log record is checked first. A missing field or an unknown type: alert, exit 2, so the start
#   point never moves past it. Scanned: push, force_push, branch_creation, pr_merge, merge_queue_merge.
#   branch_deletion carries no content.
# - A pushed commit that can no longer be fetched (deleted or replaced branch) is itself an alert: its content
#   was not checked and is treated as exposed.
# - One digest per run (paged by alert-george.sh; a public repo gets one bare line).
# - REPORT_ONLY=1 with REPORT_SINCE=<time>: prints instead of posting, and reads only the repository, its push
#   log and its commits (no run history), for a look by hand at a public repo's details.
set -euo pipefail
export LC_ALL=C
R=${GITHUB_REPOSITORY:?}
TRUSTED=${TRUSTED_DIR:?set TRUSTED_DIR to the main branch copy of the rules}
WF=push-log-scan.yml
OVERLAP=1800 SKEW=300 LIMIT=7776000   # 30 min overlap, 5 min clock skew, 90 days
TIME='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
Z=0000000000000000000000000000000000000000
work=$(mktemp -d); status=0
enc() { jq -rn --arg s "$1" '$s | @uri'; }
ts() {   # an ISO time like 2026-10-31T04:00:00Z (fraction allowed) -> epoch seconds, else fail
  [[ $1 =~ $TIME ]] || return 1
  local s=${1%%.*}; s=${s%Z}Z
  date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$s" +%s 2>/dev/null || date -u -d "$s" +%s 2>/dev/null
}
iso() { date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
post() {   # branch kind file
  if [ -n "${REPORT_ONLY:-}" ]; then cat "$3"; return 0; fi
  bash "$TRUSTED/.github/ci/alert-george.sh" "$1" "$Z" "$2" "$3" </dev/null || status=1
}
give_up() { printf 'cannot evaluate: the push-log scan %s; nothing was certified this run\n' "$1" >"$work/give-up.md"; post "(push-log scan)" failed "$work/give-up.md"; echo "push-log scan: $1" >&2; exit 2; }
now=$(date -u +%s)

meta=$(gh api "repos/$R") || give_up "could not read the repository"
main=$(jq -r '.default_branch // empty' <<<"$meta" 2>/dev/null || true)
[ -n "$main" ] || give_up "could not read the default branch"

start_point() {   # 2. the start point, read back from GitHub; sets since
  local inst runs last t
  inst=$(ts "${PUSH_LOG_SCAN_INSTALLED_AT:-}") || give_up "has no readable install time (PUSH_LOG_SCAN_INSTALLED_AT)"
  (( inst <= now + SKEW )) || give_up "has an install time in the future ($PUSH_LOG_SCAN_INSTALLED_AT)"
  runs=$(gh api "repos/$R/actions/workflows/$WF/runs?event=schedule&branch=$(enc "$main")&status=success&per_page=50") || give_up "could not read its own run history"
  last=$(jq -e -r --arg m "$main" 'if (.workflow_runs | type) != "array" then error("no list") else
    ([.workflow_runs[] | select(.event == "schedule" and .head_branch == $m and .conclusion == "success")][0].run_started_at // "") end' <<<"$runs") \
    || give_up "could not parse its own run history"
  if [ -n "$last" ]; then
    t=$(ts "$last") || give_up "has an unreadable start point ($last)"
    (( t <= now + SKEW )) || give_up "has a start point in the future ($last)"
    since=$(( t - OVERLAP ))
  else
    since=$inst
    printf 'notice: no earlier successful run of this scan on %s. Either this is its first scheduled run after setup (expected exactly once), or the start point was lost (deleted runs, or every run since failed). This run scans everything since the install time, %s: wider, never narrower.\n' "$main" "$PUSH_LOG_SCAN_INSTALLED_AT" >"$work/lost.md"
    post "(push-log scan)" failed "$work/lost.md"
  fi
}

if [ -n "${REPORT_ONLY:-}" ]; then
  since=$(ts "${REPORT_SINCE:-}") || { echo "REPORT_ONLY needs REPORT_SINCE (the start time in the run log, like 2026-10-31T04:00:00Z)" >&2; exit 2; }
else
  start_point
fi
(( since <= now + SKEW )) || give_up "would start in the future"
age=$(( now - since ))
if   (( age <= 86400 ));   then tp=day;   elif (( age <= 604800 )); then tp=week
elif (( age <= 2592000 )); then tp=month; elif (( age <= LIMIT ));  then tp=quarter
else give_up "would need pushes older than 90 days (this design's recovery limit)"; fi
since_iso=$(iso "$since")
echo "push-log scan: pushes since $since_iso ($tp)"

# 3. Every record checked first; then every content change since the start point, re-scanned from main's rules.
ev=$(gh api --paginate "repos/$R/activity?time_period=$tp&per_page=100") || give_up "could not read the push log"
jq -s '
  def hex: type == "string" and test("^[0-9a-f]{40}$");
  def time: type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$");
  if length > 0 and all(.[]; type == "array") then add // [] else error("a page is not a list") end
  | map(select((type == "object" and (.timestamp | time) and (.ref | type) == "string" and (.ref | startswith("refs/"))
      and (.before | hex) and (.after | hex) and ((.activity_type // "") | IN("push", "force_push", "branch_creation",
      "branch_deletion", "pr_merge", "merge_queue_merge"))) | not)) | length' <<<"$ev" >"$work/bad" 2>/dev/null \
  || give_up "could not parse the push log"
(( $(cat "$work/bad") == 0 )) || give_up "found $(cat "$work/bad") push-log record(s) it could not read (a missing field or an unknown type)"
jq -rs --arg s "$since_iso" '[.[][]] | .[] | select(.timestamp >= $s and .activity_type != "branch_deletion")
  | [.before, .after, .ref, (.actor.login // "?"), .timestamp, .activity_type] | @tsv' <<<"$ev" >"$work/events" \
  || give_up "could not parse the push log"
[ -s "$work/events" ] || { echo "$R: no pushes"; exit "$status"; }
repo_dir="$work/repo"; git init -q "$repo_dir"
git -C "$repo_dir" remote add origin "${REMOTE_BASE:-https://github.com}/$R"
fetch() { git -C "$repo_dir" -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch -q --no-tags "$@" 2>/dev/null; }
fetch origin "+refs/heads/$main:refs/remotes/origin/$main" || give_up "could not fetch $main"
failed=0; held=0; checked=0; : >"$work/index"; : >"$work/details"
while IFS=$'\t' read -r before after ref actor when kind; do
  [[ $after == "$Z" ]] && continue
  checked=$((checked + 1)); refn=${ref#refs/*/}; refe=$(enc "$refn"); who=$(enc "$actor")
  if ! fetch --depth=500 origin "$after"; then
    failed=$((failed + 1))
    printf -- '- failed: %s at %s (%s), pushed by %s at %s: the commit can no longer be fetched (branch deleted or replaced?). Not checked: treat its content as exposed; rotate anything that may be in it.\n' "$refe" "${after:0:8}" "$kind" "$who" "$when" >>"$work/index"
    continue
  fi
  sum="$work/s-$checked.md"; : >"$sum"; rc=0
  ( cd "$repo_dir" && SCAN_LOCAL=1 MAINREF="origin/$main" MAIN="$main" SUMMARY="$sum" bash "$TRUSTED/.github/ci/push-rules.sh" "$before" "$after" "$refn" </dev/null >/dev/null ) || rc=$?
  case $rc in 0) continue ;; 4) k=held; held=$((held + 1)) ;; *) k=failed; failed=$((failed + 1)) ;; esac
  printf -- '- %s: %s at %s (%s), pushed by %s at %s\n' "$k" "$refe" "${after:0:8}" "$kind" "$who" "$when" >>"$work/index"
  { printf '### %s at %s\n' "$refe" "${after:0:8}"; cat "$sum"; echo; } >>"$work/details"
done <"$work/events"
echo "$R: $checked pushes checked, $failed failed, $held held"
if (( failed + held > 0 )); then
  { printf 'Push-log scan of %s since %s: %s failed and %s held push(es) out of %s. Every one is in this index:\n\n' "$R" "$since_iso" "$failed" "$held" "$checked"
    cat "$work/index"; echo; echo 'Details:'; cat "$work/details"; } >"$work/digest.md"
  k=held; (( failed > 0 )) && k=failed
  post "(push-log scan)" "$k" "$work/digest.md"
fi
exit "$status"
