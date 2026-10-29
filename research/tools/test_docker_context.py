from pathlib import Path
import unittest


class ContextTests(unittest.TestCase):
    def test_recursive_secret_and_dependency_exclusions(self):
        patterns = (Path(__file__).resolve().parents[2] / '.dockerignore').read_text().splitlines()
        for required in ['**/.env', '**/.env.*', '**/node_modules/']:
            self.assertIn(required, patterns)
        self.assertNotIn('!.env.prod', patterns)
        self.assertNotIn('!**/.env.prod', patterns)


if __name__ == '__main__':
    unittest.main()
