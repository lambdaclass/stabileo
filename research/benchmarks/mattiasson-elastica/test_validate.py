import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mattiasson', Path(__file__).with_name('validate.py'))
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class PublishedTable(unittest.TestCase):
    @unittest.skip("known wrong result: #2505")
    def test_generation_requires_ten_distinct_load_parameters(self):
        original = model.load
        table = original(model.TABLE)
        for rows in [[], table['rows'][:-1], table['rows'][:-1] + table['rows'][:1]]:
            with self.subTest(count=len(rows)), patch.object(model, 'load', side_effect=lambda p: {**table, 'rows': rows} if p == model.TABLE else original(p)):
                with self.assertRaises(ValueError):
                    model.evidence(native, mesh)


if __name__ == '__main__':
    native, mesh = map(model.load, sys.argv[1:])
    unittest.main(argv=sys.argv[:1])
