# Check the units of out-of-range thermal expansion coefficients

Thermal loads on members and shells require a finite material coefficient with |α| < 0.001 /°C. The workbook and project solve now give the same refusal in SI units. Correct the material and recalculate any affected result. A coefficient of zero and negative coefficients inside the interval remain valid.

In a replay of a saved 4 m bar heated by 20 °C, the earlier project adapter substituted the concrete family coefficient for an explicit −0.001 /°C. Both the plane and spatial solve returned +0.0008 m of free extension with informational diagnostics. The corrected adapter refuses the load before dispatch. Positive coefficients at the same limit already triggered the member engine’s unit check.

Explore also applies the spatial section multiplier to both bending inertias and the torsion constant. Re-run any spatial Explore comparison made with the former I control. For a session multiplier of two the former control doubled only Iy. The revised control doubles Iy, Iz and a known J together.
