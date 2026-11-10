### Fixed
#### Plastic budget refusals avoid constructing oversized sample sets

Exact 2D/3D plastic admission counts samples before allocating them. The slow 24-member grid remains storage-admitted but is excluded from the live nightly fuzz corpus and retained under the replay watchdog. The budget and containment documentation now distinguishes storage admission, timed replay and historical mismatch refusals.
