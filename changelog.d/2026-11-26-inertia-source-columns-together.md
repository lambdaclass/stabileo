### Changed
#### The count that certifies the modes takes a supernode's columns together (2026-11-26)

The factorization that counts the eigenvalues under a frequency, to certify that no mode was
skipped, subtracted each contributing column from the working column by itself. Consecutive
columns of one supernode lie on the same rows and are now subtracted four or two at a time in
one pass, each entry taking the same subtractions in the same order, so the pivots and the
count are the same. In the browser, with the other open speed-ups, six modes of a slab of
223,000 degrees of freedom take 33 s where they took 40 s, and of 396,000, 83 s where they
took 122 s.
