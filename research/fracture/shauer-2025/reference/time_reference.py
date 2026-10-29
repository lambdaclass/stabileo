import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '61037c6ce7833a4f92a3ec098a9d60fd477eff2b'
HASHES = {
    'ex1': '545a06c6779c6c842d8560b1ecb797bceacd949060516a508f0938ac7789d3d9',
    'ex2': '5e6c2659540f25105e25e0ad1c48644bec4a752fbdea12709480da511bd72be4',
    'ex3': '13a002a3fcd1ed23ed0dad2cb7705fce834aa1e5c14fb33886836141d1c9f171',
}


def cpu_model():
    cpuinfo = Path('/proc/cpuinfo')
    if cpuinfo.exists():
        match = re.search(r'^model name\s*:\s*(.+)$', cpuinfo.read_text(), re.M)
        if match:
            return match[1]
    if platform.system() == 'Darwin':
        return subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True).strip()
    return platform.processor() or platform.machine()


def verify_counts(case, native, directory):
    manifest = json.loads((ROOT / 'reference-results/MANIFEST.json').read_text())
    mesh = json.loads((ROOT / f'reference-results/{case}_mesh.json').read_text())
    files = list((directory / 'outputs').glob('*.vtk'))
    if len(files) != manifest['runs'][case]['steps'] or native['steps'] != len(files):
        raise ValueError(f'{case}: Python/Rust/reference step counts differ')
    for file in files:
        text = file.read_text()
        for label, key in [('POINTS', 'nodes'), ('CELLS', 'elements')]:
            match = re.search(rf'^{label} (\d+) ', text, re.M)
            if not match or int(match[1]) != mesh[key] or native[key] != mesh[key]:
                raise ValueError(f'{case}: Python/Rust/reference mesh counts differ')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runner-label', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'VALIDATION.json')
    args = parser.parse_args()
    subprocess.run(['cargo', 'build', '--release', '--locked', '--bin', 'timing'], cwd=ROOT, check=True)
    metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--no-deps', '--format-version', '1'], cwd=ROOT))
    binary = Path(metadata['target_directory']) / 'release/timing'
    cases = {}
    env = dict(os.environ, MPLBACKEND='Agg', OPENBLAS_NUM_THREADS='1', OMP_NUM_THREADS='1', MKL_NUM_THREADS='1')
    with tempfile.TemporaryDirectory(prefix='phasefield-timing-') as tmp:
        for case, digest in HASHES.items():
            directory = Path(tmp) / case
            directory.mkdir()
            script = directory / f'example{case[-1]}_sparse.py'
            url = f'https://raw.githubusercontent.com/nathanshauer/phasefield-jr-py/{COMMIT}/{script.name}'
            data = urllib.request.urlopen(url, timeout=60).read()
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError(f'{case}: upstream script checksum mismatch')
            script.write_bytes(data)
            with (directory / 'python.log').open('w') as log:
                start = time.perf_counter()
                subprocess.run([sys.executable, str(script)], cwd=directory, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
                python_seconds = time.perf_counter() - start
            log_text = (directory / 'python.log').read_text()
            start = time.perf_counter()
            native = json.loads(subprocess.check_output([str(binary), case], cwd=directory, env=env))
            rust_seconds = time.perf_counter() - start
            verify_counts(case, native, directory)
            if log_text.count('converged in') != native['steps']:
                raise ValueError(f'{case}: Python did not converge at every step')
            cases[case] = dict(native, python_seconds=python_seconds, rust_native_seconds=rust_seconds)
            print(case, cases[case], flush=True)
    record = json.loads((ROOT / 'VALIDATION.json').read_text())
    record['timing'] = {
        'machine': {'runner_label': args.runner_label, 'cpu_model': cpu_model(), 'cores': os.cpu_count()},
        'date': datetime.date.today().isoformat(),
        'python_seconds': sum(c['python_seconds'] for c in cases.values()),
        'rust_native_seconds': sum(c['rust_native_seconds'] for c in cases.values()),
        'cases': cases,
        'scope': 'Single process wall time per case, including startup and model construction; unmodified Python includes VTK/plots, Rust solves without field export. Compilation and downloads excluded. BLAS/OMP threads=1.',
        'reference_includes_output': True,
        'reference_commit': COMMIT,
        'python': platform.python_version(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2) + '\n')


if __name__ == '__main__':
    main()
