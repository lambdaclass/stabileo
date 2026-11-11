### Fixed

#### Harmonic recheck notices do not explain unrelated static result changes

Keep the omitted-mode correction restricted to harmonic structural analyses. Older stamps that did not record harmonic runs still receive the recheck notice, while a modern linear-only stamp does not. Remove the blanket result-quantity declaration: a harmonic correction cannot explain a wrong static member force or displacement in legacy-project checks.
