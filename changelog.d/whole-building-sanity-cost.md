### Performance

#### Whole-building diagnostics under distributed wind loads

Whole-building diagnostics verify generated loads one case at a time and reuse completed distributed loads when reading member forces. This reduces memory use and review time on buildings with finely divided wind loads.

Governing-force publication keeps unloaded interval boundaries in each member diagram and indexes the contributing loads separately. The steel building gallery can publish the same ordinates without rescanning every unloaded interval at each cut.
