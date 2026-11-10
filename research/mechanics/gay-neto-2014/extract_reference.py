"""Rebuilds reference-results/ from the reference code's documentation.

Usage: python3 -I extract_reference.py <Giraffe Tutorials 2.0 v20.docx> <Giraffe Tutorials 2.0 v21.pdf>
The PDF step needs `pdftocairo` (poppler) on PATH.
"""
import csv, hashlib, json, os, re, subprocess, sys, tempfile, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "reference-results")
C = {"c": "http://schemas.openxmlformats.org/drawingml/2006/chart"}


def series(xml):
    root = ET.fromstring(xml)
    for ser in root.findall(".//c:ser", C):
        pts = lambda tag: [float(p.find("c:v", C).text) for p in sorted(ser.findall(f"./c:{tag}//c:pt", C), key=lambda p: int(p.get("idx")))]
        yield pts("xVal"), pts("yVal")


def tutorial16(docx):
    with zipfile.ZipFile(docx) as z:
        moment = list(series(z.read("word/charts/chart5.xml")))
        shear = list(series(z.read("word/charts/chart6.xml")))
    rows = {}
    for (xm, m), (xv, v) in zip(moment, shear):
        assert xm == xv
        for x, a, b in zip(xm, m, v):
            rows[x] = (a, b)
    with open(os.path.join(OUT, "tutorial16_step3_resultants.csv"), "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["reference_x_m", "moment_e1_Nm", "shear_e2_N"])
        for x in sorted(rows):
            w.writerow([repr(x), repr(rows[x][0]), repr(rows[x][1])])


def tutorial01(pdf):
    with tempfile.TemporaryDirectory() as tmp:
        svg = os.path.join(tmp, "p10.svg")
        subprocess.run(["pdftocairo", "-f", "10", "-l", "10", "-svg", pdf, svg], check=True)
        text = open(svg).read()
    lines = {}
    for path in re.findall(r"<path[^>]*>", text):
        stroke = re.search(r'stroke="rgb\(([^)]*)\)"', path)
        d = re.search(r' d="([^"]+)"', path).group(1)
        if stroke and d.count("L") == 10:
            pts = [tuple(map(float, p.split())) for p in re.findall(r"[ML] ([-\d.]+ [-\d.]+)", d)]
            lines[stroke.group(1)] = pts
    x = lines["0%, 0%, 0%"]
    z = next(v for k, v in lines.items() if k.startswith("75"))
    origin, unit = x[0][1], z[0][1] - x[0][1]
    with open(os.path.join(OUT, "tutorial01_tip_history.csv"), "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["time", "x_m", "z_m"])
        for k in range(11):
            w.writerow([f"{k / 10:.1f}", f"{(x[k][1] - origin) / unit:.6f}", f"{(z[k][1] - origin) / unit:.6f}"])


def manifest():
    files = sorted(f for f in os.listdir(OUT) if f != "MANIFEST.json")
    m = json.load(open(os.path.join(OUT, "MANIFEST.json")))
    m["files_sha256"] = {f: hashlib.sha256(open(os.path.join(OUT, f), "rb").read()).hexdigest() for f in files}
    json.dump(m, open(os.path.join(OUT, "MANIFEST.json"), "w"), indent=2)
    open(os.path.join(OUT, "MANIFEST.json"), "a").write("\n")


if __name__ == "__main__":
    tutorial16(sys.argv[1])
    tutorial01(sys.argv[2])
    manifest()
