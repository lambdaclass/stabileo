import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_models as G  # noqa: E402


class SupportsTest(unittest.TestCase):
    def check(self, make, dim):
        settled = 0
        for seed in range(400):
            sups = make(seed)["supports"]
            self.assertEqual(sorted(sups, key=int), [str(i) for i in range(1, len(sups) + 1)], seed)
            nodes = [s["nodeId"] for s in sups.values()]
            self.assertEqual(len(nodes), len(set(nodes)), seed)
            if dim == 2:
                for key, s in sups.items():
                    self.assertEqual(s["id"], int(key), seed)
            settled += any(k in s for s in sups.values() for k in ("dx", "dy", "dz", "drx", "dry", "drz"))
        self.assertGreater(settled, 20)

    def test_rich_2d_supports_keep_their_keys(self):
        self.check(G._rich_2d, 2)

    def test_rich_3d_supports_keep_their_keys(self):
        self.check(G._rich_3d, 3)


if __name__ == "__main__":
    unittest.main()
