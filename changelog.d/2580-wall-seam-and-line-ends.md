### BREAKING (results)

#### Check wall crossings and redistributed member loads at their connections

Analysis refuses a wall that pierces an internal slab mesh edge without a shared connection. A conforming inclined wall can share a slab edge without triggering that refusal. The load check verifies the receiving node of each redistributed truss force and accepts balanced tendon loads alongside gravity. (#2580)
