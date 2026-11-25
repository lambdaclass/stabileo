# Rank load patterns by total action factor

When a rule wrote one action on several lines, the combination generator compared the individual factors. With floor and roof live-load patterns, `1L + 1L + 1.5Lr` varied the roof arrangement, while `2L + 1.5Lr` varied the floor arrangement. The split rule could omit the governing arrangement and understate an envelope.

The generator now resolves each action by load symbol, group and effective snow basis, then ranks the magnitude of its signed total. A zero total cannot make an action principal. The existing tie policy and companion-pattern option still apply. A total that cannot be represented as a finite factor blocks generation with a message naming the rule.

Review saved rules with repeated action terms, regenerate the affected combinations or composite cases, and rerun their analyses and envelopes. The recheck notice covers saved rules with repeated nonzero terms for the same action. This includes legacy rules with a flat-roof snow note that mix implicit snow terms and explicit flat-roof snow terms.
