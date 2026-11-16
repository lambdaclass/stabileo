### Fixed
#### Keep research locale and publication policy out of switches-off landing builds (2026-11-14)

- Offer Hungarian only in research builds, including public dictionaries, language selection, locale routes, and sitemap generation (#2099).
- Keep main's public-link URLs and language fallback when the integration switches are off, retaining publication fallback and moved-page links when enabled.
- Remove disabled account and game strings and markup before public bundles are compiled, and defer full application dictionary loading behind its own import boundary.
- Keep branch-only tool routes refused while sharing their main-tool identity check with the enabled policy.
