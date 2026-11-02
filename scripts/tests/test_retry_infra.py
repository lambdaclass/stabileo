import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
WRAPPER = ROOT / '.github/scripts/retry-infra.sh'


class RetryInfra(unittest.TestCase):
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
        ]
        genuine = [
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

    def test_previous_infra_output_does_not_trigger_retry(self):
        self.assertEqual(self.run_attempts(['HTTP error 418', 'AssertionError'])[:2], (7, 2))


if __name__ == '__main__':
    unittest.main()
