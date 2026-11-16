from decimal import Decimal as D
import json
from pathlib import Path
import runpy
import sys

reference = runpy.run_path(str(Path(__file__).with_name('candidate-1901-reference.py')))['reference']
original = json.loads(Path('engine/tests/fixtures/candidate-replay.json').read_text(), parse_float=D)['1901-body-0']
control = reference(100, iteration_tolerance=D('1e-45'))['pdelta']
assert control['converged']
balanced = control['displacements']
audit = reference(100, original, balanced)
assert D(audit['relativeResidual']) < D('1e-12'), audit
for altered in [
    [{**d, **{field: '0' for field in ['ux', 'uz', 'ry']}} for d in balanced],
    [{**d, **{field: str(-D(d[field])) for field in ['ux', 'uz', 'ry']}} for d in balanced],
]:
    assert D(reference(100, original, altered)['relativeResidual']) > D('1e-12')
cases = json.loads(Path(sys.argv[1]).read_text(), parse_float=D)
assert set(cases) == {'original', 'rotated', 'XZ', 'XY', 'YZ'}
for name, case in sorted(cases.items()):
    result = case['result']
    assert result['converged'] is False and result['isStable'] is False
    assert result['iterations'] == 100
    displacements = result['results']['displacements']
    if name in ['original', 'rotated']:
        model = case['input']
    else:
        model = original
        axes = {
            'XZ': [('ux', 1), ('uz', 1), ('ry', -1)],
            'XY': [('ux', 1), ('uy', 1), ('rz', 1)],
            'YZ': [('uy', 1), ('uz', 1), ('rx', 1)],
        }[name]
        displacements = [{'nodeId': d['nodeId'], **{key: sign * D(d[field]) for key, (field, sign) in zip(['ux', 'uz', 'ry'], axes)}} for d in displacements]
    audit = reference(100, model, displacements)
    assert D(audit['relativeResidual']) > D('1e-12'), (name, audit)
    assert D(audit['relativeDisplacementError']) > D('1e-8'), (name, audit)
    print(name, json.dumps(audit, sort_keys=True))
