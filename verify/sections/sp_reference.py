import json, sys, math
from shapely import Polygon
from sectionproperties.pre.geometry import Geometry
from sectionproperties.pre.pre import Material
from sectionproperties.analysis.section import Section

geoms = json.load(open(sys.argv[1]))
names = sys.argv[3:] if len(sys.argv) > 3 else list(geoms)
mat = Material("nu0", elastic_modulus=1.0, poissons_ratio=0.0, yield_strength=1.0, density=1.0, color="w")
out = {}
for name in names:
    polys = geoms[name]
    solids = [p["vertices"] for p in polys if not p["isVoid"]]
    holes = [p["vertices"] for p in polys if p["isVoid"]]
    assert len(solids) == 1
    shp = Polygon(solids[0], holes)
    g = Geometry(shp, material=mat)
    area = shp.area
    g.create_mesh(mesh_sizes=[area / float(sys.argv[2])])
    sec = Section(g)
    sec.calculate_geometric_properties()
    sec.calculate_warping_properties()
    sec.calculate_plastic_properties()
    r = dict(
        area=sec.get_ea(), j=sec.get_ej(), cw=sec.get_egamma(),
        sc_elastic=sec.get_sc(), sc_trefftz=sec.get_sc_t(),
        cg=sec.get_c(), as_=sec.get_eas(), mp=sec.get_mp(), zxx=sec.get_ez(),
    )
    out[name] = r
    print(name, json.dumps(r), flush=True)
json.dump(out, open(sys.argv[1].replace("geom.json", "sp_ref_%s.json" % sys.argv[2]), "w"))
