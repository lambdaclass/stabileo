### Fixed
#### Refuse non-finite cable and soil–structure worker inputs

The worker rejects non-finite numbers anywhere in the solve payload before serializing it. A non-finite optional support stiffness can no longer reach the worker's solver as a missing stiffness.
