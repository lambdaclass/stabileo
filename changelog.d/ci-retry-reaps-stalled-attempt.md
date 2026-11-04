### Fixed
#### A stalled dependency download no longer leaves a lock that fails its retry (2026-11-04)

The CI retry wrapper used to kill an attempt after 15 minutes in total. It now does so only after 15
minutes with no output, so a slow mirror that is still downloading (Playwright's browser system
packages took over 15 minutes on hosted runners) finishes instead of being killed; an attempt is still stopped after 40 minutes in total. When an attempt
does stall, every process of the attempt is stopped. The retry also waits for the dpkg locks to clear,
because apt-get under sudo runs outside the attempt and kept holding the dpkg lock, so the retry failed
at once with "Could not get lock /var/lib/dpkg/lock-frontend". If the lock is still held after
10 minutes, the step fails without retrying.
