### BREAKING (results)

#### Verify generated load sources before solving

Analysis stops when an individual generated load, shell pressure or self-weight source loses force or moment during solver preparation. Whole-slab definitions also refuse missing or duplicate applications to their assigned cells. (#2470)

#### Transfer connected X-brace inertia on the brace spans

The seismic planner follows each straight-through brace independently and puts the upper-story inertia on its physical span. Crossings without a unique geometric pairing still require story evidence. (#2330)

#### Transfer inertia on a gable supported at both eaves

A supported gable uses its eave story and carries distributed seismic inertia along each rafter. An independent ridge floor keeps its own story. (#2332)
