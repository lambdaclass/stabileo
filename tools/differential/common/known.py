"""Known stabileo discrepancies, fixed on open branches not yet merged into
this one. A mismatch matching a rule is reported as `known` (with the PR)
instead of `mismatch`. Remove a rule once its fix is merged here.
"""


def _only(bad, quantity):
    return bad and all(b[0] == quantity for b in bad)


RULES = [
    # P-Delta member end forces were K·u - FEF, without the geometric
    # stiffness, so they did not balance the reactions (which come from
    # K + Kg). Displacements and reactions agree; only end forces differ.
    ("#283 (3a55ff49): P-Delta end forces omit Kg*u",
     lambda analysis, bad: analysis == "pdelta" and _only(bad, "force")),
]


def classify(analysis, bad):
    for why, rule in RULES:
        if rule(analysis, bad):
            return why
    return None
