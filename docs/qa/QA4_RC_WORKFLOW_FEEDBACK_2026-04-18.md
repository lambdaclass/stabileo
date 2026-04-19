QA4 Results

Date: 2026-04-18
Branch: pr/3-calc-report-and-pro-polish
App: PRO mode
Primary example: RC QA Diagnostic (PRO)

Overall QA4 verdict:
- The workflow improved, but important verification content was lost when Verification was folded into Design.

Serious issues:
- The verifications are almost all gone.
- The intended direction was to bring everything from the old Verification tab inside the Design tab so both become one workflow.
- Opening verification at the end of a design row should show essentially the same content the report will show:
  - interaction diagram
  - all code-based verifications for CIRSOC, Eurocode, etc.
- The drawing / section editing from the old Verification tab's Manual Override had additional useful capabilities that the current Design-tab editor still does not have.
- Example mentioned: when adding excess rebars in a column, the old path would begin to fill the interior parts.

Minor issues:
- Modifying the designed rebars does not affect the Utilization, and it should.
- In PRO mode -> Analysis dropdown in the top toolbar, the old Verification button is still there and should not be.

Most important next step:
- Restore the lost verification depth inside the expanded Design-row workflow.
- Bring back the rich verification content from the old Verification tab inside Design instead of removing it.
- Reuse the more capable Manual Override / section-editing behavior where it is still superior.
- Make utilization respond to user design edits.
- Remove the legacy Verification entry from the Analysis dropdown.
