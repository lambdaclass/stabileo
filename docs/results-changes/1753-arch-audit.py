import argparse
import json
from decimal import Decimal as D, localcontext
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--area', required=True, type=D)
parser.add_argument('snapshots', nargs='+')
args = parser.parse_args()

root = Path(__file__).resolve().parents[2]
fixture = json.loads((root / "web/src/lib/templates/fixtures/three-hinge-arch.json").read_text(), parse_float=D)

with localcontext() as context:
    context.prec = 90
    nodes = {n["id"]: {key: D(value) for key, value in n.items()} for n in fixture["nodes"]}
    left, crown, right = (nodes[key] for key in (1, 5, 9))
    loads = [(nodes[load["data"]["nodeId"]], -D(load["data"]["fz"])) for load in fixture["loads"]]
    span = right["x"] - left["x"]
    height = crown["y"] - left["y"]
    total = sum(force for _, force in loads)
    vertical_right = sum(force * (node["x"] - left["x"]) for node, force in loads) / span
    vertical_left = total - vertical_right
    horizontal = (vertical_left * (crown["x"] - left["x"]) - sum(
        force * (crown["x"] - node["x"]) for node, force in loads if node["x"] < crown["x"]
    )) / height
    assert vertical_left == vertical_right
    material = fixture["materials"][0]
    ea = D(material["e"]) * D(1000) * args.area
    axial = []
    for element in fixture["elements"][:4]:
        start, end = nodes[element["nodeI"]], nodes[element["nodeJ"]]
        dx, dz = end["x"] - start["x"], end["y"] - start["y"]
        vertical = vertical_left - sum(force for node, force in loads if node["x"] <= start["x"])
        assert horizontal * dz == vertical * dx
        normal = -(horizontal * horizontal + vertical * vertical).sqrt()
        axial.append((element["nodeJ"], normal * dx / ea, normal * dz / ea))
    rotation = sum(dx for _, dx, _ in axial) / height
    exact = {1: {"ux": D(0), "uz": D(0), "ry": rotation}}
    ux, uz = D(0), D(0)
    for node_id, dx, dz in axial:
        ux += dx
        uz += dz
        node = nodes[node_id]
        exact[node_id] = {
            "ux": ux - rotation * (node["y"] - left["y"]),
            "uz": uz + rotation * (node["x"] - left["x"]),
            "ry": rotation if node_id != 5 else D(0),
        }
    for node_id in (1, 2, 3, 4):
        value = exact[node_id]
        exact[10 - node_id] = {"ux": -value["ux"], "uz": value["uz"], "ry": -value["ry"]}
    print("horizontal_thrust_kN", horizontal)
    print("vertical_reaction_kN", vertical_left)
    print("crown_uz_m", exact[5]["uz"])
    print("left_rotation_rad", rotation)
    for name in args.snapshots:
        data = json.loads(Path(name).read_text(), parse_float=D)
        values = data.get("fresh", data)["values"]
        flat = {}
        for key, value in values.items():
            if isinstance(value, dict):
                flat.update({f"{key}.{field}": number for field, number in value.items()})
            else:
                flat[key] = value
        errors = {}
        for field in ("ux", "uz", "ry"):
            errors[field] = max(abs(D(flat[f"base.displacements[n{node_id}].{field}"]) - value[field]) for node_id, value in exact.items())
        reaction_errors = []
        for node_id, sign in ((1, 1), (9, -1)):
            for field, reference in (("rx", sign * horizontal), ("rz", vertical_left), ("my", D(0))):
                reaction_errors.append(abs(D(flat[f"base.reactions[n{node_id}].{field}"]) - reference))
        print(name, "max_absolute_displacement_errors", errors)
        print(name, "max_absolute_reaction_error", max(reaction_errors))
        assert max(reaction_errors) < D("1e-9")
        assert max(errors.values()) < D("1e-9")
