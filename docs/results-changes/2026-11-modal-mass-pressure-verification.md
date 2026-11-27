# Check Explore pressures before computing modal mass

The mass source verifies shell pressures against the Explore request before integration, including reference cases used solely for mass. It uses the same field and pressure validation as spatial static analysis. If the entered factor is 0.5 for a pressure of 1 kN/m² and the mass source receives 0.75 kN/m², it reports the pressure mismatch before returning a mass or preparing a modal solve.
