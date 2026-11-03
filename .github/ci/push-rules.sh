#!/usr/bin/env bash
# push-rules.sh BEFORE AFTER [REF]: our own push rules (U3 design r5, 10/30/2026). Governed file.
# Always run from main's copy (TRUSTED_DIR), never the pushed branch's copy. The same script is the
# early alert on push (branch-scan), the local git hooks, and the Referee's scan step at PR time.
# Exit 0 clean · 1 a rule failed · 2 cannot evaluate (a failure) · 4 clean except held files
# (files git itself shows as binary: unread, so unknown; the Referee waits for George's go).
set -euo pipefail
export LC_ALL=C
BEFORE=$1 AFTER=$2 REF=${3:-${GITHUB_REF_NAME:-?}}
Z=0000000000000000000000000000000000000000
MIB=$((1024 * 1024)); BLOCK=$((25 * MIB)); WARN=$((5 * MIB))
DEPTH=${SCAN_DEPTH:-500}                 # 0 = full history (the Referee, and creating the default branch)
SUMMARY=${SUMMARY:-/dev/stdout}          # one encoded line per finding; values are never written
TRUSTED=${TRUSTED_DIR:?set TRUSTED_DIR to the main branch copy of the rules}
enc() { jq -rn --arg s "$1" '$s | @uri' | sed 's#%2F#/#g'; }   # untrusted text: safe in Markdown, outputs, URLs
REFE=$(enc "$REF")
fail2() { printf 'cannot evaluate (ref %s): %s\n' "$REFE" "$*" >>"$SUMMARY"; exit 2; }
WORK=$(mktemp -d); : >"$WORK/lines"
line() { printf '%s\n' "$*" >>"$WORK/lines"; }

[[ $BEFORE =~ ^[0-9a-f]{40}$ && $AFTER =~ ^[0-9a-f]{40}$ ]] || fail2 "bad range"
[[ $AFTER == "$Z" ]] && { echo "deleted: nothing to scan"; exit 0; }

if [[ -z ${SCAN_LOCAL:-} ]]; then        # Actions: fetch the pushed commits, as data
  depth=(); (( DEPTH > 0 )) && depth=(--depth="$DEPTH")
  git init -q "$WORK/scan" && cd "$WORK/scan"
  git remote add origin "https://github.com/${GITHUB_REPOSITORY:?}.git"
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch -q --no-tags \
    ${depth[@]+"${depth[@]}"} origin "$AFTER" "+refs/heads/${MAIN:?}:refs/remotes/origin/$MAIN" 2>/dev/null \
    || git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch -q --no-tags \
       ${depth[@]+"${depth[@]}"} origin "$AFTER" || fail2 "fetch failed"
