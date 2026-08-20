#!/usr/bin/env bash
#
# Party of Effects — interactive environment setup.
#
#   bash scripts/setup-env.sh
#
# Prompts for the handful of values you copy out of the Supabase and Spotify
# dashboards, generates the encryption key for you, and writes server/.env and
# web/.env with the right variable in the right file.
#
# It refuses to continue if the Supabase keys are swapped. Putting the
# service_role key into web/.env would ship an RLS-bypassing master key to every
# browser that loads the app, so that check is the main reason this script
# exists rather than a copy-paste snippet.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; grn=$'\033[32m'; ylw=$'\033[33m'; rst=$'\033[0m'

die() { printf '%s\n' "${red}✗ $*${rst}" >&2; exit 1; }
ok()  { printf '%s\n' "${grn}✓${rst} $*"; }
warn(){ printf '%s\n' "${ylw}!${rst} $*"; }

# Read prompts from the terminal, not stdin, so this still behaves if the
# script itself is piped in. The probe runs in a subshell: /dev/tty can exist
# but refuse to open (cron, CI, some containers), and a failed `exec` in the
# main shell would take the whole script down.
if ( exec 3</dev/tty ) 2>/dev/null; then exec 3</dev/tty; else exec 3<&0; fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

ask() {                       # ask <var-name> <prompt> [optional]
  local __var="$1" __prompt="$2" __optional="${3:-}" __val=''
  while true; do
    printf '%s' "${bold}${__prompt}${rst}
> " >&2
    IFS= read -r __val <&3 || true
    __val="$(trim "$__val")"
    if [ -n "$__val" ]; then break; fi
    if [ -n "$__optional" ]; then break; fi
    warn "That can't be empty."
  done
  printf -v "$__var" '%s' "$__val"
}

mask() {                      # show enough to eyeball, not enough to leak
  local s="$1"
  if [ ${#s} -le 12 ]; then printf '%s' '••••••••'; else
    printf '%s…%s (%d chars)' "${s:0:6}" "${s: -4}" "${#s}"
  fi
}

# --- JWT role detection ------------------------------------------------------
# Supabase issues keys in two formats depending on project age:
#   legacy  : a JWT whose payload carries "role":"anon" | "service_role"
#   current : sb_publishable_... | sb_secret_...
# Both are handled so we can tell the two keys apart and catch a swap.

b64url_decode() {
  local d="$1"
  d="${d//-/+}"; d="${d//_/\/}"
  case $(( ${#d} % 4 )) in
    2) d="${d}==" ;;
    3) d="${d}=" ;;
  esac
  printf '%s' "$d" | openssl base64 -d -A 2>/dev/null || true
}

key_role() {                  # -> anon | service_role | unknown
  local tok="$1"
  case "$tok" in
    sb_publishable_*) printf 'anon'; return ;;
    sb_secret_*)      printf 'service_role'; return ;;
    eyJ*) ;;
    *) printf 'unknown'; return ;;
  esac
  local role
  role="$(b64url_decode "$(printf '%s' "$tok" | cut -d. -f2)" \
          | sed -n 's/.*"role"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  printf '%s' "${role:-unknown}"
}

# --- Preflight ---------------------------------------------------------------

printf '\n%s\n' "${bold}Party of Effects — environment setup${rst}"
printf '%s\n\n' "${dim}${ROOT}${rst}"

[ -f package.json ] || die "Run this from inside the repo (couldn't find package.json)."
command -v openssl >/dev/null || die "openssl not found. It ships with macOS — check your PATH."

for f in server/.env web/.env; do
  if [ -f "$f" ]; then
    warn "$f already exists."
    ask OVERWRITE "Overwrite it? [y/N]" optional
    case "$(printf '%s' "$OVERWRITE" | tr '[:upper:]' '[:lower:]')" in
      y|yes) ;;
      *) die "Left everything alone. Delete $f yourself if you want a fresh start." ;;
    esac
  fi
done

# --- Collect -----------------------------------------------------------------

cat <<BANNER

${bold}Supabase${rst} ${dim}— Project Settings → API${rst}

BANNER

ask SUPABASE_URL "Project URL (https://xxxx.supabase.co)"
SUPABASE_URL="${SUPABASE_URL%/}"
case "$SUPABASE_URL" in
  https://*.supabase.co|https://*.supabase.in) ;;
  *) warn "That doesn't look like a Supabase URL. Continuing anyway." ;;
esac

ask ANON_KEY "anon / publishable key ${dim}(this one is safe in the browser)${rst}"
ask SERVICE_KEY "service_role / secret key ${dim}(server only — never the browser)${rst}"

