### Fixed

#### Require complete and current evidence before closing nightly findings

Preserve distinct fuzz inputs when reporting crashes. Serialize issue publication and replay updates, and recheck the live issue body and bot sightings before closing. Allow closure after the first overflow batch passes along with all earlier reproducers. Replaced or incomplete overflow evidence keeps the issue open.
