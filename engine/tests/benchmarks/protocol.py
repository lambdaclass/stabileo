"""Test-only benchmark protocol. No engine imports or third-party Python dependencies."""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def require(ok, message):
    if not ok:
        raise ValueError(message)


def validate_schema(value, schema, path='$'):
    """Validate the deliberately small JSON Schema vocabulary used by schema.json.

    Unknown assertion keywords fail closed, so extending the schema requires
    extending this validator (or switching to a complete JSON Schema library).
    """
    known = {'$schema', '$id', 'title', 'type', 'properties', 'required',
             'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength',
             'minimum', 'maximum', 'exclusiveMinimum', 'enum'}
    require(not set(schema)-known, f'{path}: unsupported schema keyword')
    t = schema.get('type')
    types = {'object':dict, 'array':list, 'string':str, 'boolean':bool,
             'integer':int, 'number':(int,float)}
    if t:
        require(isinstance(value, types[t]) and not (t in ('integer','number') and isinstance(value,bool)), f'{path}: expected {t}')
    if 'enum' in schema:
        require(value in schema['enum'], f'{path}: invalid enum')
    if t == 'object':
        require(set(schema['required']) <= value.keys(), f'{path}: missing required field')
        properties = schema['properties']
        if not schema.get('additionalProperties',True):
            require(not value.keys()-properties.keys(), f'{path}: unknown field')
        for k,v in value.items():
            if k in properties: validate_schema(v,properties[k],path+'.'+k)
    if t == 'array':
        require(len(value)>=schema.get('minItems',0), f'{path}: too few items')
        require(len(value)<=schema.get('maxItems',float('inf')), f'{path}: too many items')
        for i,v in enumerate(value):validate_schema(v,schema['items'],f'{path}[{i}]')
    if t == 'string':require(len(value.strip())>=schema.get('minLength',0), f'{path}: empty string')
    if t in ('number','integer'):
        require(math.isfinite(value), f'{path}: nonfinite')
        require(value>=schema.get('minimum',-float('inf')), f'{path}: below minimum')
        require(value<=schema.get('maximum',float('inf')), f'{path}: above maximum')
        require(value>schema.get('exclusiveMinimum',-float('inf')), f'{path}: below exclusive minimum')


def lint(s):
    for field in ('id', 'geometry', 'material', 'section', 'supports', 'symmetry_planes',
                  'loads', 'measurement', 'references', 'mesh_sequence', 'tolerance', 'expected_rigid_modes'):
        require(field in s, f'missing {field}')
    require(len(s['references']) >= 2, 'two references required')
    require(s['tolerance']['justification'].strip(), 'tolerance justification required')
    require(0 < s['tolerance']['relative'] <= 0.02, 'invalid tolerance')
    refs = s['references']
    require(len({r['independence'] for r in refs}) >= 2, 'references must be independent')
    for r in refs:
        require(r['kind'] in ('paper', 'exact', 'textbook', 'independent-solver'), 'invalid reference kind')
        require(r['citation'].strip() and r['location'].strip(), 'citation and page/table/equation required')
        require(not (r['provisional'] and r['pass_fail']), 'provisional reference used as pass/fail')
        require(math.isfinite(r['value']) and math.isfinite(r['precision']) and r['precision'] > 0, 'invalid reference number')
    admitted = [r for r in refs if r['pass_fail']]
    require(len(admitted) >= 2, 'two non-provisional pass/fail references required')
    require(len({r['independence'] for r in admitted}) >= 2, 'pass/fail references must be independent')
    require(max(r['value']-r['precision'] for r in admitted) <= min(r['value']+r['precision'] for r in admitted),
            'two-reference agreement: model or reference suspect')
    meshes = s['mesh_sequence']
    require(len(meshes) >= 3 and all(isinstance(n, int) and n > 0 for n in meshes), 'three positive meshes required')
    require(all(b == 2*a for a, b in zip(meshes, meshes[1:])), 'Richardson requires uniform doubling')
    require(s['measurement']['sign'] in (-1, 1), 'signed measurement required')
    require(s['geometry']['element'] == s['measurement']['reference_model'], 'element/reference model mismatch')
    validate_schema(s, json.loads((ROOT/'spec'/'schema.json').read_text()))
    if s['analysis']=='corotational': require('solver' in s, 'nonlinear solver controls required')
    g = s['geometry']
    require((g['kind']=='polyline') == (g['element'] in ('frame','truss')), 'geometry/element mismatch')
    required_geometry = ('points',) if g['kind']=='polyline' else ('radius','half_length','angle')
    require(all(k in g for k in required_geometry), 'missing geometry parameters')
    if g['kind'] == 'polyline':
        # A constant Y offset is a rigid translation of the supported XZ plane.
        require(all(p[1] == g['points'][0][1] for p in g['points']),
                'out-of-plane polyline geometry cannot be represented in 2D')
        require(s['loads']['force'][1] == 0 and s['loads']['analytic_total'][1] == 0,
                'out-of-plane load cannot be represented in 2D')
    required_section = ('a','iz') if g['kind']=='polyline' else ('thickness',)
    require(all(k in s['section'] for k in required_section), 'missing section parameters')
    return s


