# Roof drift in the outrigger gallery sweep

For each candidate attachment level, the gallery chart used to solve a core with a separate member at every floor. On this model the core is straight and prismatic, carries uniform distributed wind, and connects to other members only at the outrigger. The chart reads roof displacement. Its trial model now ends a core member at the attachment and at the roof. When the attachment is at the roof, the core is one member. The editor, selected-level solution, deformed shape and certificate continue to use the full storey model.

The regression compares every trial in the 15-storey example directly with the original full-storey WASM solve and the gallery’s Smith & Coull compatibility solution. It also checks total horizontal reaction against the applied wind. Floating-point roundoff can change chart coordinates. The gallery feature limits the registration to that chart. Reopening saved projects does not apply it.
