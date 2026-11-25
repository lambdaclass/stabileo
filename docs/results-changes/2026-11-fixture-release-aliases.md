# Agreeing member releases in fixture replay

A fixture can declare an end release using the legacy `hingeStart` or `hingeEnd` flag and the matching `releaseI.mz` or `releaseJ.mz` field. Earlier fixture replay toggled the same release for each enabled field, leaving that end rigid when both fields were true. Current replay canonicalizes the flags before creating the member and applies each release once. The solver equations are unchanged.

The regression fixture is a 2 m beam with fixed supports and a uniform transverse load of −4 kN/m. With a release at either end, equilibrium and zero rotation at the fixed end give 3 kN at the released end and 5 kN at the fixed end. The earlier replay returned 4 kN at each end. The fixture with just the typed release specifies the same model as the fixture with both fields.

The registry condition matches source members that enable both spellings for the same end. An older project saved after replay can carry only the resulting rigid member, which provides no evidence of the original hinge declaration. Reload the original fixture and rerun any analysis based on affected inputs.
