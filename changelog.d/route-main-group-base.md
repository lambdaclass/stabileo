### Fixed
#### Route budgets in the merge queue compare against the group's real base (2026-11-03)

In a merge-queue group stacked on another pending group, the "Landing and app route byte budgets"
job measured its baseline on main, which lacked the group ahead. The pull requests ahead then
counted as this group's change, and a research file among them forced research isolation. The
baseline now comes from the commit the group was built on.
