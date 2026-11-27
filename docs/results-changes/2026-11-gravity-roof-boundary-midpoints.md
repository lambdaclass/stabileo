# Preserve generated loads on rotated roof boundaries

Regenerate automatic roof area and snow loads on affected spatial frame models, then rerun the analyses that use them.

The automatic gravity planner checks overhead coverage at each member's midpoint when transferring loads by tributary width. On an earlier revision of PR #2512, rounding the midpoint after a plan rotation could put it outside a footprint edge shared by both ends of the member. The planner then treated a rafter belonging to the same roof as overhead cover. In the asymmetric roof regression, the unrotated model received nine snow line loads. The rotated model received eight and omitted the load on member 8.

Member midpoint queries now use the member endpoints to establish when the midpoint lies on a footprint edge. Both endpoints must be on the edge under the existing exact geometric test. The same coverage query supplies the roof and headroom classifiers. The rotated regression again receives all nine snow line loads with the same intensities and span stations as its unrotated counterpart.