anon_role="$(key_role "$ANON_KEY")"
svc_role="$(key_role "$SERVICE_KEY")"

# The check worth having. A swap here is silent and catastrophic.
if [ "$anon_role" = 'service_role' ] || [ "$svc_role" = 'anon' ]; then
  printf '\n'
  die "Those two keys are the wrong way round.
    The key you gave as 'anon' has role: ${anon_role}
    The key you gave as 'service_role' has role: ${svc_role}
  Writing them like this would publish an RLS-bypassing key to every browser.
  Re-run and swap them."
fi
[ "$anon_role" = 'anon' ]         && ok "anon key verified (role: anon)"         || warn "Could not verify the anon key's role — double-check it."
[ "$svc_role" = 'service_role' ]  && ok "service_role key verified"              || warn "Could not verify the service_role key's role — double-check it."

printf '\n%s\n' "${dim}JWT Secret is only on older projects (Settings → API → JWT Settings).${rst}"
printf '%s\n\n' "${dim}Don't see one? Just press Enter — the server falls back to JWKS.${rst}"
ask JWT_SECRET "JWT Secret ${dim}(optional, press Enter to skip)${rst}" optional

cat <<BANNER

${bold}Spotify${rst} ${dim}— developer.spotify.com/dashboard → your app → Settings${rst}

BANNER

ask SPOTIFY_ID "Client ID"
ask SPOTIFY_SECRET "Client secret"

# --- Generate ----------------------------------------------------------------

ENC_KEY="$(openssl rand -base64 32)"

REDIRECT_URI='http://127.0.0.1:8787/api/spotify/callback'
WEB_URL='http://127.0.0.1:5173'
API_URL='http://127.0.0.1:8787'

# umask so the files are never briefly world-readable between write and chmod.
umask 077

cat > server/.env <<EOF
# Generated by scripts/setup-env.sh on $(date '+%Y-%m-%d %H:%M:%S').
# Never commit this file.

SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
SUPABASE_JWT_SECRET=${JWT_SECRET}

# AES-256-GCM master key for every stored LIFX / Spotify secret.
# Back this up. Lose it and everyone reconnects LIFX and Spotify from scratch.
CREDENTIAL_ENC_KEY=${ENC_KEY}

SPOTIFY_CLIENT_ID=${SPOTIFY_ID}
SPOTIFY_CLIENT_SECRET=${SPOTIFY_SECRET}
SPOTIFY_REDIRECT_URI=${REDIRECT_URI}

WEB_APP_URL=${WEB_URL}
PORT=8787
EOF

cat > web/.env <<EOF
# Generated by scripts/setup-env.sh on $(date '+%Y-%m-%d %H:%M:%S').
# Everything here ships to the browser. The anon key is designed for that.
# The service_role key must never appear in this file.

VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_API_BASE_URL=${API_URL}
EOF

chmod 600 server/.env web/.env

# --- Verify ------------------------------------------------------------------

printf '\n'
# -E rather than BRE \+ : macOS ships BSD grep, where \+ is not portable.
grep -qE "^SUPABASE_SERVICE_ROLE_KEY=.+" server/.env || die "server/.env is missing the service_role key."
grep -qE "^VITE_SUPABASE_ANON_KEY=.+"    web/.env    || die "web/.env is missing the anon key."

# Belt and braces: prove the secret key did not land in the browser file.
if grep -qF -- "$SERVICE_KEY" web/.env; then
  rm -f web/.env
  die "The service_role key ended up in web/.env. Deleted it. This is a bug — please report it."
fi

ok "server/.env written  ${dim}(chmod 600)${rst}"
ok "web/.env written     ${dim}(chmod 600)${rst}"
ok "service_role key confirmed absent from web/.env"

cat <<SUMMARY

${bold}Summary${rst}
  Supabase URL         ${SUPABASE_URL}
  anon key             $(mask "$ANON_KEY")
  service_role key     $(mask "$SERVICE_KEY")
  JWT secret           $([ -n "$JWT_SECRET" ] && mask "$JWT_SECRET" || printf '%s' "${dim}(skipped — using JWKS)${rst}")
  Spotify client id    $(mask "$SPOTIFY_ID")
  Encryption key       ${dim}generated, 32 bytes${rst}

${bold}Two things left${rst}

  1. Add this exact Redirect URI to your Spotify app
     ${dim}(Dashboard → your app → Settings → Redirect URIs)${rst}

       ${REDIRECT_URI}

  2. Back up your encryption key somewhere outside the repo:

       ${dim}grep CREDENTIAL_ENC_KEY server/.env${rst}

Then start it up:

       ${bold}npm install && npm run dev${rst}

SUMMARY