def generate(s, n, full=False, mutant=None):
    lint(s)
    require(mutant in (None, '', 'crown_pin', 'missing_corner_symmetry'), 'unknown negative variant')
    require(isinstance(n,int) and n > 0, 'positive mesh required')
    g = s['geometry']
    model = dict(nodes={}, elements={}, quads={}, sections={}, materials={'1':dict(id=1, **s['material'])}, supports={}, loads=[])
    def node(x, y, z):
        k = len(model['nodes']) + 1
        model['nodes'][str(k)] = dict(id=k, x=x, y=y, z=z)
        return k
    def load(k, f):
        model['loads'].append(dict(type='nodal', data=dict(nodeId=k, fx=f[0], fy=f[1], fz=f[2], mx=0., my=0., mz=0.)))
    if g['kind'] == 'polyline':
        points = g['points']
        ids = []
        for a, b in zip(points, points[1:]):
            for i in range(n):
                ids.append(node(*[a[k]+(b[k]-a[k])*i/n for k in range(3)]))
        ids.append(node(*points[-1]))
        for i in range(len(ids)-1):
            model['elements'][str(i+1)] = dict(id=i+1, type=g['element'], nodeI=ids[i], nodeJ=ids[i+1], materialId=1, sectionId=1, hingeStart=False, hingeEnd=False)
        model['sections']['1'] = dict(id=1, **s['section'])
        for rule in s['supports']:
            k = ids[rule['vertex']*n]
            model['supports'][str(k)] = dict(id=k, nodeId=k, type=rule['type'])
        target = ids[s['measurement']['vertex']*n]
        load(ids[s['loads']['vertex']*n], s['loads']['force'])
        total = s['loads']['analytic_total']
        for p in model['nodes'].values():
            p.pop('y')
        for l in model['loads']:
            for key in ('fy','mx','mz'):l['data'].pop(key)
        dimension = 2
    else:
        roof = g['kind'] == 'roof'
        nx, nt = (2*n, (2 if roof else 4)*n) if full else (n, n)
        length, radius, angle = g['half_length'], g['radius'], g['angle']
        grid = []
        for i in range(nx+1):
            row = []
            # Closed cylinder seam shares nodes; no duplicated disconnected edge.
            for j in range(nt+1 if roof or not full else nt):
                x = -length+i*length/n if full else i*length/n
                theta = -angle+j*angle/n if full and roof else j*angle/n
                y, z = (radius*math.sin(theta), radius*(math.cos(theta)-1)) if roof else (radius*math.cos(theta), radius*math.sin(theta))
                row.append(node(x, y, z))
            if full and not roof:
                row.append(row[0])
            grid.append(row)
        for i in range(nx):
            for j in range(nt):
                k = len(model['quads'])+1
                model['quads'][str(k)] = dict(id=k, nodes=[grid[i][j],grid[i+1][j],grid[i+1][j+1],grid[i][j+1]], materialId=1, thickness=s['section']['thickness'])
        keys = ['rx','ry','rz','rrx','rry','rrz']
        for i, row in enumerate(grid):
            for j, k in enumerate(row):
                fixed = set()
                for rule in s['supports'] + ([] if full else s['symmetry_planes']):
                    edge = rule['edge']
                    match = {'x_end':i == nx or (full and i == 0), 'x_zero':i == 0,
                             'theta_zero':j == 0, 'theta_end':j == nt}[edge]
                    if match:
                        if mutant == 'missing_corner_symmetry' and fixed:
                            continue
                        fixed.update(rule['dofs'])
                # One axial translation gauge on the midspan symmetry plane.
                if full and i == n and j == 0:
                    fixed.add('rx')
                if mutant == 'crown_pin' and i == 0 and j == 0:
                    fixed.add('rz')
                if fixed:
                    model['supports'][str(k)] = dict(nodeId=k, **{key:key in fixed for key in keys})
        target = grid[n if full else 0][nt if roof else 0]
        if roof:
            q = s['loads']['surface_traction']
            for i, row in enumerate(grid):
                for j, k in enumerate(row):
                    weight = (0.5 if i in (0,nx) else 1)*(0.5 if j in (0,nt) else 1)
                    load(k, [0,0,q*length/n*radius*angle/n*weight])
            total = [0,0,s['loads']['analytic_total'][2]*(4 if full else 1)]
        else:
            force = s['loads']['force'][1]
            load(target, [0,force*(4 if full else 1),0])
            if full:
                load(grid[n][2*n], [0,-force*4,0])
            total = [0,0,0] if full else s['loads']['analytic_total']
        dimension = 3
    envelope = dict(model=model, target=target, dimension=dimension, analytic_total=total, spec=s, full=full, mesh=n)
    return envelope


