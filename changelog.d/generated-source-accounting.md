### BREAKING (results)

#### Verify generated load sources before solving

Analysis stops when an individual generated load, shell pressure or self-weight source loses force or moment during solver preparation. (#2470)

#### Transfer connected X-brace inertia on the brace spans

The seismic planner follows each straight-through brace independently and puts the upper-story inertia on its physical span. Crossings without a unique geometric pairing still require story evidence. (#2330)
