import importlib.util
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
WRAPPER = ROOT / '.github/scripts/retry-infra.sh'


def nix_jobs(workflow):
    text = (ROOT / '.github/workflows' / workflow).read_text().split('\njobs:\n', 1)[1]
    parts = re.split(r'\n  ([a-z0-9_-]+):\n', '\n' + text)
    for name, body in zip(parts[1::2], parts[2::2]):
        commands = [line.split('run:', 1)[1].strip() for line in body.splitlines() if re.match(r'\s+(- )?run: ', line)]
        commands += [line.strip() for line in body.splitlines() if re.match(r'\s+(nix develop|make) ', line)]
        if any(re.match(r'(\.github/scripts/retry-infra\.sh )?(nix develop|make) ', c) for c in commands):
            yield name, body


class RetryInfra(unittest.TestCase):
    def test_every_job_fetching_a_nix_shell_retries_infrastructure_failures_first(self):
        for workflow in ['ci.yml', 'research.yml', 'verify.yml']:
            for name, body in nix_jobs(workflow):
                first = {}
                for use in re.finditer(r'(retry-infra\.sh )?(?:nix develop(?: \.{1,2}#([\w-]+))?|(?<!-c )(?<!--command )\bmake) ', body):
                    first.setdefault(use.group(2) or 'default', bool(use.group(1)))
                for shell, wrapped in first.items():
                    with self.subTest(workflow=workflow, job=name, shell=shell):
                        self.assertTrue(wrapped)

    def test_real_log_patterns(self):
        infrastructure = [
            'FlakeHub: cache initialized failed: Unauthenticated',
            'GitHub Actions Cache throttled Magic Nix Cache',
            "error: unable to download 'https://cache.nixos.org/example.narinfo': HTTP error 418",
            'error: downloading nar: Connection reset by peer',
            'Failed to restore: actions/cache: 429 Too Many Requests',
            'gh: HTTP 429: Too Many Requests',
            'Error [ERR_SOCKET_CLOSED_BEFORE_CONNECTION]: Socket closed before the connection was established',
            '##[error]Unable to authenticate to FlakeHub. Individuals must register at FlakeHub.com; Organizations must create an organization at FlakeHub.com.',
            'GitHub API error: Twirp error: twirp error: TwirpErrorResponse { code: ResourceExhausted, msg: "rate limit exceeded", meta: {} }',
            "error: unable to download 'https://cache.nixos.org/0123.narinfo': Error in the HTTP2 framing layer (16) ",
            "error: unable to download 'https://cache.nixos.org/nar/0123.nar.xz': Failed sending data to the peer (55) Send failure: Broken pipe",
            "error: unable to download 'https://cache.nixos.org/0123.narinfo': Failed sending data to the peer (55) OpenSSL SSL_read: SSL_ERROR_SYSCALL, errno 0",
            "error: some substitutes for the outputs of derivation '/nix/store/0123-postgresql-18.3.drv' failed (usually happens due to networking issues); try '--fallback' to build derivation from source",
            'HTTP 403: You have exceeded a secondary rate limit and have been temporarily blocked from content creation.',
            "error: unable to download 'https://cache.nixos.org/nar/0123.nar.xz': HTTP error 416",
            '##[warning]Failed to restore: Failed to GetCacheEntryDownloadURL: Rate limited: Failed request: (429) Too Many Requests: rate limit exceeded',
            'Attempt 1 of 5 failed with error: Failed request: (429) Too Many Requests: rate limit exceeded. Retrying request in 3000 ms...',
            "error: unable to download 'http://127.0.0.1:37515/0123.narinfo': HTTP error 418",
            "error: unable to download 'https://cache.nixos.org/nar/0123.nar.xz': Error in the HTTP2 framing layer (16) Send failure: Connection reset by peer",
            'error downloading wasm: HTTP 503: 503 Egress is over the account limit. (https://productionresultssa9.blob.core.windows.net/actions-results/d0f12eed/workflow-job-run-92e98ce9/artifacts/abc.zip)',
            'error downloading research-wasm: HTTP 502: Bad Gateway (https://productionresultssa9.blob.core.windows.net/x.zip)',
            'curl: (22) The requested URL returned error: 504',
        ]
        genuine = [
            'curl: (22) The requested URL returned error: 404',
            'error downloading wasm: HTTP 404: Not Found (https://api.github.com/repos/lambdaclass/stabileo/actions/artifacts/1/zip)',
            'AssertionError: expected HTTP 503 to equal 200',
            'error[E0308]: mismatched types',
            'error: could not compile `dedaliano-engine` (lib) due to 1 previous error',
            'AssertionError: expected 418 to equal 200',
            'Error: Test timeout of 30000ms exceeded.',
            'The job running on runner has exceeded the maximum execution time of 30 minutes.',
            'npm error code ERESOLVE',
            'error: hash mismatch in fixed-output derivation',
            'Artifact named wasm not found',
            'HTTP 403: Resource not accessible by integration',
            'test result: FAILED. 429 passed; 1 failed;',
            "warning: unable to download 'https://cache.nixos.org/0123.narinfo': Error in the HTTP2 framing layer (16) ; retrying in 280 ms (attempt 1/5)",
            "warning: unable to download 'https://cache.nixos.org/0123.narinfo': Failed sending data to the peer (55) Send failure: Broken pipe; retrying in 301 ms (attempt 1/5)",
            "error: builder for '/nix/store/0123-stabileo-engine.drv' failed with exit code 101",
            "error: Cannot build '/nix/store/0123-stabileo.drv'.",
            'AssertionError: expected status 416 to equal 200',
            "error: path '/nix/store/0123-libgpg-error-1.55' is required, but there is no substituter that can build it",
            "error: some references of path '/nix/store/0123-postgresql-18.3-dev' could not be realised",
        ]
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'log'
            for line in infrastructure + genuine:
                with self.subTest(line=line):
                    log.write_text(line + '\n')
                    result = subprocess.run([str(WRAPPER), '--matches', str(log)])
                    self.assertEqual(result.returncode, 0 if line in infrastructure else 1)

    def run_attempts(self, lines, status=7):
        with tempfile.TemporaryDirectory() as directory:
            count = Path(directory) / 'count'
            command = Path(directory) / 'command.py'
            command.write_text('''import pathlib, sys
p = pathlib.Path(sys.argv[1])
n = int(p.read_text()) if p.exists() else 0
p.write_text(str(n + 1))
lines = ''' + repr(lines) + '''
print(lines[min(n, len(lines)-1)])
sys.exit(0 if lines[min(n, len(lines)-1)] == 'success' else ''' + str(status) + ')\n')
            result = subprocess.run([str(WRAPPER), 'python3', str(command), str(count)],
                                    env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0'},
                                    capture_output=True, text=True)
            return result.returncode, int(count.read_text()), result.stdout

    def test_exhaustion_preserves_status_and_logs(self):
        status, count, output = self.run_attempts(['Connection reset by peer'])
        self.assertEqual((status, count), (7, 3))
        self.assertEqual(output.count('Connection reset by peer'), 3)

    def test_each_attempt_logs_its_output_once(self):
        script = WRAPPER.read_text()
        attempt = script.split('for attempt in 1 2 3; do', 1)[1]
        self.assertLess(attempt.index(': > "$log"'), attempt.index('>> "$log" 2>&1 &'))
        self.assertNotRegex(script, r'[^>]> "\$log" 2>&1 &')
        for _ in range(5):
            output = self.run_attempts(['Connection reset by peer', 'HTTP error 418', 'success'])[2]
            self.assertEqual([output.count(x) for x in ('Connection reset by peer', 'HTTP error 418', 'success')], [1, 1, 1])

    def test_success_stops_retries(self):
        self.assertEqual(self.run_attempts(['HTTP error 418', 'success'])[:2], (0, 2))

    def test_genuine_failure_stops_immediately(self):
        self.assertEqual(self.run_attempts(['error[E0308]: mismatched types'])[:2], (7, 1))

    def test_recovered_download_warning_does_not_retry_a_genuine_failure(self):
        lines = ["warning: unable to download 'https://cache.nixos.org/0123.narinfo': Error in the HTTP2 framing layer (16) ; retrying in 280 ms (attempt 1/5)\nerror: hash mismatch in fixed-output derivation"]
        self.assertEqual(self.run_attempts(lines)[:2], (7, 1))

    def test_unrealisable_path_after_a_genuine_build_failure_does_not_retry(self):
        lines = ["error: builder for '/nix/store/0123-stabileo-engine.drv' failed with exit code 101\nerror: some references of path '/nix/store/0123-stabileo-engine' could not be realised"]
        self.assertEqual(self.run_attempts(lines)[:2], (7, 1))

    def test_unrealisable_path_after_a_cache_transport_failure_retries(self):
        lines = ["error: unable to download 'https://cache.nixos.org/nar/0123.nar.xz': HTTP error 416\nerror: some references of path '/nix/store/0123-postgresql-18.3-dev' could not be realised", 'success']
        self.assertEqual(self.run_attempts(lines)[:2], (0, 2))

    def test_stalled_download_is_killed_and_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            count = Path(directory) / 'count'
            command = Path(directory) / 'command.py'
            command.write_text('''import pathlib, sys, time
p = pathlib.Path(sys.argv[1])
n = int(p.read_text()) if p.exists() else 0
p.write_text(str(n + 1))
print('Downloaded web-sys v0.3.106', flush=True)
if n == 0:
    time.sleep(60)
''')
            started = time.monotonic()
            result = subprocess.run([str(WRAPPER), 'python3', str(command), str(count)],
                                    env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0', 'RETRY_INFRA_TIMEOUT_SECONDS': '2'},
                                    capture_output=True, text=True)
            self.assertLess(time.monotonic() - started, 30)
            self.assertEqual((result.returncode, int(count.read_text())), (0, 2))
            self.assertIn('Download stalled for 2s', result.stderr)

    def test_a_daemon_holding_the_output_does_not_block_the_step(self):
        started = time.monotonic()
        result = subprocess.run([str(WRAPPER), 'bash', '-c', 'setsid sleep 30 & echo fetched'],
                                capture_output=True, text=True, timeout=60)
        self.assertLess(time.monotonic() - started, 15)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, 'fetched\n')

    def test_every_attempt_stalling_fails_with_the_timeout_status(self):
        result = subprocess.run([str(WRAPPER), 'sleep', '60'],
                                env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0', 'RETRY_INFRA_TIMEOUT_SECONDS': '1'},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 124)
        self.assertEqual(result.stderr.count('Download stalled for 1s'), 3)

    def test_a_command_killed_without_the_watchdog_is_not_retried(self):
        for status in (124, 137):
            with tempfile.TemporaryDirectory() as directory:
                count = Path(directory) / 'count'
                result = subprocess.run([str(WRAPPER), 'bash', '-c', f'echo x >> {count}; exit {status}'],
                                        env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0'},
                                        capture_output=True, text=True)
                self.assertEqual((result.returncode, count.read_text().count('x')), (status, 1))
                self.assertNotIn('Download stalled', result.stderr)

    def stalled_then(self, first, second, extra_env=None):
        with tempfile.TemporaryDirectory() as directory:
            count = Path(directory) / 'count'
            lock = Path(directory) / 'lock'
            command = Path(directory) / 'command.sh'
            command.write_text(f"""n=$(cat {count} 2>/dev/null || echo 0); echo $((n + 1)) > {count}
if [ "$n" = 0 ]; then {first}; else {second}; fi
""".replace('LOCK', str(lock)))
            started = time.monotonic()
            result = subprocess.run([str(WRAPPER), 'bash', str(command)],
                                    env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0', 'RETRY_INFRA_TIMEOUT_SECONDS': '2',
                                         'RETRY_INFRA_LOCKS': str(lock), **(extra_env or {})},
                                    capture_output=True, text=True, timeout=120)
            return result, int(count.read_text()), time.monotonic() - started

    def test_a_stalled_attempt_leaves_no_child_holding_a_lock_for_the_retry(self):
        result, count, _ = self.stalled_then('flock LOCK sleep 300 & echo started; sleep 300',
                                             'flock -n LOCK echo retried')
        self.assertEqual((result.returncode, count), (0, 2), result.stderr)
        self.assertIn('retried', result.stdout)

    def test_the_retry_waits_for_a_lock_held_outside_the_attempt_session(self):
        with tempfile.TemporaryDirectory() as directory:
            count, lock, release, log = (Path(directory) / name for name in ('count', 'lock', 'release', 'stderr'))
            command = Path(directory) / 'command.sh'
            command.write_text(f"""n=$(cat {count} 2>/dev/null || echo 0); echo $((n + 1)) > {count}
if [ "$n" = 0 ]; then setsid flock {lock} timeout 120 sh -c 'until [ -e {release} ]; do sleep 0.1; done' & echo started; sleep 300
else flock -n {lock} echo retried; fi
""")
            with open(log, 'w') as stderr:
                wrapper = subprocess.Popen([str(WRAPPER), 'bash', str(command)], stdout=subprocess.PIPE, stderr=stderr, text=True,
                                           env={**os.environ, 'RETRY_INFRA_DELAY_SECONDS': '0', 'RETRY_INFRA_TIMEOUT_SECONDS': '2',
                                                'RETRY_INFRA_LOCKS': str(lock)})
                try:
                    deadline = time.monotonic() + 90
                    while 'Waiting for the previous attempt to release its lock' not in log.read_text():
                        self.assertIsNone(wrapper.poll(), log.read_text())
                        self.assertLess(time.monotonic(), deadline, log.read_text())
                        time.sleep(0.2)
                    held_until = time.monotonic() + 3
                    while time.monotonic() < held_until:
                        self.assertEqual(count.read_text().strip(), '1', 'the retry started while the lock was held')
                        self.assertIsNone(wrapper.poll(), log.read_text())
                        time.sleep(0.1)
                    release.touch()
                    stdout, _ = wrapper.communicate(timeout=90)
                finally:
                    release.touch()
                    if wrapper.poll() is None:
                        wrapper.kill()
            self.assertEqual((wrapper.returncode, count.read_text().strip()), (0, '2'), log.read_text())
            self.assertIn('retried', stdout)

    def test_a_slow_command_that_keeps_printing_is_not_killed(self):
        result, count, _ = self.stalled_then('for i in 1 2 3 4 5 6; do echo "Get:$i"; sleep 1; done', 'exit 9')
        self.assertEqual((result.returncode, count), (0, 1), result.stderr)
        self.assertNotIn('stalled', result.stderr)

    def test_a_lock_that_outlives_the_wait_stops_the_retries(self):
        result, count, _ = self.stalled_then('setsid flock LOCK sleep 30 & echo started; sleep 300', 'echo retried',
                                             {'RETRY_INFRA_LOCK_SECONDS': '2'})
        self.assertEqual((result.returncode, count), (124, 1), result.stderr)
        self.assertIn('lock is still held; not retrying', result.stderr)

    def test_an_attempt_printing_forever_is_stopped_by_the_wall_limit(self):
        result, count, elapsed = self.stalled_then('while :; do echo "Connection reset by peer"; sleep 1; done', 'echo retried',
                                                   {'RETRY_INFRA_WALL_SECONDS': '3'})
        self.assertEqual((result.returncode, count), (0, 2), result.stderr)
        self.assertIn('Attempt still running after 3s', result.stderr)
        self.assertLess(elapsed, 60)

    def test_an_attempt_that_cannot_be_signalled_stops_the_retries_in_bounded_time(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'pkill').write_text('#!/bin/sh\nexit 0\n')
            Path(directory, 'pkill').chmod(0o755)
            pause = f'sleep 299.{os.getpid()}'
            try:
                result, count, elapsed = self.stalled_then(pause, 'echo retried',
                                                           {'PATH': f"{directory}:{os.environ['PATH']}"})
            finally:
                subprocess.run(['pkill', '-x', '-f', pause])
            self.assertEqual((result.returncode, count), (124, 1), result.stderr)
            self.assertIn('could not be stopped; not retrying', result.stderr)
            self.assertLess(elapsed, 90)

    def test_previous_infra_output_does_not_trigger_retry(self):
        self.assertEqual(self.run_attempts(['HTTP error 418', 'AssertionError'])[:2], (7, 2))