def rank(rows, width):
    rows = [list(r) for r in rows]
    pivot = 0
    for col in range(width):
        best = max(range(pivot,len(rows)), key=lambda i:abs(rows[i][col]), default=None)
        if best is None or abs(rows[best][col]) < 1e-9:
            continue
        rows[pivot], rows[best] = rows[best], rows[pivot]
        scale = rows[pivot][col]
        rows[pivot] = [v/scale for v in rows[pivot]]
        for i in range(len(rows)):
            if i != pivot:
                c = rows[i][col]
                rows[i] = [a-c*b for a,b in zip(rows[i],rows[pivot])]
        pivot += 1
    return pivot


def expected_supports(e):
    s, g = e['spec'], e['spec']['geometry']
    expected = {}
    def near(a, b):
        return math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12)
    for key, p in e['model']['nodes'].items():
        if g['kind'] == 'polyline':
            for rule in s['supports']:
                vertex = g['points'][rule['vertex']]
                if near(p['x'], vertex[0]) and near(p['z'], vertex[2]):
                    expected[key] = dict(id=p['id'], nodeId=p['id'], type=rule['type'])
            continue
        full = e['full']
        roof = g['kind'] == 'roof'
        theta = math.atan2(p['y'], p['z']+g['radius']) if roof else math.atan2(p['z'], p['y'])
        edges = {
            'x_end': near(abs(p['x']) if full else p['x'], g['half_length']),
            'x_zero': near(p['x'], -g['half_length'] if full else 0.),
            'theta_zero': near(theta, -g['angle'] if full and roof else 0.),
            'theta_end': near(theta, g['angle'] if not full or roof else 0.),
        }
        fixed = {dof for rule in s['supports'] + ([] if full else s['symmetry_planes'])
                 if edges[rule['edge']] for dof in rule['dofs']}
        if full and near(p['x'], 0.) and edges['theta_zero']:
            fixed.add('rx')
        if fixed:
            expected[key] = dict(nodeId=p['id'], **{d:d in fixed for d in ('rx','ry','rz','rrx','rry','rrz')})
    return expected


