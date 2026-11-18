### Fixed
#### Refuse incomplete combinations and stale nonlinear results

- Refuse combinations that reference a missing case result with a nonzero factor.
- Cancel single nonlinear results when the model changes during worker cleanup, and capture spectral results when an asynchronous nonlinear combination solve starts.
