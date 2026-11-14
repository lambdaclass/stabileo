### Fixed

- Refuse a pending results download if its model, result or provenance changes during sign-in. File builders run only after authorization; reports and workbooks recheck provenance and containment before release.
- Preserve the sign and magnitude of a small plane principal stress when subtracting the Mohr radius from the center would erase it. Section stress and the plane Mohr tool share the corrected calculation (#2099).
