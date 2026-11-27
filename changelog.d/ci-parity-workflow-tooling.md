### Fixed
#### Long-lived PRs can use production parity checks added to their target branch (2026-11-27)

CI runs the parity checker from the workflow checkout. It checks the PR head against its merge base and the workflow merge against its first parent. If either pair requires parity, CI builds the workflow merge and its first parent, with declared production edits applied to the first parent. A PR can pass planning even when its own Makefile predates the parity target.
