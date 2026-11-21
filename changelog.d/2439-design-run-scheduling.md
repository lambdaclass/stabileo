### Fixed
#### Design runs and web unit scheduling

Design commands run synchronously. Web unit tests yield between commands so workers can process replies without interrupting member searches or detailing.

The scheduling tests compare synchronous and stepped settling, check complete detailing assemblies, and verify that undo restores every assembly field before returning.
