#!/bin/zsh
# Types, pauses, switches boxes and pages in the built editor, undoes and redoes, and
# prints what held. Run after `npm run build`:
#
#   zsh scripts/editor-undo-test.sh
#
# Headless Chrome against a throwaway copy of dist/edit with the test appended, run in
# real time by editor-run.mjs. The copy and the server are gone again when it finishes.
set -eu
cd "$(dirname "$0")/../dist"
PORT=8799
cp ../scripts/editor-undo-test.js undo-test.js
mkdir -p undo-test
sed 's#</body>#<script src="/undo-test.js"></script></body>#' edit/index.html > undo-test/index.html
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf undo-test undo-test.js' EXIT
sleep 1.5
OUT=$(node ../scripts/editor-run.mjs "http://127.0.0.1:$PORT/undo-test/")
print -r -- "$OUT"
[[ -n "$OUT" && "$OUT" != *FAIL* ]]
