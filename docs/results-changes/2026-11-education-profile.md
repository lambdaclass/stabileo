# Exercise stiffness and guided supports

The exercise solver formerly assigned the default section to every member, including exercises that named another catalogue profile for their stress questions. The exercise model and the workspace builder now use the authored profile. This can change displacements, internal forces in redundant structures, and marks based on those quantities. The regression compares cantilever tip displacement with the elastic cantilever formula using the named section geometry.

The common planar stability check now includes a guided support’s reaction couple. The vertical guide restrains horizontal translation and rotation. A guide and a complementary roller can therefore form a stable support system. Automatic exercise questions include the restrained components.
