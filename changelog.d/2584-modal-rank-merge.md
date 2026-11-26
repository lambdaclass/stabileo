### Fixed

#### Preserve both modal stiffness refusals

Modal analysis preserves the diagnosed mechanism when a null translation carries mass, and also refuses unresolved reduced stiffness rank before computing modes.

Inclined-support assembly rotates the physical stiffness and its recorded roundoff together, while keeping the pre-rotation magnitude for the rank check.
