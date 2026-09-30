#!/bin/zsh
# Exercises gate.mjs, one branch per rule. Run it after touching the rule:
#
#   zsh .github/gate-test.sh
#
# Everything happens in a throwaway worktree. The first version of this ran in the
# real checkout and swept uncommitted work into its own test commits, so the
# isolation is the point rather than tidiness.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
WT="${TMPDIR:-/tmp}/gate-test-wt"

cd "$REPO"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add -q --detach "$WT" main
cd "$WT"

fail=0
run() {   # run <expected first word> <author> <label>
  # The rule from this checkout, not from whatever commit the worktree stands on.
  got=$(PR_AUTHOR="$2" ADMIN=auroruse BASE=main HEAD=HEAD node "$REPO/.github/gate.mjs")
  if [[ "${got%% *}" == "$1" ]]; then print -r -- "  ok    $3 -> $got"
  else print -r -- "  FAIL  $3 -> wanted $1, got: $got"; fail=1; fi
}
start() { git checkout -q --detach main; }
commit() { git add -A; git -c user.email=t@t -c user.name=t commit -q -m t; }

print "a page the nation is credited on"
start; print x >> src/content/articles/skjarnish-armed-forces.md; commit
run merge SwiftorArrow      "skjarnland edits its own page"
run wait  kiohit05-cyber    "albinya edits skjarnland's page"
run wait  nobody-at-all     "an account that writes for no nation"
run merge auroruse          "the admin edits it"

print "a communal page"
start; print x >> src/content/articles/hephae.md; commit
run wait  that1sealguy      "a nation that is not on the byline"
run wait  mrrv533-creator   "alemannia, which is on the byline beside nichirin"
run merge auroruse          "the admin, who is exempt from the byline"

print "a byline being moved"
start; sed -i '' 's/^nation: skjarnland$/nation: esu/' src/content/articles/skjarnish-armed-forces.md; commit
run wait  SwiftorArrow      "skjarnland hands its own page to esu"

print "a new page"
start
printf -- '---\ntitle: "T"\ntype: character\nnation: skjarnland\n---\n\nBody.\n' > src/content/articles/gate-test-page.md
commit
run merge SwiftorArrow      "credited to the nation that wrote it"
run wait  that1sealguy      "credited to somebody else"

print "a new page with no nation on it"
start
printf -- '---\ntitle: "T"\ntype: character\nnavbox: site\n---\n\nBody.\n' > src/content/articles/gate-test-page.md
commit
run merge SwiftorArrow      "is the nation's that wrote it"
run wait  nobody-at-all     "unless the writer writes for no nation"

print "pictures"
start; cp public/assets/flags/albinya.png public/assets/flags/gate-test.png; commit
run merge SwiftorArrow      "adding one"
start; printf x >> public/assets/flags/albinya.png; commit
run wait  SwiftorArrow      "replacing one that exists"

print "navboxes, which the editor also writes"
start; print "# x" >> src/content/data/navboxes/skjarnland.yaml; commit
run merge SwiftorArrow      "a nation's own navbox"
run wait  that1sealguy      "another nation's navbox"
start; print "# x" >> src/content/data/navboxes/site.yaml; commit
run wait  SwiftorArrow      "the site navbox"
run merge auroruse          "the site navbox, by the admin"

print "a branch from an old fork"
# A fork days behind main calls anything made since "new". Main still decides.
stale() { git checkout -q --detach 4edb6e1; }
stale; printf -- '---\ntitle: "Elias Gray"\ntype: character\nnation: karjania\n---\n\nx\n' > src/content/articles/elias-gray.md; commit
run wait  zezelandnationstates-hash "karjania 'adds' an E.S.U. page made since"
stale; printf -- '---\ntitle: "Elias Gray"\ntype: character\n---\n\nx\n' > src/content/articles/elias-gray.md; commit
run wait  that1sealguy      "e.s.u. 'adds' its own page made since, with no nation on it"
stale; mkdir -p public/assets/flags; printf x > public/assets/flags/albinya.png; commit
run wait  SwiftorArrow      "'adds' a flag that is already on main"

print "everything that is not a page"
start; print "# x" >> README.md; commit
run wait  SwiftorArrow      "the readme"
start; print "# x" >> src/content/data/nations.yaml; commit
run wait  auroruse          "the nations table, even for the admin"
start; git rm -q src/content/articles/hephae.md; commit
run wait  SwiftorArrow      "deleting a communal page"

cd "$REPO"
git worktree remove --force "$WT"
print ""
[[ $fail == 0 ]] && print "every rule holds" || print "SOME RULES DO NOT HOLD"
exit $fail
