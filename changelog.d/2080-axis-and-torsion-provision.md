### Fixed

#### Keep shared beam axes independent and report missing torsion provision

- Include every station's section-demand axis and all verification inputs in shared-span reuse, so reversed sections cannot inherit another beam's demands, capacities or certificate (#2080).
- Keep longitudinal torsion steel unresolved until provision is supplied; retain required steel, actual transverse-cage checks and proven failures. Unresolved designs are held and cannot receive a passing certificate (#2080).

#### Read concurrent steel interaction once

- Batch complete steel station checks and reuse their interaction rankings instead of checking every station twice. Skip calculation rendering during optimizer screening while keeping all concurrent demands, governing traces and the certified gate (#2080).
