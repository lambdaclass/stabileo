### Fixed

#### Staged CI fixtures retain the support-state refusal boundary

Correct staged construction test fixtures to activate their supports explicitly, while checking that incompatible support histories are refused. Retain dense/sparse numerical comparisons and support reactions without changing engine results or tolerances. Type saved-model applicability fixtures explicitly so the web typecheck accepts connector entries without type assertions (#1949).
