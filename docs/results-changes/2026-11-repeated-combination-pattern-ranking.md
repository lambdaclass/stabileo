# Rank load patterns by total action factor

When a rule wrote one action on several lines, the combination generator compared the individual factors. With floor and roof live-load patterns, `1L + 1L + 1.5Lr` varied the roof arrangement, while `2L + 1.5Lr` varied the floor arrangement. The split rule could omit the governing arrangement and understate an envelope.

The generator now resolves each action by load symbol, group and effective snow basis, then ranks the magnitude of its signed total. After validation, only actions with a nonzero total can supply choices or take part in pattern selection. The existing tie policy and companion-pattern option still apply. A total that cannot be represented as a finite factor blocks generation with a message naming the rule.

Exactly canceled terms could also create an alternative that omits a required load. When flat-roof and physical snow share an alternative set, `1S(flatRoof) + 4S(physical) − 4S(physical) + 1.5Lr` now generates the same choices as `1S(flatRoof) + 0S(physical) + 1.5Lr`. Every generated roof-live arrangement includes the applicable flat-roof snow.

Review saved rules with repeated action terms, regenerate the affected combinations or composite cases, and rerun their analyses and envelopes. The recheck notice covers saved rules with repeated nonzero terms for the same action. This includes legacy rules with a flat-roof snow note that mix implicit snow terms and explicit flat-roof snow terms.
