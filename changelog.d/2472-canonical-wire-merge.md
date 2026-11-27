### Fixed

#### Validate numeric fields when reconciling planar solver aliases

Planar solver input accepts agreeing aliases and retains the positional field order for existing inputs. Named numeric fields must be finite when present. Positional records can still use null placeholders for absent optional values.
