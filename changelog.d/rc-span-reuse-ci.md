### Fixed
#### Exercise RC span reuse with exact zero-shear demands (2026-11-20)

The RC span-reuse test now prescribes zero shear for a cantilever loaded by an end couple, so solver roundoff cannot trigger the torsion-depth refusal before the test reaches the certificate hold. The project recheck test preserves the upstream notice assertions and checks the four RC notices explicitly.
