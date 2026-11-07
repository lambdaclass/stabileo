### Performance
#### The 30 s autosave no longer copies and rewrites an unchanged project (2026-11-07)

Every 30 s the project autosave deep-copied the whole model, the detailing bars included, and
wrote it to IndexedDB as a new revision, even when nothing had changed: about 46 MB and 440 ms
(Node, `fake-indexeddb`) per tick on the designed and detailed 7-storey building, and the three
kept revisions were all the same project. The detailing, already a plain frozen copy per version,
is no longer copied again, and a project unchanged since this page's last write is not written
again while that write is still the newest (another window's write or a discard makes it write
again). On the same building a tick now takes about 2 ms. The workspace save (every open tab) no
longer rewrites unchanged text, and when a newer workspace cannot be written the previous one is
moved to the workspace backups instead of being deleted; the save notice still shows (#1662).
