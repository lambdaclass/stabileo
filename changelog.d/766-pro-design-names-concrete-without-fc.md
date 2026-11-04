### Fixed

#### PRO design names the concrete with no f′c instead of calling every member steel (2026-11-02)

- Fix #766: a concrete material with no strength (no f′c or fy) was counted as steel, so the
  CIRSOC 201 check said "all 105 of its members are steel" on the 3d-building example, whose H-30
  had no strength, and checked none of them. Such a material is now named in the message ("material
  H-30, used by 105 members, has no f′c"), and the 3d-building example's H-30 carries f′c = 30 MPa,
  so PRO designs all of its members.
