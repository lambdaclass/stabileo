### Security

#### Update quinn-udp for RUSTSEC-2026-0538 (#2076)

Update quinn-udp from 0.5.14 to 0.5.16 in the root Cargo.lock to address a receive loop that can spin after a truncated datagram. The merged change updates the dependency lockfile; structural analysis results are unchanged.
