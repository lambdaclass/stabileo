import json
import pathlib
import shutil
import subprocess
import sys
import tempfile


def gh(*args):
    return subprocess.check_output(["gh", *map(str, args)], text=True)


def publish(repo, version, commit, directory, notes):
    directory = pathlib.Path(directory)
    tag = f"desktop-v{version}"
    try:
        release = json.loads(gh("release", "view", tag, "--repo", repo, "--json", "isDraft,isPrerelease"))
    except subprocess.CalledProcessError:
        gh("release", "create", tag, "--repo", repo, "--target", commit,
           "--title", f"Stabileo desktop {version}", "--notes-file", notes,
           "--draft", "--prerelease", "--latest=false", "--verify-tag")
        release = {"isDraft": True}
    assets = sorted(p for p in directory.iterdir() if p.is_file())
    if release["isDraft"]:
        gh("release", "upload", tag, *assets, "--repo", repo, "--clobber")
        gh("release", "edit", tag, "--repo", repo, "--draft=false", "--prerelease", "--latest=false")
        return
    if not release["isPrerelease"]:
        raise ValueError("Existing release must be a prerelease")
    with tempfile.TemporaryDirectory() as temporary:
        gh("release", "download", tag, "--repo", repo, "--dir", temporary)
        published = pathlib.Path(temporary)
        if {p.name for p in published.iterdir()} != {p.name for p in assets}:
            raise ValueError("Published asset set differs; use a new version")
        for asset in assets:
            if asset.suffix != ".sig" and asset.name != "latest.json":
                if asset.read_bytes() != (published / asset.name).read_bytes():
                    raise ValueError(f"Published asset differs: {asset.name}; use a new version")
        if json.loads((published / "latest.json").read_text())["version"] != version:
            raise ValueError("Published manifest version differs")
        for asset in assets:
            if asset.suffix == ".sig" or asset.name == "latest.json":
                shutil.copyfile(published / asset.name, asset)


if __name__ == "__main__":
    publish(*sys.argv[1:])
