### Fixed

#### Keep What if results with their solved model and preserve material properties

What if preserves disconnected members and applies support moves together. Its pending diagram uses the solved section, clears after a failed solve, and labels nodal displacements and force maxima explicitly. Editing a material preserves an untouched thermal coefficient. Replacing a material with a catalogue preset clears its old placing properties. (#2491)
