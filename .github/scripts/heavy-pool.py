"""Picks where a heavy dispatched job runs (opensees-diff in nightly.yml, the replay jobs).

POOL is the dispatch input: stabileo-heavy (stabileo-ci-1's sgha7-8, never the merge queue's engine
runners), nightly (the nightly pool from NIGHT_START_HOUR to NIGHT_END_HOUR UTC, GitHub the rest of
the day) or ubuntu-24.04. A scheduled run always takes the nightly pool. stabileo-heavy takes a
dispatch only outside the nightly window; inside it the job takes the nightly pool instead.
"""
import json
import os
import sys
import time

HOSTED = 'ubuntu-24.04'
NIGHTLY = ['self-hosted', 'stabileo-nightly']
HEAVY = ['self-hosted', 'stabileo-heavy']
POOLS = ('stabileo-heavy', 'nightly', HOSTED)


def in_window(hour, start, end):
    return start <= hour < end if start <= end else hour >= start or hour < end


def choose(event, pool, ref, self_hosted, hour, start=0, end=7):
    pool = pool or ('nightly' if event == 'schedule' else 'stabileo-heavy')
    if pool not in POOLS:
        raise ValueError(f'unknown pool {pool!r} (known: {", ".join(POOLS)})')
    if not (self_hosted and ref == 'refs/heads/main' and event in ('schedule', 'workflow_dispatch')):
        return HOSTED, 'GitHub-hosted: self-hosted runners take only scheduled runs and dispatches on main'
    window = in_window(hour, start, end)
    if event == 'schedule' or pool == 'nightly':
        if event == 'schedule' or window:
            return NIGHTLY, 'the nightly pool'
        return HOSTED, f'GitHub-hosted: the nightly pool takes dispatches only from {start:02d}:00 to {end:02d}:00 UTC'
    if pool == HOSTED:
        return HOSTED, 'GitHub-hosted, as asked'
    if window:
        return NIGHTLY, f'the nightly pool: stabileo-heavy takes dispatches only outside {start:02d}:00-{end:02d}:00 UTC'
    return HEAVY, 'stabileo-ci-1 (stabileo-heavy: sgha7-8)'


def main():
    env = os.environ
    hour = time.gmtime(int(env.get('NOW') or time.time())).tm_hour
    try:
        runs_on, why = choose(env.get('EVENT', ''), env.get('POOL', ''), env.get('REF', ''),
                              env.get('SELF_HOSTED') == 'true', hour,
                              int(env.get('NIGHT_START_HOUR', '0')), int(env.get('NIGHT_END_HOUR', '7')))
    except ValueError as error:
        print(f'::error::{error}')
        return 1
    print(f'::notice title=Heavy jobs::{why}')
    with open(env['GITHUB_OUTPUT'], 'a') as out:
        print(f'runs_on={json.dumps(runs_on)}', file=out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
