### Fixed

#### Preserve exact nightly reproducers and validate replay results

Keep every distinct structural model and seed for each check. Replay results count toward issue closure only when they match the saved input and tested commit. Legacy fuzz crashes without recoverable input bytes stay unresolved during duplicate detection.
