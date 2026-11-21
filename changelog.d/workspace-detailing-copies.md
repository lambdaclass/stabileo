### Performance
#### Save and restore large reinforcement workspaces faster (2026-11-21)

Workspace snapshots reuse immutable detailing. Restoring imported detailing copies each shared part once and avoids the growing registry of frozen objects that slowed repeated restores.