class BrowserDepsOutage(unittest.TestCase):
    def module(self):
        spec = importlib.util.spec_from_file_location('browser_deps', ROOT / '.github/scripts/browser-deps.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    @unittest.skip("known wrong result: #1945")
    def test_package_plan_can_use_a_standalone_playwright_install(self):
        from unittest.mock import patch
        module = self.module()
        def run(command, **kwargs):
            self.assertEqual(kwargs['cwd'], '/runner/pw')
            raise subprocess.CalledProcessError(1, command)
        with patch.object(module.subprocess, 'run', side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                module.package_plan(['chromium'], '/runner/pw')

    def test_apt_transport_errors_are_infrastructure(self):
        for line in ("Temporary failure resolving 'azure.archive.ubuntu.com'", 'E: Failed to fetch http://archive.ubuntu.com/ubuntu/a.deb'):
            with self.subTest(line=line), tempfile.TemporaryDirectory() as directory:
                log = Path(directory) / 'log'
                log.write_text(line)
                self.assertEqual(subprocess.run([str(WRAPPER), '--matches', str(log)]).returncode, 0)

    def test_genuine_apt_package_errors_are_not_infrastructure(self):
        for line in ('E: Unable to locate package libmissing', 'E: Unmet dependencies. Try apt --fix-broken install.'):
            with self.subTest(line=line), tempfile.TemporaryDirectory() as directory:
                log = Path(directory) / 'log'
                log.write_text(line)
                self.assertEqual(subprocess.run([str(WRAPPER), '--matches', str(log)]).returncode, 1)

    def test_action_uses_the_package_plan_for_cache_keys_and_installation(self):
        text = (ROOT / '.github/actions/browser-deps/action.yml').read_text()
        self.assertNotIn('package-lock.json', text)
        self.assertIn('browser-deps.py key', text)
        self.assertIn('.github/scripts/retry-infra.sh nix develop --command python3 .github/scripts/browser-deps.py install', text)

    def test_package_plan_is_normalized_and_unrecognized_output_is_refused(self):
        module = self.module()
        self.assertEqual(module.packages(['libb', 'liba', 'libb']), ['liba', 'libb'])
        for plan in ('', [], ['-y'], ['liba; echo bad'], ['liba', 1], {'liba': True}):
            with self.subTest(plan=plan), self.assertRaises(ValueError):
                module.packages(plan)

    def test_package_plan_captures_requested_packages_without_running_apt(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            npx = Path(directory) / 'npx'
            npx.write_text('#!/bin/sh\napt-get install -s --no-install-recommends libb liba libb\n')
            npx.chmod(0o755)
            from unittest.mock import patch
            with patch.dict(os.environ, {'PATH': directory + os.pathsep + os.environ['PATH']}):
                self.assertEqual(module.package_plan(['chromium']), ['liba', 'libb'])
            npx.write_text('#!/bin/sh\napt-get update\n')
            with patch.dict(os.environ, {'PATH': directory + os.pathsep + os.environ['PATH']}):
                with self.assertRaises(subprocess.CalledProcessError):
                    module.package_plan(['chromium'])

    def test_keys_follow_packages_for_every_browser_combination(self):
        from itertools import combinations
        from unittest.mock import patch
        module = self.module()
        keys = []
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'output'
            for count in (1, 2, 3):
                for browsers in combinations(('chromium', 'firefox', 'webkit'), count):
                    def plan(requested):
                        self.assertEqual(requested, list(browsers))
                        return ['liba', 'libb']
                    with patch.object(module, 'package_plan', side_effect=plan), patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'amd64\n')), patch.dict(os.environ, {'GITHUB_OUTPUT': str(output), 'ImageOS': 'ubuntu24', 'ImageVersion': 'fixture'}), patch('sys.argv', ['browser-deps.py', 'key', *browsers]):
                        module.main()
                    keys.append(output.read_text().splitlines()[-1])
            self.assertEqual(len(set(keys)), 1)
            with patch.object(module, 'package_plan', return_value=['libc']), patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'amd64\n')), patch.dict(os.environ, {'GITHUB_OUTPUT': str(output), 'ImageOS': 'ubuntu24', 'ImageVersion': 'fixture'}), patch('sys.argv', ['browser-deps.py', 'key', 'chromium']):
                module.main()
            self.assertNotEqual(output.read_text().splitlines()[-1], keys[0])

    def test_fallback_splits_security_suites_and_preserves_signatures(self):
        module = self.module()
        original = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
        fallback = module.rewrite_sources(original, '.sources')
        self.assertIn('URIs: http://archive.ubuntu.com/ubuntu', fallback)
        self.assertIn('URIs: http://security.ubuntu.com/ubuntu', fallback)
        self.assertIn('Suites: noble noble-updates', fallback)
        self.assertIn('Suites: noble-security', fallback)
        self.assertEqual(fallback.count('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg'), 2)
        for suites, host in (('noble', 'archive'), ('noble-security', 'security')):
            single = original.replace('noble noble-updates noble-security', suites)
            self.assertIn(f'URIs: http://{host}.ubuntu.com/ubuntu', module.rewrite_sources(single, '.sources'))
        with self.assertRaises(ValueError):
            module.rewrite_sources('URIs: http://azure.archive.ubuntu.com/ubuntu', '.sources')
        legacy = 'deb [signed-by=/key] http://azure.archive.ubuntu.com/ubuntu noble-security main\n'
        self.assertEqual(module.rewrite_sources(legacy, '.list'), legacy.replace('azure.archive', 'security'))
        other = 'deb https://packages.example.com/ubuntu noble main\n'
        self.assertEqual(module.rewrite_sources(other, '.list'), other)

    def test_warm_install_uses_local_debs_without_update_or_dns(self):
        from unittest.mock import patch
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            deb = Path(directory) / 'liba.deb'
            deb.touch()
            with patch.object(module.subprocess, 'run') as run, patch.object(module.socket, 'getaddrinfo', side_effect=AssertionError('DNS on warm run')):
                run.return_value.returncode = 0
                module.install(['liba'], Path(directory))
                self.assertEqual(run.call_count, 1)
                command = run.call_args.args[0]
                self.assertIn('--no-download', command)
                self.assertIn(str(deb), command)
                self.assertIn('liba', command)
                self.assertNotIn('update', command)

    def test_cold_install_falls_back_only_for_unresolvable_azure(self):
        from unittest.mock import patch
        import socket
        module = self.module()
        for resolves in (True, False):
            with self.subTest(resolves=resolves), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'sources.list.d').mkdir()
                source = root / 'sources.list.d/ubuntu.sources'
                original = 'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-security\nComponents: main\n'
                source.write_text(original)
                calls = []
                def run(command, **kwargs):
                    calls.append(command)
                    if 'update' in command:
                        option = next(x for x in command if x.startswith('Dir::Etc::sourceparts='))
                        scoped = Path(option.split('=', 1)[1]) / 'ubuntu.sources'
                        self.assertEqual('azure.archive' in scoped.read_text(), resolves)
                    return subprocess.CompletedProcess(command, 1 if '--no-download' in command else 0)
                with patch.object(module.subprocess, 'run', side_effect=run), patch.object(module.socket, 'getaddrinfo', side_effect=None if resolves else socket.gaierror()):
                    module.install(['liba'], root / 'debs', root)
                self.assertEqual(len(calls), 3)
                self.assertEqual(source.read_text(), original)
                self.assertIn('APT::Update::Error-Mode=any', calls[1])

    def test_failed_update_never_continues_to_install(self):
        from unittest.mock import patch
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'sources.list.d').mkdir()
            def run(command, **kwargs):
                if kwargs.get('check'):
                    raise subprocess.CalledProcessError(100, command)
                return subprocess.CompletedProcess(command, 1)
            with patch.object(module.subprocess, 'run', side_effect=run) as mocked:
                with self.assertRaises(subprocess.CalledProcessError):
                    module.install(['liba'], root / 'debs', root)
                self.assertEqual(mocked.call_count, 2)


