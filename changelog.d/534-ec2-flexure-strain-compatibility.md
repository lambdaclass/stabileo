### BREAKING (results)
#### EN 1992-1-1 flexure solves the neutral axis by strain compatibility (2026-11-02)

The EN 1992-1-1 check (PRO other codes, `check_ec2_members`, `certify_ec2_members`) assumed the
tension steel yields and took the compression-steel strain from the singly reinforced neutral
axis without iterating, so MRd was up to about 20 % high on over-reinforced beams and beams with
top bars, and a failing beam could be certified OK. The neutral axis is now the root of the
strain-compatible force balance (3.1.7 block, εcu3 from Table 3.1, steel 3.2.7 horizontal top
branch), in the f64 and the certified interval checks. Top bars inside the stress block are
taken net of the concrete they displace, and add nothing when in tension. Re-run the EN 1992-1-1 check on concrete
beams. Issue #534; PR #1236; results version 7; advisory
[SA-2026-028](../docs/advisories/SA-2026-028-ec2-flexure-strain-compatibility.md).
