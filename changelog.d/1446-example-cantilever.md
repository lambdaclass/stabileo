### BREAKING (results)

#### The 3D biaxial cantilever example stays within small rotations (2026-11-05)

Only the bundled example changed; a saved model gives the same numbers as before. The biaxial cantilever twisted 0.42 rad and its 3 m tip moved 103 mm in all (span/29), outside linear analysis (#1446). Its torque is now 0.5 kN·m (10 kN at 50 mm eccentricity) and its tip loads Fy 1 kN and Fz 10 kN, so it twists 0.042 rad and its tip moves 11 mm in all (span/272). Its axial compression is now 10 kN, 4% of the weak-axis Euler load of the 3 m cantilever (247 kN; it was 100 kN, 40%), so second-order effects add about 4% instead of about 70%.