class BrowserDeps(unittest.TestCase):
    @unittest.skip("known wrong result: #1945")
    def test_all_workflows_share_browser_system_dependency_installation(self):
        for workflow in sorted((ROOT / '.github/workflows').glob('*.yml')):
            with self.subTest(workflow=workflow.name):
                text = workflow.read_text()
                self.assertNotIn('install-deps', text)
                self.assertNotIn('--with-deps', text)
        deploy = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertRegex(deploy, r'uses: \./\.github/actions/browser-deps\n\s+with:\n\s+browsers: chromium\n')
        ci = (ROOT / '.github/workflows/ci.yml').read_text()
        for job, browsers in (('determinism', 'chromium firefox webkit'), ('e2e', 'chromium')):
            with self.subTest(job=job):
                body = re.search(r'\n  ' + job + r':\n(.*?)(?=\n  [a-z0-9_-]+:|\Z)', ci, re.S).group(1)
                self.assertRegex(body, r'uses: \./\.github/actions/browser-deps\n\s+with:\n\s+browsers: ' + browsers + r'\n')

    def test_every_browser_package_install_goes_through_the_cached_action(self):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertNotIn('install-deps', text)
        self.assertGreaterEqual(text.count('uses: ./.github/actions/browser-deps'), 6)
        for browsers in re.findall(r'uses: \./\.github/actions/browser-deps\n\s+with:\n\s+browsers: (.+)', text):
            self.assertRegex(browsers, r'^[a-z]+( [a-z]+)*$')

    def test_apt_keeps_its_downloads_in_the_cache_and_waits_for_the_lock(self):
        text = (ROOT / '.github/actions/browser-deps/action.yml').read_text()
        steps = dict(part.split('\n', 1) for part in text.split('\n    - name: ')[1:])
        installer = (ROOT / '.github/scripts/browser-deps.py').read_text()
        for setting in ('Dir::Cache::Archives', 'APT::Keep-Downloaded-Packages=true', 'DPkg::Lock::Timeout'):
            self.assertIn(setting, installer)
        self.assertNotIn('/etc/apt/apt.conf.d/', text)
        keys = [re.search(r'key: (.+)', steps[name]).group(1) for name in ('Restore downloaded packages', 'Save downloaded packages')]
        self.assertEqual(keys[0], keys[1])
        self.assertIn("if: steps.restore.outputs.cache-hit != 'true'", steps['Save downloaded packages'])
        install = re.search(r'run: (.+)', steps['Install browser system dependencies']).group(1)
        install = install.replace('$BROWSERS', 'chromium firefox webkit')
        self.assertTrue(install.startswith('.github/scripts/retry-infra.sh '))
        spec = importlib.util.spec_from_file_location('infra_retry', ROOT / '.github/scripts/infra-retry.py')
        infra = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(infra)
        self.assertTrue(infra.acquisition({'title': install, 'script': [install]}))


if __name__ == '__main__':
    unittest.main()
