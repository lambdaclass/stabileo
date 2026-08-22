# PR20 — removing the co-authorship trailers

**Nothing here has been executed. It runs only on Bauti's explicit go-ahead, and only after
manual QA is finished.**

## What is actually there

Measured on `feat/pro-visual-system`, base `05ceca9e` (merge-base with `main`):

| | |
|---|---|
| Commits on the branch | **92** |
| Author on all 92 | `Bauti <syngoviano@gmail.com>` |
| Committer on all 92 | `Bauti <syngoviano@gmail.com>` |
| Commits carrying a trailer | **46** |
| Distinct trailers | **1** — `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` |
| Of those, already pushed | **38** |
| Of those, local only | **8** |
| Commits made after the rule was set | **3**, all trailer-free |

**No commit is authored or committed by anyone but Bauti.** The trailer is metadata in the message
body; it does not change `Author` or `Committer`. GitHub renders it as a co-author avatar on the
commit, and that is the whole of its effect.

Verify any of this yourself:

```bash
git log --format='%h %an <%ae> | %cn <%ce>' 05ceca9e..HEAD | wc -l
git log --format=%B 05ceca9e..HEAD | grep -ci 'co-authored-by'
git log --format='%an <%ae>' 05ceca9e..HEAD | sort -u
```

## Why this needs authorisation

38 of the 46 are pushed. Removing a trailer rewrites the message, which changes the SHA, which
means every commit after it changes too — so the whole branch is rewritten and the remote has to be
force-updated. That is not reversible from the remote's side, and it has three real costs:

1. **Review threads on PR #125 anchored to a line of a specific commit go stale.** Comments on the
   PR conversation survive; comments pinned to a commit's diff may be orphaned.
2. **Any other clone or worktree of this branch diverges** and has to reset. There are seven
   worktrees on this machine; only `stabileo-landing` is on this branch, but a colleague's clone
   would be affected the same way.
3. **CI re-runs from scratch** on the new SHAs.

None of that is dangerous. All of it is annoying if it happens unannounced.

## When to do it

**After manual QA, before the merge.** Doing it before QA means QA is run against SHAs that will
not exist; doing it after the merge means rewriting `main`, which is a different and much worse
conversation.

## The plan

### 0. Confirm nobody depends on the current SHAs

```bash
git worktree list                       # only stabileo-landing should be on this branch
git branch -a --contains HEAD           # nothing else should contain these commits
gh pr view 125 --json headRefName,state
```

Ask in whatever channel the team uses before rewriting a pushed branch. If anyone has the branch
checked out, they need to know they will have to `git fetch && git reset --hard`.

### 1. Back it up, locally and on the remote

```bash
git branch pr20-backup-before-trailer-cleanup
git push origin pr20-backup-before-trailer-cleanup      # a remote backup, not only a local one
git rev-parse HEAD > /tmp/pr20-sha-before-cleanup.txt
```

A local branch is not a backup if the disk is the thing that fails. Push it.

### 2. Record what the history looks like now

```bash
git log --format='%h|%an|%ae|%cn|%ce|%s' 05ceca9e..HEAD > /tmp/pr20-history-before.txt
wc -l /tmp/pr20-history-before.txt        # expect 92
```

This is the file step 5 compares against. Without it, "the authors are unchanged" is an assertion.

### 3. Strip the trailer, and nothing else

`git filter-branch` is deprecated and mangles messages. Use `filter-repo` if it is installed,
otherwise `rebase` with a message filter. The safest available form:

```bash
git filter-repo --force --refs 05ceca9e..HEAD \
  --message-callback '
    import re
    return re.sub(rb"\n*^Co-Authored-By:.*$", b"", message, flags=re.M | re.I).rstrip() + b"\n"
  '
```

What this must NOT do, and must be checked after:

- touch `Author` or `Committer` on any commit;
- change any subject line or any body text other than the trailer;
- change a single byte of file content;
- alter commit order or drop a commit.

### 4. Verify the content is byte-identical

```bash
git diff pr20-backup-before-trailer-cleanup HEAD --stat     # must be EMPTY
```

An empty diff against the backup is the proof that only messages changed. If this prints anything
at all, **stop and reset**: `git reset --hard pr20-backup-before-trailer-cleanup`.

### 5. Verify the identities and the count

```bash
git log --format='%h|%an|%ae|%cn|%ce|%s' 05ceca9e..HEAD > /tmp/pr20-history-after.txt
wc -l /tmp/pr20-history-after.txt                            # expect 92
diff <(cut -d'|' -f2- /tmp/pr20-history-before.txt) \
     <(cut -d'|' -f2- /tmp/pr20-history-after.txt)           # expect NO differences
git log --format=%B 05ceca9e..HEAD | grep -ci 'co-authored-by'   # expect 0
git log --format='%an <%ae>|%cn <%ce>' 05ceca9e..HEAD | sort -u  # expect ONE line, Bauti
```

The `diff` compares author, email, committer and subject while deliberately ignoring the SHA, which
is the only field that is supposed to have changed.

### 6. Push with a lease, never with a bare force

```bash
git push --force-with-lease origin feat/pro-visual-system
```

`--force-with-lease` refuses if the remote moved since your last fetch — it is the difference
between rewriting your own work and silently discarding someone else's. Never `--force` here.

### 7. Re-check the PR and the minimum gates

```bash
gh pr view 125 --json state,mergeable,headRefOid
cd web && npm run typecheck && npm run test
E2E_PORT=4293 npx playwright test --grep @smoke
```

The full suite does not need re-running: file content is provably unchanged by step 4. Typecheck,
unit and smoke are there to catch a botched rewrite, not to re-validate the branch.

If anything is wrong at this point:

```bash
git reset --hard pr20-backup-before-trailer-cleanup
git push --force-with-lease origin feat/pro-visual-system
```

### 8. Only once the merge is done

```bash
git branch -D pr20-backup-before-trailer-cleanup
git push origin --delete pr20-backup-before-trailer-cleanup
```

Keep the backup until the PR is merged and green. It costs nothing.

## An alternative worth considering

If the branch will be **squash-merged**, the 46 trailers vanish on their own: a squash writes one
new message, and whatever is written there is the whole record. No rewrite, no force-push, no stale
review anchors — just care with the squash message.

Worth checking `gh pr view 125` for the repo's merge policy before doing any of the above.
