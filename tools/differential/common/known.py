"""Known stabileo discrepancies, fixed on open branches not yet merged into
this one. A mismatch matching a rule is reported as `known` (with the PR)
instead of `mismatch`. Remove a rule once its fix is merged here.
"""


def _only(bad, quantity):
    return bad and all(b[0] == quantity for b in bad)


RULES = [
    # Empty: the P-Delta end-force rule (#283, 3a55ff49: end forces omitted
    # Kg*u) was left here after its fix merged on 2026-10-17, and from then on
    # it reported every P-Delta model whose only disagreement is in the end
    # forces as `known` instead of `mismatch`.
]


def classify(analysis, bad):
    for why, rule in RULES:
        if rule(analysis, bad):
            return why
    return None
