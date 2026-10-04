#!/usr/bin/env bash
# Open one pledge-invite issue per recipient, waiting a random 10-20 min between issues.
#
#   ./send.sh           dry run: print what would be created, no waiting
#   ./send.sh --send    create the issues (100 recipients ~= 25h; run under tmux/nohup)
#
# Needs: gh (authenticated as the account that should open the issues). Everything else is read
# from this directory: recipients.tsv, template.md ({{NAME}}/{{LOGIN}} placeholders). Successful
# sends are appended to sent.log, so a stopped run can simply be restarted.
set -euo pipefail
cd "$(dirname "$0")"
REPO=input-output-hk/devx-updates
LABEL=pledge-invite
MIN_WAIT=600 MAX_WAIT=1200
SEND=false; [[ "${1:-}" == "--send" ]] && SEND=true
touch sent.log

log() { echo "$(date '+%F %T')  $*"; }

# Re-fetched before every issue so people who sign mid-run are skipped.
signed_logins() {
  gh api "repos/$REPO/contents/content/pledge.md" -H 'Accept: application/vnd.github.raw' \
    | grep -oiE 'github\.com/[A-Za-z0-9-]+\)' | sed -E 's#github\.com/##; s#\)##' | tr 'A-Z' 'a-z'
}

if $SEND; then
  gh label create "$LABEL" -R "$REPO" --color BFD4F2 --description "Pledge invitation" 2>/dev/null || true
fi

first=true
while IFS= read -r line || [[ -n "$line" ]]; do
  line=${line%%#*}                              # drop comments (the team column)
  login=$(cut -f1 <<<"$line" | xargs)
  name=$(cut -s -f2 <<<"$line" | xargs)
  [[ -z "$login" ]] && continue

  if grep -qix "$login" sent.log; then log "skip  @$login (in sent.log)"; continue; fi
  if grep -qx "${login,,}" <<<"$(signed_logins)"; then log "skip  @$login (already signed)"; continue; fi

  # A renamed/deleted account 404s; skip it (not logged, so a fixed login is picked up next run).
  if ! gh_name=$(gh api "users/$login" --jq '.name // ""' 2>/dev/null); then
    log "skip  @$login (no such GitHub user)"; continue
  fi
  [[ -z "$name" ]] && name=$gh_name
  [[ -z "$name" ]] && name=$login
  title="@$login, would you sign the Cardano Tooling Collaboration Pledge?"
  body=$(NAME="$name" LOGIN="$login" perl -pe 's/\{\{NAME\}\}/$ENV{NAME}/g; s/\{\{LOGIN\}\}/$ENV{LOGIN}/g' template.md)

  if ! $SEND; then log "would create: $title  (Hi $name)"; continue; fi

  if ! $first; then
    wait=$(( MIN_WAIT + RANDOM % (MAX_WAIT - MIN_WAIT + 1) ))
    log "sleep $((wait / 60))m$((wait % 60))s before @$login"
    sleep "$wait"
  fi
  first=false

  if url=$(gh issue create -R "$REPO" --title "$title" --body "$body" --label "$LABEL"); then
    echo "$login" >> sent.log
    log "sent  @$login  $url"
  else
    log "FAIL  @$login (will retry on next run)"
  fi
done < recipients.tsv
log "done"
