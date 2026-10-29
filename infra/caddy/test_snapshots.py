import http.client
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class SnapshotHosting(unittest.TestCase):
    def test_snapshot_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for path, body in {
                'live/frontends/app/index.html': 'live',
                'snapshots/abcdef0/index.html': 'frozen',
                'snapshots/abcdef0/assets/app.js': 'frozen asset',
                'snapshots/1111111/secret.txt': 'other snapshot',
                'snapshots/index.json': '{"snapshots": []}',
                'secret.txt': 'outside snapshots',
            }.items():
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(body)
            port = free_port()
            env = {**os.environ, 'APP_DOMAIN': f'http://127.0.0.1:{port}',
                   'ADMIN_DOMAIN': f'http://127.0.0.1:{free_port()}',
                   'STABILEO_ROOT': tmp, 'ROBOTS_TAG': 'all',
                   'XDG_DATA_HOME': tmp, 'XDG_CONFIG_HOME': tmp}
            config = root / 'Caddyfile'
            config.write_text(Path(__file__).with_name('Caddyfile').read_text().replace('{\n', '{\n\tadmin off\n', 1))
            with (root / 'caddy.log').open('w+') as log:
                server = subprocess.Popen(['caddy', 'run', '--config', str(config), '--adapter', 'caddyfile'], env=env, stdout=log, stderr=log)
                try:
                    for _ in range(100):
                        try:
                            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                                break
                        except OSError:
                            if server.poll() is not None:
                                log.seek(0)
                                self.fail(log.read())
                            time.sleep(.05)

                    def get(path):
                        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                        conn.request('GET', path)
                        response = conn.getresponse()
                        result = response.status, dict(response.getheaders()), response.read().decode()
                        conn.close()
                        return result

                    for path, body in [('/@abcdef0/', 'frozen'), ('/@abcdef0/research/example/', 'frozen'),
                                       ('/@abcdef0/assets/app.js', 'frozen asset')]:
                        status, headers, actual = get(path)
                        self.assertEqual((status, actual), (200, body), path)
                        self.assertEqual(headers['Cache-Control'], 'public, max-age=31536000, immutable')
                        self.assertEqual(headers['X-Robots-Tag'], 'noindex')
                    for path in ['/@abcdef0/missing.js', '/@2222222/', '/@ABCDEF0/', '/@abcdef/',
                                 '/@abcdef00/', '/@' + 'a' * 40 + '/',
                                 '/@abcdef0/../1111111/secret.txt', '/@abcdef0/%2e%2e/1111111/secret.txt',
                                 '/@abcdef0/%2e%2e%2f1111111/secret.txt', '/@abcdef0/../../secret.txt']:
                        status, headers, body = get(path)
                        self.assertEqual(status, 404, (path, status, body))
                        self.assertNotIn('immutable', headers.get('Cache-Control', ''))
                    self.assertEqual(get('/@/')[1]['Cache-Control'], 'no-cache')
                finally:
                    server.terminate()
                    server.wait(timeout=10)


if __name__ == '__main__':
    unittest.main()
