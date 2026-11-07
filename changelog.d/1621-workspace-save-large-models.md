### Fixed
#### The workspace save keeps a designed building and says so when the browser refuses it (2026-11-07)

Every 30 s the open tabs are saved to the browser for the next visit. On a designed and detailed
building that save produced about 46 MB of text, more than browsers allow, so it failed without a
word and the tabs were not kept. The detailing's bars now go to the browser's database beside the
tabs, written once per version of them, and the saved text holds the rest: about 160 kB on the
7-storey example instead of 46 MB, written in a few milliseconds instead of 0.3 s (Node) and 1.4 to
3.4 s (browser). Pinned bars and the title block come back with the project. When a save is
refused anyway, a notice stays on screen saying the work is not being autosaved, with a button to
save the session to a file, and a tab whose bars could not be read back is named when it opens
(#1621).
