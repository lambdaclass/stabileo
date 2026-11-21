### Performance
#### Clear plate meshes faster and share the 2D co-rotational driver

Clearing a plate mesh takes less work, including when rebuilding slab meshes. The 2D co-rotational analysis uses a shared nonlinear driver and retains its existing Newton and modified Newton results (#2394).
