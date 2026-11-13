import json,sys
from pathlib import Path
from fractions import Fraction
import mpmath as mp

def rank(a,zero):
    a=[list(r) for r in a]
    piv=[]
    for j in range(len(a[0])):
        p=max(range(len(piv),len(a)),key=lambda i:abs(a[i][j]),default=None)
        if p is None or zero(a[p][j]):continue
        i=len(piv);a[i],a[p]=a[p],a[i];v=a[i][j];a[i]=[x/v for x in a[i]]
        for k in range(len(a)):
            if k!=i:
                v=a[k][j];a[k]=[x-v*y for x,y in zip(a[k],a[i])]
        piv.append(j)
    free=[j for j in range(len(a[0])) if j not in piv]
    null=[]
    for j in free:
        v=[0]*len(a[0]);v[j]=1
        for i,k in enumerate(piv):v[k]=-a[i][j]
        null.append(v)
    return len(piv),null

def exact_planar(s):
    ids=sorted(n['id'] for n in s['nodes'].values());index={n:3*i for i,n in enumerate(ids)};size=3*len(ids)
    nodes={n['id']:n for n in s['nodes'].values()};rows=[]
    f=lambda x:Fraction(float(x))
    def row(ni,nj,values):
        v=[Fraction(0)]*size
        for node,part in [(ni,values[:3]),(nj,values[3:])]:
            for j,x in enumerate(part):v[index[node]+j]+=x
        return v
    for e in s['elements'].values():
        a,b=[nodes[e[k]] for k in ['nodeI','nodeJ']];dx=f(b['x'])-f(a['x']);dz=f(b['z'])-f(a['z']);l2=dx*dx+dz*dz
        rows.append(row(a['id'],b['id'],[-dx,-dz,0,dx,dz,0]))
        if e['type']=='frame':
            for end,released in enumerate([e['hingeStart'],e['hingeEnd']]):
                if not released:
                    v=[-dz,dx,0,dz,-dx,0];v[3*end+2]=l2;rows.append(row(a['id'],b['id'],v))
    for sup in s['supports'].values():
        assert not sup.get('angle')
        for j in {'fixed':[0,1,2],'pinned':[0,1],'rollerX':[1],'rollerZ':[0],'guidedZ':[0,2]}[sup['type']]:
            v=[Fraction(0)]*size;v[index[sup['nodeId']]+j]=1;rows.append(v)
    for con in s.get('constraints',[]):
        assert con['type']=='linearMPC';v=[Fraction(0)]*size
        for t in con['terms']:v[index[t['nodeId']]+t['dof']]+=f(t['coefficient'])
        rows.append(v)
    r,null=rank(rows,lambda x:x==0)
    return {'rank':r,'nullity':size-r,'null_directions':[[[ids[i//3],i%3,str(x)] for i,x in enumerate(v) if x] for v in null]}

def check(s,precision):
    mp.mp.dps=precision
    spatial=any('y' in n and 'z' in n for n in s['nodes'].values());d=6 if spatial else 3
    assert not s.get('leftHand')
    assert all(not e.get('rollAngle') for e in s['elements'].values())
    cv=lambda x:mp.mpf(float(x))
    ids=sorted(n['id'] for n in s['nodes'].values());index={n:d*i for i,n in enumerate(ids)};N=len(ids)*d
    nodes={n['id']:n for n in s['nodes'].values()}
    rows=[];K=mp.zeros(N);local_axes={}
    def row(terms):
        v=[mp.mpf(0)]*N
        for node,offset,vec in terms:
            for k,x in enumerate(vec):v[index[node]+offset+k]+=x
        return v
    def add(v,w,k):
        for i,x in enumerate(v):
            if x:
                for j,y in enumerate(w):
                    if y:K[i,j]+=k*x*y
    def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    def norm(v):return mp.sqrt(sum(x*x for x in v))
    for e in s['elements'].values():
        ni,nj=e['nodeI'],e['nodeJ'];keys=['x','y','z'] if spatial else ['x','z']
        delta=[cv(nodes[nj][k])-cv(nodes[ni][k]) for k in keys];L=norm(delta);ex=[x/L for x in delta]
        sec=s['sections'][str(e['sectionId'])];mat=s['materials'][str(e['materialId'])];E=cv(mat['e'])*1000
        axial=row([(ni,0,[-x for x in ex]),(nj,0,ex)]);rows.append(axial);add(axial,axial,E*cv(sec['a'])/L)
        if e['type']=='truss':continue
        if spatial:
            if e.get('localYx') is not None:
                y0=[cv(e[k]) for k in ['localYx','localYy','localYz']];pr=sum(x*y for x,y in zip(ex,y0));ey=[y-pr*x for x,y in zip(ex,y0)];ey=[x/norm(ey) for x in ey]
            else:
                up=[1,0,0] if abs(ex[2])>mp.mpf('0.999') else [0,0,1];pr=sum(x*y for x,y in zip(ex,up));ez=[y-pr*x for x,y in zip(ex,up)];ez=[x/norm(ez) for x in ez];ey=cross(ez,ex)
            ez=cross(ex,ey);local_axes[e['id']]=[ex,ey,ez]
            tors=row([(ni,3,[-x for x in ex]),(nj,3,ex)])
            if not (e.get('releaseTStart') or e.get('releaseTEnd')):
                rows.append(tors);add(tors,tors,E/(2*(1+cv(mat['nu'])))*cv(sec['j'])/L)
            blocks=[(ey,ez,1,sec['iz'],e.get('releaseMzStart'),e.get('releaseMzEnd')),(ez,ey,-1,sec['iy'],e.get('releaseMyStart'),e.get('releaseMyEnd'))]
        else:blocks=[([-ex[1],ex[0]],[1],1,sec['iz'],e.get('hingeStart'),e.get('hingeEnd'))]
        for transverse,axis,sign,I,ri,rj in blocks:
            ends=[]
            for node in [ni,nj]:
                ends.append(row([(ni,0,[sign*x/L for x in transverse]),(nj,0,[-sign*x/L for x in transverse]),(node,3 if spatial else 2,axis)]))
            active=[i for i,r in enumerate([ri,rj]) if not r]
            for i in active:rows.append(ends[i])
            for i in active:
                for j in active:add(ends[i],ends[j],E*cv(I)/L*(3 if len(active)==1 else 4 if i==j else 2))
    restraints=[]
    for sup in s['supports'].values():
        if spatial:
            for k,flag in enumerate(['rx','ry','rz','rrx','rry','rrz']):
                if sup.get(flag):
                    r=[mp.mpf(0)]*N;r[index[sup['nodeId']]+k]=1;restraints.append(r)
        else:
            fixed={'fixed':[0,1,2],'pinned':[0,1],'rollerX':[1],'rollerZ':[0],'guidedZ':[0,2]}[sup['type']]
            assert not sup.get('angle')
            for k in fixed:
                r=[mp.mpf(0)]*N;r[index[sup['nodeId']]+k]=1;restraints.append(r)
    for con in s.get('constraints',[]):
        assert con['type']=='linearMPC';r=[mp.mpf(0)]*N
        for t in con['terms']:r[index[t['nodeId']]+t['dof']]+=cv(t['coefficient'])
        restraints.append(r)
    zero=lambda x:abs(x)<mp.mpf(10)**(-precision+20)
    rk,null=rank(rows+restraints,zero)
    rc,basis=rank(restraints,zero)
    B=mp.matrix(N,len(basis))
    for j,b in enumerate(basis):
        for i,x in enumerate(b):B[i,j]=x
    kr=B.T*K*B
    ev=mp.eigsy(kr,eigvals_only=True) if basis else []
    return {'exact_planar':exact_planar(s) if not spatial else None,'precision':precision,'dofs':N,'strain_and_restraint_rank':rk,'nullity':N-rk,'restraint_rank':rc,'null_directions':[[[ids[i//d],i%d,str(x)] for i,x in enumerate(v) if not zero(x)] for v in null], 'reduced_eigenvalues':[mp.nstr(x,20) for x in ev] if all(not sec.get('asY') and not sec.get('asZ') for sec in s['sections'].values()) else None}

if __name__=='__main__':
    out={}
    if sys.argv[1:]:
        cases={arg:json.loads(Path(arg).read_text()) for arg in sys.argv[1:]}
    else:
        fixture=Path(__file__).resolve().parents[3]/'engine/tests/fixtures/nightly-2026-11-13.json'
        models=json.loads(fixture.read_text())
        cases={key:models[key] for key in ['2011','2013','2020','2021','2023','2024','2027','2038','2044','2063','2065','transformed-2013']}
    for arg,s in cases.items():
        a=check(s,80);b=check(s,110)
        assert a['nullity']==b['nullity']
        if a['exact_planar'] is not None:assert a['exact_planar']['nullity']==a['nullity']
        out[arg]=[a,b]
    print(json.dumps(out,indent=2))
