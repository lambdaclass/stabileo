import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dns', Path(__file__).with_name('snapshot_dns.py'))
dns = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dns)


class DnsTests(unittest.TestCase):
    def test_unresolved_host_fails_clearly(self):
        with patch.object(dns.socket, 'getaddrinfo', side_effect=socket.gaierror('absent')):
            with self.assertRaisesRegex(RuntimeError, 'snapshots.stabileo.com.*A/AAAA or CNAME'):
                dns.require_dns('snapshots.stabileo.com')

    def test_resolved_host(self):
        with patch.object(dns.socket, 'getaddrinfo', return_value=[('address',)]):
            dns.require_dns('snapshots.staging.stabileo.com')


if __name__ == '__main__':
    unittest.main()