def precheck(e):
    m, s = e['model'], e['spec']
    force = [sum(l['data'].get(k,0.) for l in m['loads']) for k in ('fx','fy','fz')]
    require(all(abs(a-b) <= 1e-10*max(1,abs(b)) for a,b in zip(force,e['analytic_total'])), 'analytic total applied load mismatch')
    rows = []
    for support in m['supports'].values():
        p = m['nodes'][str(support['nodeId'])]
        x,y,z = (p.get(k,0.) for k in ('x','y','z'))
        if e['dimension'] == 2:
            basis = [[1,0,z],[0,1,-x],[0,0,1]]
            fixed = [True,True,support['type']=='fixed']
        else:
            basis = [[1,0,0,0,z,-y],[0,1,0,-z,0,x],[0,0,1,y,-x,0],[0,0,0,1,0,0],[0,0,0,0,1,0],[0,0,0,0,0,1]]
            fixed = [support[k] for k in ('rx','ry','rz','rrx','rry','rrz')]
        rows.extend(row for row,f in zip(basis,fixed) if f)
    modes = (3 if e['dimension']==2 else 6)-rank(rows,3 if e['dimension']==2 else 6)
    require(modes == s['expected_rigid_modes'], f'rigid-body modes: expected {s["expected_rigid_modes"]}, got {modes}')
    # Equilibrium and rigid-motion rank cannot detect an extra constraint.
    expected = expected_supports(e)
    require(m['supports'] == expected, 'support/reaction contract mismatch (extra or missing restraint)')


def check_result(e, result):
    precheck(e)
    m = e['model']
    reaction = [0.,0.,0.]
    keys = ('rx','unused','rz') if e['dimension']==2 else ('fx','fy','fz')
    for r in result['reactions']:
        reaction = [a+r.get(k,0) for a,k in zip(reaction,keys)]
    scale = max(1,sum(abs(l['data'].get(k,0.)) for l in m['loads'] for k in ('fx','fy','fz')))
    require(all(abs(a+b) <= 1e-8*scale for a,b in zip(reaction,e['analytic_total'])), 'reactions do not balance loads')
    # Moment equilibrium uses current positions for geometrically nonlinear frames.
    displacements = {d['nodeId']: d for d in result['displacements']}
    # These benchmarks prescribe exactly zero at restrained DOFs. The solver
    # assembles them as zero, and reports zero reaction on free components.
    if e['dimension'] == 2:
        reaction_keys, displacement_keys = ('rx','rz','my'), ('ux','uz','ry')
    else:
        reaction_keys = ('fx','fy','fz','mx','my','mz')
        displacement_keys = ('ux','uy','uz','rx','ry','rz')
    restraints = {}
    for support in m['supports'].values():
        fixed = ([True, True, support['type']=='fixed'] if e['dimension']==2 else
                 [support[k] for k in ('rx','ry','rz','rrx','rry','rrz')])
        restraints[support['nodeId']] = fixed
        d = displacements.get(support['nodeId'])
        require(d is not None, 'missing restrained displacement')
        for k, constrained in zip(displacement_keys, fixed):
            if constrained:
                require(d.get(k) == 0., f'nonzero or missing prescribed displacement: {k}')
    for r in result['reactions']:
        require(r['nodeId'] in restraints, 'reaction at unsupported node')
        for k, constrained in zip(reaction_keys, restraints[r['nodeId']]):
            require(math.isfinite(r.get(k, 0.)), 'nonfinite reaction')
            if not constrained:
                require(r.get(k, 0.) == 0., f'reaction on unrestrained DOF: {k}')
    def position(node_id):
        p = m['nodes'][str(node_id)]
        d = displacements[node_id]
        return [p.get(k,0.)+(d.get('u'+k,0.) if e['spec']['analysis']=='corotational' else 0.) for k in ('x','y','z')]
    def cross(p,f):
        return [p[1]*f[2]-p[2]*f[1],p[2]*f[0]-p[0]*f[2],p[0]*f[1]-p[1]*f[0]]
    moments = [0.,0.,0.]
    for l in m['loads']:
        d=l['data']; torque=cross(position(d['nodeId']),[d.get(k,0.) for k in ('fx','fy','fz')])
        for i,k in enumerate(('mx','my','mz')):
            moments[i] += torque[i] + d.get(k,0.)*(-1 if e['dimension']==2 and i==1 else 1)
    for r in result['reactions']:
        torque=cross(position(r['nodeId']),[r.get(k,0.) for k in keys])
        for i,k in enumerate(('mx','my','mz')):
            moments[i] += torque[i] + r.get(k,0.)*(-1 if e['dimension']==2 and i==1 else 1)
    extent=max(1.,max(abs(c) for p in m['nodes'].values() for c in (p.get('x',0.),p.get('y',0.),p.get('z',0.))))
    require(all(abs(v)<=1e-8*scale*extent for v in moments), f'reaction moments do not balance loads: {moments}')
    d = next(d for d in result['displacements'] if d['nodeId']==e['target'])
    measurement = e['spec']['measurement']
    value = d[measurement['component']]*measurement['sign']/measurement['normalization']
    require(math.isfinite(value), 'nonfinite measured response')
    return value


