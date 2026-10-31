"""Independent SciPy checks of every force reference and the stated axial error budget.

Run with: python -m unittest discover -s engine/tests/research_references -p test_elastica.py
Only NumPy and SciPy are needed; the higher-precision elliptic generator also needs mpmath.
"""
import json
from pathlib import Path
import unittest
import numpy as np
from elastica import extensible


class ElasticaEvidence(unittest.TestCase):
    def test_shared_references_and_residual_extension_budget(self):
        data = json.loads((Path(__file__).parents[1] / 'benchmarks/mattiasson_elastica.json').read_text())
        for case in data['cases']:
            if case['kind'] != 'force' or case['reference'] is None:
                continue
            with self.subTest(q=case['parameter']):
                reference = np.array(case['reference'])
                limit = extensible(case['parameter'], np.inf, 1e-11)
                self.assertLess(np.max(np.abs(limit - reference)), 1e-11)
                finite = extensible(case['parameter'], 1., 1e-11)
                self.assertLess(np.max(np.abs(finite / reference - 1)), data['axialExtensionBound'])
                self.assertLess(np.max(np.abs(finite - extensible(case['parameter'], 1., 1e-10))), 1e-11)


if __name__ == '__main__':
    unittest.main()
