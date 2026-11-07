### Added
#### SA-2026-047: a project with shells solved before #1676 names the imposed-displacement shell stress advisory (2026-11-07)

From #254 (2026-10-06, so 0.2.0, 0.3.0 and 0.4.0) until #1676, a load case that imposed a support
displacement in a model with plates or quads lost all of its shell stresses, and combinations and
envelopes summed only the other cases' shell stresses, without a warning (#1673). A project solved
with those versions now opens with advisory SA-2026-047 until it is solved again: as affected
when the model has shells and a load case that imposes a displacement, and as possibly affected
when it has shells and no such case now. A model without shells is not warned. Re-solve and
compare the shell stresses of the combinations that include that case.
