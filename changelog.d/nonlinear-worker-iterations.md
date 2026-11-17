### Performance
#### Keep nonlinear solves responsive and reuse displacement scales (2026-11-17)

Run nonlinear native solves in a worker while sharing the active-set algorithm
with the synchronous path. Retain the initial factorization across cases,
snapshot inputs, and stop superseded solves between native calls. Expose progress
and cancellation to callers; release sessions on completion or failure. Compute
the displacement scale once per iteration instead of once per inactive member.
Preserve native refusal messages, including errors returned as strings.
