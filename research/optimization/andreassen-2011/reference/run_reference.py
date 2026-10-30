import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
import urllib.request

URL = 'https://www.topopt.mek.dtu.dk/-/media/subsites/topopt/apps/dokumenter-og-filer-til-apps/top88.m'
ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    octave = shutil.which('octave')
    if not octave:
        raise SystemExit('GNU Octave is required; use nix shell --inputs-from . nixpkgs#octave')
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=pathlib.Path, help='Already downloaded source; the same SHA check applies')
    args = parser.parse_args()
    source = args.source.read_bytes() if args.source else subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', URL], timeout=60)
    digest = hashlib.sha256(source).hexdigest()
    expected = (ROOT / 'reference/source.sha256').read_text().strip()
    if digest != expected:
        raise SystemExit(f'Upstream source changed: {digest}; inspect before running')
    out = ROOT / 'reference-results'
    out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='top88-') as scratch:
        work = pathlib.Path(scratch)
        (work / 'top88.m').write_bytes(source)
        for name in ['colormap', 'caxis', 'axis', 'drawnow']:
            (work / f'{name}.m').write_text(f'function {name}(varargin)\nend\n')
        (work / 'imagesc.m').write_text('''function imagesc(varargin)
  global output_file;
  row.iteration = evalin('caller', 'loop');
  row.compliance = evalin('caller', 'c');
  row.volume = evalin('caller', 'mean(xPhys(:))');
  row.change = evalin('caller', 'change');
  row.density = evalin('caller', 'xPhys(:)');
  fid = fopen(output_file, 'a');
  fprintf(fid, '%s\\n', jsonencode(row));
  fclose(fid);
end
''')
        for ft in [1, 2]:
            target = work / f'ft{ft}.jsonl'
            command = f"global output_file; output_file='{target}'; top88(60,20,0.5,3,2.4,{ft});"
            subprocess.run([octave, '--no-gui', '--quiet', '--eval', command], cwd=work, check=True, timeout=600)
            rows = [json.loads(line) for line in target.read_text().splitlines()]
            (out / f'ft{ft}.json').write_text(json.dumps(rows, separators=(',', ':')) + '\n')
    files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('ft*.json')}
    manifest = dict(source_url=URL, source_sha256=digest, source_unmodified=True,
                    capture='Plot functions replaced by observers; numerical top88.m bytes unchanged',
                    version=subprocess.check_output([octave, '--version'], text=True).splitlines()[0],
                    settings=dict(nelx=60, nely=20, volfrac=0.5, penal=3, rmin=2.4, ft=[1, 2]),
                    files_sha256=files)
    (out / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
