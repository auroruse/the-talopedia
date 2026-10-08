#!/bin/zsh
# Exercises land.mjs: branches made the way the editor makes them from a fork days
# behind main, landed on main as it stands. Run after touching the merge:
#
#   zsh .github/land-test.sh
#
# Everything happens in a throwaway worktree; the real checkout is never touched.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
WT="${TMPDIR:-/tmp}/land-test-wt"
cd "$REPO"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add -q --detach "$WT" main
cd "$WT"

OLD=4edb6e1                       # a fork snapshot from before these pages existed
P=src/content/articles/land-test-opened.md
cfg=(-c user.email=t@t -c user.name=t)
# A page of the test's own on top of main, so no case leans on what a real page says. It
# is written three times over, as one case opens the copy from two versions back.
git checkout -q --detach main
for v in 1 2 3; do
  print -r -- "---
title: \"Testland\"
type: overview
nation: nichirin
---

Testland, officially the Republic of Testland, is a country made for testing the merge.

Version $v of a paragraph that only the history needs.

A last paragraph, the same in every version." > $P
  git add $P; git $cfg commit -qm "land-test page, version $v"
done
X=$(git rev-parse HEAD)           # the copy of main the writer opened
fail=0
check() {   # check <label> <condition>
  if eval "$2"; then print -r -- "  ok    $1"; else print -r -- "  FAIL  $1"; fail=1; fi
}
# A pull request as the editor sends it: off the old fork, one commit per page with
# the page's whole text and the commit it was opened from.
pr() {   # pr <based-on or ""> <path> <content-file or "-" to delete>...
  local from=$1; shift
  git checkout -q --detach $OLD
  while (( $# )); do
    if [[ $2 == - ]]; then git rm -q -- $1 2>/dev/null || true
    else mkdir -p ${1:h}; cp $2 $1; git add -- $1; fi
    git $cfg commit -q --allow-empty -m "${1:t:r}: edit${from:+

Based-on: $from}"
    shift 2
  done
  PR=$(git rev-parse HEAD)
}
# Main as it stands when the pull request lands: the writer's copy, plus whatever
# the given script does to it.
onto() { git checkout -q --detach $X; [[ -n ${1:-} ]] && { eval "$1"; git $cfg commit -qam main; }; true; }
# The script from this checkout: the worktree sits on older commits that predate it.
land() { RESULT=$(ONTO=HEAD PR_HEAD=$PR NOTES=$S/notes WRITER=${WRITER:-} node "$REPO/.github/land.mjs"); }
S=$(mktemp -d)

print "a page untouched on main since it was opened"
git show $X:$P > $S/p; print "Added by the writer." >> $S/p
pr $X $P $S/p; onto; land
check "lands"                       '[[ $RESULT == ready ]]'
check "exactly the writer's text"   'git show :$P | cmp -s - $S/p'

print "main changed another part of it since"
onto "sed -i '' '2s/.*/title: \"Testland (renamed on main)\"/' $P"; land
check "lands"                       '[[ $RESULT == ready ]]'
check "keeps main's change"         'git show :$P | grep -q "renamed on main"'
check "and the writer's"            'git show :$P | grep -q "Added by the writer."'

print "main and the writer changed different sentences of one paragraph"
git show $X:$P | sed '/^Testland, officially/s/$/ Added by the writer./' > $S/r
pr $X $P $S/r
onto "sed -i '' 's/^Testland, officially/Testland (reworded on main), officially/' $P"; land
check "lands"                       '[[ $RESULT == ready ]]'
check "with both"                   'git show :$P | grep -q "^Testland (reworded on main), officially.* Added by the writer\.$"'
check "and nothing to report"       '[[ ! -s $S/notes ]]'

print "main changed the same words since"
git reset -q --hard
git show $X:$P | sed '2s/.*/title: "Testland (the writer)"/' > $S/q
pr $X $P $S/q
onto "sed -i '' '2s/.*/title: \"Testland (main)\"/' $P"; land
check "lands with the writer's words" '[[ $RESULT == ready ]] && git show :$P | grep -qxF "title: \"Testland (the writer)\""'
check "and says what main had"      'grep -qF "(main)" $S/notes'

print "sent with no note of the copy it was opened from"
git reset -q --hard
pr "" $P $S/p; onto; land
check "lands, as the writer wrote it" '[[ $RESULT == ready ]] && git show :$P | cmp -s - $S/p'

print "sent with no note, from a copy two versions old"
git reset -q --hard
git show $(git log --format=%h -n 1 --skip 2 $X -- $P):$P > $S/s
print "Added by the writer." >> $S/s
pr "" $P $S/s; onto; land
check "lands"                       '[[ $RESULT == ready ]]'
check "keeps everything main changed since" 'git show :$P | sed "\$d" | cmp -s - <(git show $X:$P)'
check "and adds the writer's line"  '[[ "$(git show :$P | tail -n 1)" == "Added by the writer." ]]'
check "and nothing to report"       '[[ ! -s $S/notes ]]'
git reset -q --hard

print "a new page"
print -- "---\ntitle: \"T\"\ntype: character\nnation: nichirin\n---\n\nNew." > $S/n
pr $X src/content/articles/land-test-page.md $S/n; onto; land
check "lands"                       '[[ $RESULT == ready ]] && git show :src/content/articles/land-test-page.md | cmp -s - $S/n'

print "a new page at a name someone has taken since"
onto "cp $S/q src/content/articles/land-test-page.md; git add src/content/articles/land-test-page.md"; land
check "waits for a person"          '[[ $RESULT == wait* ]]'

print "a new page with no nation on it"
N=src/content/articles/land-test-new.md
print -- "---\ntitle: \"T\"\ntype: character\nnavbox: site\n---\n\nNew." > $S/u
pr $X $N $S/u; onto; WRITER=GeneralVarah; land; WRITER=
check "lands credited to the writer's nation" '[[ $RESULT == ready ]] && git show :$N | grep -qx "nation: varahmehr"'
check "right under its type"        '[[ "$(git show :$N | sed -n 3,4p | tr "\n" "|")" == "type: character|nation: varahmehr|" ]]'
check "without the site navbox"     '! git show :$N | grep -q "^navbox:"'
check "and the rest as written"     'git show :$N | grep -qx "New."'
git reset -q --hard

print "deleting a page nobody has touched since"
D=src/content/articles/avium.md   # one the old fork already had
pr $X $D -; onto; land
check "lands, and the page is gone" '[[ $RESULT == ready ]] && ! git cat-file -e :$D 2>/dev/null'

print "pictures"
printf 'not really a png' > $S/img
pr $X public/assets/flags/land-test.png $S/img; onto; land
check "a new one lands"             '[[ $RESULT == ready ]]'
pr $X public/assets/flags/nichirin.png $S/img; onto; land
check "one already on main waits"   '[[ $RESULT == wait* ]]'

print "bold that took a space along"
git reset -q --hard
git show $X:$P > $S/b; print "**Bold by the writer **and plain." >> $S/b
pr $X $P $S/b; onto; land
check "lands with the space outside" '[[ $RESULT == ready ]] && git show :$P | grep -qxF "**Bold by the writer** and plain."'

print "the editor respaced a word that main reworded"
NB=$(printf '\302\240')   # a no-break space, as the old pages carry
T=src/content/articles/land-test-space.md
git reset -q --hard
git checkout -q --detach $X
print -r -- "Delegates${NB}(Chamber) and 39 more." > $T; git add $T; git $cfg commit -qm opened
Y=$(git rev-parse HEAD)
print -r -- "Delegates (Chamber) and 30 more." > $S/w
pr $Y $T $S/w
git checkout -q --detach $Y; sed -i '' 's/^Delegates/Deputies/' $T; git $cfg commit -qam main; land
check "lands with main's word and the writer's number" '[[ $RESULT == ready ]] && git show :$T | grep -qxF "Deputies${NB}(Chamber) and 30 more."'
check "and nothing to report"       '[[ ! -s $S/notes ]]'

# One writer's earlier save, landed by the workflow under their name.
landed() { GIT_COMMITTER_NAME='github-actions[bot]' git -c user.email=t@t -c user.name=$WRITER commit -qam "land-test-opened: first save (#1)"; }

print "the writer saved again before the last save had landed"
git reset -q --hard
WRITER=GeneralVarah
git show $X:$P > $S/s1; print "A section the writer added in the first save, long enough to count." >> $S/s1
# The second save moves that section up under the title and adds another at the end.
{ sed -n 1,10p $S/s1; tail -n 1 $S/s1; sed -n '11,$p' $S/s1 | sed '$d'; print "Added in the second save, at the end of the page."; } > $S/s2
pr $X $P $S/s2
git checkout -q --detach $X; cp $S/s1 $P; landed; land
check "lands exactly as sent"       '[[ $RESULT == ready ]] && git show :$P | cmp -s - $S/s2'
check "the moved section once"      '[[ $(git show :$P | grep -c "^A section the writer added") == 1 ]]'
check "and nothing to report"       '[[ ! -s $S/notes ]]'

print "a page reopened before the last save went live"
git reset -q --hard
# The second save comes from the copy first opened, without the first.
{ sed -n 1,10p $S/s1; print "Added from a copy reopened before the first save went live."; sed -n '11,$p' $S/s1 | sed '$d'; } > $S/s3
pr $X $P $S/s3
git checkout -q --detach $X; cp $S/s1 $P; landed; land
check "keeps the first save"        '[[ $RESULT == ready ]] && git show :$P | grep -qx "A section the writer added in the first save, long enough to count."'
check "and the second"              'git show :$P | grep -qx "Added from a copy reopened before the first save went live."'
WRITER=

print "only the paragraphs both changed go word by word"
git reset -q --hard
C=src/content/articles/land-test-paras.md
git checkout -q --detach $X
printf '%s\n' "The army crossed the river in the spring and the city fell in the summer." \
  "The navy held the bay through the winter and the fleet sailed in the spring." \
  "The treaty was signed in the autumn and the war ended in the winter." \
  "The king returned to the city and the court sat in the summer." > $C
git add $C; git $cfg commit -qm opened; Y=$(git rev-parse HEAD)
sed -e '2s/^The navy/The fleet/' -e '4s/^The king/The queen/' $C > $S/w
pr $Y $C $S/w
git checkout -q --detach $Y; sed -i '' -e '1s/the city fell/the town fell/' -e '2s/in the spring\.$/in the autumn./' $C; git $cfg commit -qam main; land
printf '%s\n' "The army crossed the river in the spring and the town fell in the summer." \
  "The fleet held the bay through the winter and the fleet sailed in the autumn." \
  "The treaty was signed in the autumn and the war ended in the winter." \
  "The queen returned to the city and the court sat in the summer." > $S/want
check "lands with both sides' words, every paragraph whole" '[[ $RESULT == ready ]] && git show :$C | cmp -s - $S/want'
check "and nothing to report"       '[[ ! -s $S/notes ]]'

# The real thing, from the history: an 80 KB page as a writer's third save sent it, onto
# main with their first save on it. Two paragraphs collide; going word by word over the
# whole page wove the rest together and put five of its sections in twice (#138, #139).
# The three versions are read by their ids, under a name of the test's own.
print "a long page where two paragraphs collide"
git reset -q --hard
L=src/content/articles/land-test-long.md
git checkout -q --detach $X; git cat-file blob 40ce622e3669ceee8f13f2d15dcd69a06593e4d4 > $L
git add $L; git $cfg commit -qm opened; Y=$(git rev-parse HEAD)
git cat-file blob 74ff9fe93f7873d9c6c0bbd8a54c8edfaf749f6b > $S/a
pr $Y $L $S/a
git checkout -q --detach $Y; git cat-file blob 6e19d698f86bc7ddcf1cec11f063f373bb911a58 > $L
git $cfg commit -qam main; land
check "lands exactly as sent"       '[[ $RESULT == ready ]] && git show :$L | cmp -s - $S/a'

cd "$REPO"
git worktree remove --force "$WT"
rm -rf $S
print ""
[[ $fail == 0 ]] && print "every case holds" || print "SOME CASES DO NOT HOLD"
exit $fail
