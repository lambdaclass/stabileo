from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest


class PublicationTest(unittest.TestCase):
    def test_mesh_claim_names_its_refinement_interval(self):
        study = Path(__file__).resolve().parents[1]
        data = json.loads((study / "reference-results/study.json").read_text())["dynamics"]
        meshes = {(r["rate"], r["value"]): r["envelope"] for r in data["sensitivity"] if r["parameter"] == "n"}
        self.assertGreater(abs(meshes[0.1, 48] / meshes[0.1, 24] - 1), 0.03)
        for rate in (0.03, 0.1):
            self.assertLess(abs(meshes[rate, 96] / meshes[rate, 48] - 1), 0.03)
        self.assertIn("3 % for refinement from 48 to 96 elements", (study / "README.md").read_text())

    def test_transition_is_described_under_the_passing_verdict(self):
        study = Path(__file__).resolve().parents[1]
        readme = (study / "README.md").read_text().split("## What is reproduced", 1)[1]
        success, failure = readme.split("Not reproduced:", 1)
        self.assertIn("first sampled envelope rate below A = 2", success)
        self.assertNotIn("transition rate", failure.split("##", 1)[0])

    def test_only_a_verified_bundle_replaces_the_selected_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            study = root / "research/mechanics/vella-2024"
            study.mkdir(parents=True)
            shutil.copy(Path(__file__).resolve().parents[1] / "build.sh", study)
            commands = root / "commands"
            commands.mkdir()
            for name, body in {
                "wasm-pack": 'while [ "$1" != --out-dir ]; do shift; done\nmkdir -p "$2"\nfor name in snap_symmetry_vella_2024.js snap_symmetry_vella_2024_bg.wasm; do echo "$CONTENT" > "$2/$name"; done',
                "wasm-opt": 'while [ "$2" != -o ]; do shift; done\ncp "$1" "$3"',
            }.items():
                script = commands / name
                script.write_text("#!/bin/sh\nset -eu\n" + body + "\n")
                script.chmod(0o755)
            env = dict(os.environ, PATH=f"{commands}:{os.environ['PATH']}")
            manifest = root / "web/public/research-wasm/vella-2024/build.json"
            check = study / "check-wasm.mjs"

            def build(content):
                return subprocess.run(["bash", study / "build.sh"], env=dict(env, CONTENT=content), capture_output=True).returncode

            check.write_text("process.exit(0)")
            self.assertEqual(build("accepted"), 0)
            selected = manifest.read_bytes()
            check.write_text("process.exit(1)")
            self.assertNotEqual(build("rejected"), 0)
            self.assertEqual(manifest.read_bytes(), selected)
            check.write_text("import {readFileSync} from 'node:fs'; import {join} from 'node:path';"
                             "if(readFileSync(join(process.argv[2],'snap.js'),'utf8').trim() !== 'next') process.exit(1);")
            self.assertEqual(build("next"), 0)
            identity = json.loads(manifest.read_bytes())["build_id"]
            self.assertEqual(identity, hashlib.sha256(b"next\n" * 2).hexdigest())
            self.assertEqual((manifest.parent / identity / "snap.js").read_bytes(), b"next\n")


if __name__ == "__main__":
    unittest.main()
