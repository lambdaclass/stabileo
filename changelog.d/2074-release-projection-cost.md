### Performance

#### Keep released-rotation constraint projection sparse

- Project released directions through only their affected constraint columns, retaining the same compatibility requirements and uncertainty bounds (#2074).
- Compare inverse-transformed and unscaled released-member responses with their baseline, excluding only gauge rotations.
- Check every native and WASM member length against model geometry before using it in physical response comparisons.
