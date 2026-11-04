### Security
#### Backend dependencies updated, including assent's sign-in fix (2026-11-02)

The backend's assent (0.3.2, a fix in how Apple sign-in claims are checked), bandit, phoenix and
ssl_verify_fun are updated (#1069). Lock file only; the backend is not deployed yet, so no user
was exposed. No calculation changes.
