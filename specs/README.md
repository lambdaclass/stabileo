# Specs

Specifications and guidelines for the Stabileo backend.

```
specs/
├── README.md           # This file
├── backend.md          # Backend architecture: the map. Line-by-line rules are in backend/CLAUDE.md
└── services/           # Per-service specifications
    ├── TEMPLATE.md     # Template for new service specs
    ├── accounts.md     # stabileo_auth accounts: the template filled in
    └── admin.md        # The admin site: admin sign-in and account management
```

Start a new service spec by copying `services/TEMPLATE.md`. Write it before implementing, and follow it while implementing.
