# Transverse point loads near member ends

The 3D load builder used to move transverse point loads within the end tolerance onto the end node. This changed their lever arm about a support or connection. The load accounting guard detected the difference in the HS20 position cases when the assembled moment was zero. A transverse load inside the span now goes to the solver at its entered station, including when the station falls within the end tolerance. A load exactly at an end still acts at that end.

For a transverse force on a cantilever, the support moment includes the entered distance from the support multiplied by the force. Stored and newly generated position cases use the same load builder.
