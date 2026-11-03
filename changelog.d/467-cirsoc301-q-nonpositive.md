### BREAKING (results)

#### CIRSOC 301 refuses a compression capacity with Qa ≤ 0 or above the squash load (2026-11-02)

- Fix #467 (SA-2026-030): a box or tube whose area is smaller than the plates its compression
  elements describe got a negative Qa in §E.7, a NaN slenderness and the elastic branch, and so a
  compression capacity above A·Fy (1 098 908 kN on a 976 kN section), and passed. The check now
  refuses Q ≤ 0 and any Fcr above Fy: the member is held with the reason. Correct sections are
  unchanged. Re-check custom steel sections whose area was typed by hand.