fi
MAINREF=${MAINREF:-origin/${MAIN:-main}}
MAIN=${MAIN:-${MAINREF##*/}}
SHALLOW=$(git rev-parse --git-path shallow)   # the common repository's file, also in a linked worktree
# The branch's own .gitattributes must not decide what is scanned (e.g. "-diff"): read attributes
# from the empty tree instead, for every git call below, gitleaks' own included.
export GIT_ATTR_SOURCE=4b825dc642cb6eb9a060e54bf8d69288fbee4904
gv=$(git version | sed -E 's/^git version ([0-9]+)\.([0-9]+).*/\1 \2/'); read -r gmaj gmin <<<"$gv"
(( gmaj > 2 || (gmaj == 2 && gmin >= 41) )) || fail2 "git $gmaj.$gmin is older than 2.41: a branch's .gitattributes cannot be isolated"

# The range: before..after; a new branch or a force push = what main lacks. Creating the DEFAULT
# branch itself (or no base on main) = its whole history, which must be complete, else exit 2.
if [[ $BEFORE != "$Z" ]] && git cat-file -e "$BEFORE^{commit}" 2>/dev/null \
   && git merge-base --is-ancestor "$BEFORE" "$AFTER" 2>/dev/null; then
  EXCL=("^$BEFORE")
elif [[ $BEFORE == "$Z" && $REF == "$MAIN" ]]; then
  EXCL=()
elif BASE=$(git merge-base "$MAINREF" "$AFTER" 2>/dev/null); then
  EXCL=("^$BASE")
else
  EXCL=()
fi
git rev-list "$AFTER" ${EXCL[@]+"${EXCL[@]}"} >"$WORK/commits" || fail2 "rev-list failed"
if [[ -s $SHALLOW ]] && grep -qxFf "$SHALLOW" "$WORK/commits"; then
  fail2 "the range reaches past the fetched history ($DEPTH commits); not certified here (the Referee checks it in full)"
fi
RANGE=("$AFTER" ${EXCL[@]+"${EXCL[@]}"})
git rev-list --min-parents=2 "${RANGE[@]}" >"$WORK/merges" || fail2 "merge inventory failed"
[[ ! -s $WORK/merges ]] || fail2 "merge commit in range; rebase required"

# 1. Secrets: pinned gitleaks in git mode over the range (path-aware: main's rules and its
# .gitleaksignore fingerprints work), and inline "gitleaks:allow" comments ignored (only main's policy can exempt).
CFG=(); [[ -f $TRUSTED/.gitleaks.toml ]] && CFG=(--config "$TRUSTED/.gitleaks.toml")
set +e
gitleaks git --no-banner --redact --exit-code 3 --ignore-gitleaks-allow \
  --log-opts="--no-renames --no-ext-diff --no-textconv ${RANGE[*]}" ${CFG[@]+"${CFG[@]}"} --gitleaks-ignore-path "$TRUSTED" \
  --report-format json --report-path "$WORK/leaks.json" . >/dev/null 2>"$WORK/gl.err"
rc=$?
set -e
if (( rc == 3 )); then
  jq -r '.[] | [.RuleID, .File, .Commit[0:8]] | @tsv' "$WORK/leaks.json" >"$WORK/hits" || fail2 "unreadable gitleaks report"
  while IFS=$'\t' read -r rule file commit; do
    line "- possible secret ($(enc "$rule")) in $(enc "$file"), commit $commit; value hidden"
  done <"$WORK/hits"
elif (( rc != 0 )); then
  fail2 "gitleaks exit $rc"
fi

# 2. Every file a commit adds, changes or turns into a file:
# names, working design/video types, sizes, and one hold rule: whatever git itself shows as binary.
while read -r c; do
  from=(--root "$c")
  git diff-tree -r -z --raw --no-abbrev --no-renames --no-commit-id "${from[@]}" >"$WORK/dt" || fail2 "diff-tree failed on ${c:0:8}"
  # The same diff as numbers: git writes "-<tab>-" for a file it shows as binary (NUL bytes, UTF-16, ...),
  # and gitleaks reads no binary diff. Kept as encoded paths, one per line.
  git diff-tree -r -z --numstat --no-renames --no-commit-id "${from[@]}" >"$WORK/ns" || fail2 "numstat failed on ${c:0:8}"
  : >"$WORK/bin"
  while IFS= read -r -d '' rec; do
    if [[ $rec == -$'\t'-$'\t'* ]]; then enc "${rec#-$'\t'-$'\t'}" >>"$WORK/bin"; fi
  done <"$WORK/ns"
  while IFS= read -r -d '' meta; do
    [[ $meta == :* ]] || continue
    IFS= read -r -d '' path || fail2 "truncated diff record"
    read -r _ mode _ sha status <<<"${meta#:}"
    [[ $status == D || $mode == 160000 ]] && continue   # deletions; submodule pointers are the Referee's
    pe=$(enc "$path"); lb=$(printf '%s' "${path##*/}" | tr '[:upper:]' '[:lower:]')
    case $lb in
      .env.example|.env.sample|.env.template|.env.dist) ;;
      .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.ppk|*.kdbx|id_rsa|id_dsa|id_ecdsa|id_ed25519|.netrc)
        line "- blocked file name: $pe" ;;
      *.ai|*.psd|*.indd|*.prproj|*.aep|*.fig|*.mp4|*.mov)
        line "- working design/video file (big-file rule): $pe" ;;
    esac
    size=$(git cat-file -s "$sha")
    if (( size > BLOCK )); then line "- over 25 MiB ($((size / MIB)) MiB): $pe"; continue; fi
    (( size > WARN )) && echo "::warning::big-file rule: $pe is $((size / MIB)) MiB (over 5 MiB)"
    # Held = git shows it as binary, for any reason. No file-type guessing: nothing else is held.
    if grep -qxF -- "$pe" "$WORK/bin"; then line "- held for George (git shows it as binary, so it was not scanned; contents unknown): $pe"; fi
  done <"$WORK/dt"
done <"$WORK/commits"

if [[ -s $WORK/lines ]]; then
  sort -u "$WORK/lines" >>"$SUMMARY"
  if grep -qv '^- held for George' "$WORK/lines"; then printf '(ref %s, %s commits)\n' "$REFE" "$(wc -l <"$WORK/commits" | tr -d ' ')" >>"$SUMMARY"; exit 1; fi
  echo "held: $REFE"; exit 4
fi
echo "clean: $REFE $(wc -l <"$WORK/commits" | tr -d ' ') commits"
