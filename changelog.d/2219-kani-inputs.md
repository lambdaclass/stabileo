### Fixed
#### Run Kani when any reached engine module changes

- Declare every additional engine source file reached by the gravity branch’s Kani harness closure as a Kani input, including dependencies introduced by merging main (#2219, #2274).