def discrete_reference(s, value):
    require(math.isfinite(value), 'nonfinite measured response')
    admitted = [r for r in s['references'] if r['pass_fail'] and not r['provisional']]
    require(admitted, 'no admitted references')
    for r in admitted:
        require(abs(value-r['value']) <= s['tolerance']['relative']*abs(r['value']),
                'model or reference suspect: discrete response misses reference')


def convergence(s, values):
    require(s.get('reference_scope') != 'two-elements-only', 'model or reference suspect: discrete reference cannot gate continuum refinement')
    require(len(values)==len(s['mesh_sequence']) and all(math.isfinite(v) for v in values), 'invalid convergence samples')
    admitted = [r for r in s['references'] if r['pass_fail'] and not r['provisional']]
    require(admitted, 'no admitted references')
    reference_errors = [[abs(v-r['value']) for v in values] for r in admitted]
    for r, errors in zip(admitted, reference_errors):
        require(all(b < a for a,b in zip(errors, errors[1:])), 'model or reference suspect: plateau or growing error')
        require(errors[-1] <= s['tolerance']['relative']*abs(r['value']), 'model or reference suspect: finest mesh misses reference')
    # Report the worst absolute error at each mesh, independently of reference order.
    errors = [max(sample) for sample in zip(*reference_errors)]
    differences = [b-a for a,b in zip(values, values[1:])]
    require(all(((a > 0 and b > 0) or (a < 0 and b < 0)) and abs(b) < abs(a)
                for a,b in zip(differences, differences[1:])),
            'model or reference suspect: non-asymptotic sequence')
    a,b,c = values[-3:]
    ratio = (a-b)/(b-c) if b != c else 0
    require(ratio > 1 and math.isfinite(ratio), 'model or reference suspect: non-asymptotic sequence')
    extrapolated = c+(c-b)/(ratio-1)
    for r in admitted:
        require(abs(extrapolated-r['value']) <= s['tolerance']['relative']*abs(r['value']), 'model or reference suspect: extrapolation misses reference')
    return dict(values=values, errors=errors, order=math.log2(ratio), extrapolated=extrapolated)


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'generate':
        s = json.loads((ROOT/'spec'/sys.argv[2]).read_text())
        e = generate(s,int(sys.argv[3]),sys.argv[4]=='full',sys.argv[5] if len(sys.argv)>5 else None)
        # Negative fixtures deliberately bypass precheck here; tests assert its rejection.
        print(json.dumps(e))
    elif action == 'precheck':
        precheck(json.load(sys.stdin))
        print('null')
    elif action == 'check':
        payload = json.load(sys.stdin)
        print(json.dumps(check_result(payload['envelope'],payload['result'])))
    elif action == 'discrete':
        p = json.load(sys.stdin)
        print(json.dumps(discrete_reference(p['spec'],p['value'])))
    elif action == 'convergence':
        p = json.load(sys.stdin)
        print(json.dumps(convergence(p['spec'],p['values'])))
    elif action == 'lint':
        for path in sorted((ROOT/'spec').glob('*.json')):
            if path.name != 'schema.json':
                lint(json.loads(path.read_text()))
                print(path.name)
