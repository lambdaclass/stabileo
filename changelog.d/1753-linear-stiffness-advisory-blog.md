### Fixed
#### List the linear-stiffness advisory draft in every blog language (2026-11-10)

The safety-advisories post now lists SA-2026-054 with High severity in all six
written languages. Its summary and status note explicitly say the fix has not
been merged or deployed, following the draft convention used for SA-2026-049
through 053 before publication. The advisory and index consistently mark it as a
draft. Advisory completeness checks remain unchanged, and `make test.web.unit UNIT_AREA=blog`
now selects the blog unit files.
