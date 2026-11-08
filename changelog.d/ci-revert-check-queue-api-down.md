### Fixed
#### Revert Check in the merge queue rejects a step the API cannot confirm, by its own guard (2026-11-08)

- In the merge queue, Revert Check compares the API's head sha for each pull request with the
  step's second parent. When the API call failed and the step had one parent, both sides were empty
  and the guard let the step through; only a later traceback in the checker failed the job. The
  guard now requires both a second parent and a head sha from the API, and fails with its message.
