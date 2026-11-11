import hashlib, json, sys
from decimal import Decimal as D, localcontext
from pathlib import Path

def dec(v):
    return D.from_float(v) if isinstance(v,float) else D(v or 0)

def zeros(n,m): return [[D(0) for j in range(m)] for i in range(n)]
def dot(a,b): return sum((x*y for x,y in zip(a,b)),D(0))
def transpose(a): return list(map(list,zip(*a)))
def mm(a,b): return [[dot(r,c) for c in transpose(b)] for r in a]
def mv(a,b): return [dot(r,b) for r in a]
def unit(v):
    norm=dot(v,v).sqrt()
    return [x/norm for x in v]
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def sincos(a):
    s=a; c=D(1); ts=a; tc=D(1)
    for k in range(1,240):
        ts *= -a*a / D((2*k)*(2*k+1)); tc *= -a*a / D((2*k-1)*(2*k))
        s+=ts; c+=tc
        if abs(ts)+abs(tc)<D('1e-95'): break
    return s,c

def affine(rows,rhs,n):
    a=[list(r)+[b] for r,b in zip(rows,rhs)]; piv=[]; rank=0
    threshold=max((abs(x) for r in rows for x in r),default=D(1))*D('1e-70')
    for j in range(n):
        p=max(range(rank,len(a)),key=lambda i:abs(a[i][j]),default=None)
        if p is None or abs(a[p][j])<=threshold: continue
        a[rank],a[p]=a[p],a[rank]
        pivot=a[rank][j]; a[rank]=[v/pivot for v in a[rank]]
        for i in range(len(a)):
            if i!=rank:
                v=a[i][j]
                if v: a[i]=[x-v*y for x,y in zip(a[i],a[rank])]
        piv.append(j); rank+=1
    for row in a[rank:]:
        if abs(row[-1])>threshold: raise ValueError('incompatible load '+str(row[-1])+' threshold '+str(threshold))
    free=[j for j in range(n) if j not in piv]
    c=zeros(n,len(free)); p=[D(0)]*n
    for j,col in enumerate(free): c[col][j]=D(1)
    for i,col in enumerate(piv):
        p[col]=a[i][-1]
        for j,f in enumerate(free): c[col][j]=-a[i][f]
    return p,c

def linear(a,b):
    p,c=affine(a,b,len(a[0]) if a else 0)
    if c and c[0]:
        ct=transpose(c); z=linear(mm(ct,c),[-dot(v,p) for v in ct])
        p=[v+dot(row,z) for v,row in zip(p,c)]
    return p

def reference(s,dim):
    nodes=sorted(s['nodes'].values(),key=lambda n:n['id']); ids=[n['id'] for n in nodes]
    dpn=(3 if dim==2 else 6) if any(e['type']=='frame' for e in s['elements'].values()) else dim
    if dim==3 and any(sec.get('cw') for sec in s['sections'].values()): dpn=7
    n=len(ids)*dpn; index={(node,d):i*dpn+d for i,node in enumerate(ids) for d in range(dpn)}
    def ix(node,d): return index.get((node,d))
    coords={v['id']:[dec(v[c]) for c in (['x','z'] if dim==2 else ['x','y','z'])] for v in nodes}
    k=zeros(n,n); f=[D(0)]*n; records=[]; equations=[]; prescribed=[]
    def scatter(indices,ke,fe=None):
        for a,i in enumerate(indices):
            if i is None: continue
            if fe: f[i]+=fe[a]
            for b,j in enumerate(indices):
                if j is not None: k[i][j]+=ke[a][b]
    def equation(terms,b=D(0)):
        row=[D(0)]*n
        for i,v in terms:
            if i is not None: row[i]+=v
        equations.append(row);prescribed.append(b)
    for e in sorted(s['elements'].values(),key=lambda e:e['id']):
        ni,nj=e['nodeI'],e['nodeJ']; a,b=coords[ni],coords[nj]; delta=[y-x for x,y in zip(a,b)]; length=dot(delta,delta).sqrt(); ex=unit(delta)
        size=6 if dim==2 else 12; off=size//2; kl=zeros(size,size); fl=[D(0)]*size
        mat=s['materials'][str(e['materialId'])]; sec=s['sections'][str(e['sectionId'])]
        E=dec(mat['e'])*1000; G=E/(2*(1+dec(mat['nu']))); area=dec(sec['a']); L=length
        axial=E*area/L
        kl[0][0]=kl[off][off]=axial; kl[0][off]=kl[off][0]=-axial
        if dim==2:
            rot=[[ex[0],ex[1]],[-ex[1],ex[0]]]
            planes=[([1,2,4,5],dec(sec['iz']),sec.get('asY'),D(1))]
            releases=[j for j,key in [(2,'hingeStart'),(5,'hingeEnd')] if e.get(key)]
        else:
            if e.get('localYx') is not None:
                ref=unit([dec(e[x]) for x in ['localYx','localYy','localYz']]); ez=unit(cross(ex,ref)); ey=cross(ez,ex)
            else:
                up=[D(1),D(0),D(0)] if abs(ex[2])>D('0.999') else [D(0),D(0),D(1)]
                ez=unit([v-dot(ex,up)*x for v,x in zip(up,ex)]); ey=cross(ez,ex)
            if e.get('rollAngle'):
                pi=16*atan(D(1)/5)-4*atan(D(1)/239)
                sn,co=sincos(dec(e['rollAngle'])*pi/180)
                ey,ez=([co*y+sn*z for y,z in zip(ey,ez)],[-sn*y+co*z for y,z in zip(ey,ez)])
            if s.get('leftHand'): ey=[-v for v in ey]
            rot=[ex,ey,ez]
            planes=[([1,5,7,11],dec(sec['iz']),sec.get('asZ'),D(1)),([2,4,8,10],dec(sec['iy']),sec.get('asY'),D(-1))]
            releases=[j for j,key in [(4,'releaseMyStart'),(10,'releaseMyEnd'),(5,'releaseMzStart'),(11,'releaseMzEnd'),(3,'releaseTStart'),(9,'releaseTEnd')] if e.get(key)]
            if e['type']=='frame':
                torsion=G*dec(sec['j'])/L
                kl[3][3]=kl[9][9]=torsion; kl[3][9]=kl[9][3]=-torsion
        if e['type']=='frame':
            for idx,I,As,sign in planes:
                phi=12*E*I/(G*dec(As)*L*L) if As else D(0)
                A=12*E*I/(L**3*(1+phi));B=6*E*I/(L**2*(1+phi));C=(4+phi)*E*I/(L*(1+phi));H=(2-phi)*E*I/(L*(1+phi))
                bend=[[A,B,-A,B],[B,C,-B,H],[-A,-B,A,-B],[B,H,-B,C]]
                signs=[D(1),sign,D(1),sign]
                for i in range(4):
                    for j in range(4): kl[idx[i]][idx[j]]=bend[i][j]*signs[i]*signs[j]
        def dist_shapes(phi):
            return [[1+phi,-phi/L,-3/L**2,2/L**3],[0,1+phi/2,-(2+phi/2)/L,1/L**2],[0,phi/L,3/L**2,-2/L**3],[0,-phi/2,(-1+phi/2)/L,1/L**2]]
        for load in s['loads']:
            d=load['data']
            if d.get('elementId')!=e['id']: continue
            typ=load['type']
            if typ=='thermal':
                alpha=dec(d.get('alpha',0.000012)); dt=dec(d.get('dtUniform')); axial_thermal=E*area*alpha*dt
                fl[0]-=axial_thermal; fl[off]+=axial_thermal
                for idx,I,As,sign in planes:
                    if e['type']!='frame':continue
                    gradient=dec(d.get('dtGradient')) if dim==2 else dec(d.get('dtGradientY' if idx[0]==1 else 'dtGradientZ'))
                    depth=dec(d.get('depth')) if dim==2 else dec(d.get('depthY' if idx[0]==1 else 'depthZ'))
                    if not depth: depth=(12*I/area).sqrt()
                    moment=E*I*alpha*gradient/depth
                    fl[idx[1]]-=moment;fl[idx[3]]+=moment
                continue
            if typ=='pointOnElement':
                x=dec(d['a'])
                for idx,I,As,sign in planes:
                    transverse=dec(d.get('p')) if dim==2 else dec(d.get('py' if idx[0]==1 else 'pz'))
                    moment=dec(d.get('my')) if dim==2 else dec(d.get('mz' if idx[0]==1 else 'my'))
                    phi=12*E*I/(G*dec(As)*L*L) if As else D(0)
                    shapes=dist_shapes(phi) if e['type']=='frame' else [[1,-1/L],[0],[0,1/L],[0]]
                    rotation=[[-6*x/L**2+6*x*x/L**3], [1+phi-(4+phi)*x/L+3*x*x/L**2], [6*x/L**2-6*x*x/L**3], [-(2-phi)*x/L+3*x*x/L**2]]
                    for j,poly in enumerate(shapes):
                        value=transverse*sum(dec(v)*x**t for t,v in enumerate(poly)) + moment*rotation[j][0]*(sign if dim==3 else 1)
                        fl[idx[j]]+=value/(1+phi if e['type']=='frame' else 1)*(sign if j%2 else 1)
                px=dec(d.get('px'));fl[0]+=px*(1-x/L);fl[off]+=px*x/L
                continue
            if typ!='distributed': raise ValueError('load '+typ)
            aa=dec(d.get('a')); bb=dec(d['b']) if d.get('b') is not None else L
            for idx,I,As,sign in planes:
                qi,qj=(dec(d['qI']),dec(d['qJ'])) if dim==2 else ((dec(d['qYI']),dec(d['qYJ'])) if idx[0]==1 else (dec(d['qZI']),dec(d['qZJ'])))
                if not (qi or qj): continue
                phi=12*E*I/(G*dec(As)*L*L) if As else D(0)
                sh=dist_shapes(phi) if e['type']=='frame' else [[1,-1/L],[0],[0,1/L],[0]]
                slope=(qj-qi)/(bb-aa);intercept=qi-slope*aa
                for j,poly in enumerate(sh):
                    value=sum(v*(intercept*(bb**(t+1)-aa**(t+1))/D(t+1)+slope*(bb**(t+2)-aa**(t+2))/D(t+2)) for t,v in enumerate(map(dec,poly)))/(1+phi if e['type']=='frame' else 1)
                    fl[idx[j]]+=value*(sign if j%2 else 1)
            if dim==3 and (d.get('qXI') or d.get('qXJ')): raise ValueError('axial load')
        for release in releases:
            pivot=kl[release][release]
            if not pivot: continue
            col=[row[release] for row in kl]; row=kl[release][:];load=fl[release]
            for i in range(size):
                fl[i]-=col[i]*load/pivot
                for j in range(size): kl[i][j]-=col[i]*row[j]/pivot
            for i in range(size):kl[i][release]=kl[release][i]=D(0)
            fl[release]=D(0)
        if dim==3 and sec.get('cw') and e['type']=='frame':
            mapping=list(range(6))+list(range(7,13)); expanded=zeros(14,14); expanded_f=[D(0)]*14
            for i in range(12):
                expanded_f[mapping[i]]=fl[i]
                for j in range(12):expanded[mapping[i]][mapping[j]]=kl[i][j]
            for i in [3,10]:
                for j in [3,10]:expanded[i][j]=D(0)
            if not (e.get('releaseTStart') or e.get('releaseTEnd')):
                gj=G*dec(sec['j']);ecw=E*dec(sec['cw'])
                aa=6*gj/(5*L)+12*ecw/L**3;bb=gj/10+6*ecw/L**2;cc=2*gj*L/15+4*ecw/L;dd=2*ecw/L-gj*L/30
                block=[[aa,bb,-aa,bb],[bb,cc,-bb,dd],[-aa,-bb,aa,-bb],[bb,dd,-bb,cc]]
                for i,ii in enumerate([3,6,10,13]):
                    for j,jj in enumerate([3,6,10,13]):expanded[ii][jj]=block[i][j]
            kl=expanded;fl=expanded_f;size=14;off=7
        t=zeros(size,size)
        for node_off in [0,off]:
            for j in range(dim):
                for q in range(dim): t[node_off+j][node_off+q]=rot[j][q]
            if dim==2: t[node_off+2][node_off+2]=D(1)
            else:
                for j in range(3):
                    for q in range(3):t[node_off+3+j][node_off+3+q]=rot[j][q]
                if off==7:t[node_off+6][node_off+6]=D(1)
        indices=[ix(node,d) for node in [ni,nj] for d in range(off)]
        scatter(indices,mm(transpose(t),mm(kl,t)),mv(transpose(t),fl))
        records.append((e,indices,kl,fl,t))
    for load in s['loads']:
        if load['type']=='bimoment':
            d=load['data'];f[ix(d['nodeId'],6)]+=dec(d['bimoment']);continue
        if load['type']!='nodal': continue
        d=load['data']; keys=['fx','fz','my'] if dim==2 else ['fx','fy','fz','mx','my','mz','bw']
        for local,key in enumerate(keys):
            i=ix(d['nodeId'],local)
            if i is not None:f[i]+=dec(d.get(key))
    spring_matrix=zeros(n,n); fixed_rows=[]
    for sup in s['supports'].values():
        before=[row[:] for row in k];before_eq=len(equations)
        node=sup['nodeId']
        if dim==2:
            rigid={'fixed':[1,1,1],'pinned':[1,1,0],'rollerX':[0,1,0],'rollerY':[1,0,0],'rollerZ':[1,0,0],'guidedX':[0,1,1],'guidedY':[1,0,1],'guidedZ':[1,0,1]}.get(sup['type'],[0,0,0])
            pres=[sup.get(v) for v in ['dx','dz','dry']]; ks=[dec(sup.get(v)) for v in ['kx','kz','kry']]
            if sup['type']=='inclinedRoller':
                sn,co=sincos(dec(sup.get('angle'))*(16*atan(D(1)/5)-4*atan(D(1)/239))/180);equation([(ix(node,0),sn),(ix(node,1),co)],sn*dec(pres[0])+co*dec(pres[1]))
            if sup['type']=='spring' and sup.get('angle'):
                sn,co=sincos(dec(sup['angle'])*(16*atan(D(1)/5)-4*atan(D(1)/239))/180); kx,kz=ks[:2];
                for i,j,v in [(0,0,kx*co*co+kz*sn*sn),(1,1,kx*sn*sn+kz*co*co),(0,1,(kx-kz)*sn*co),(1,0,(kx-kz)*sn*co)]:k[ix(node,i)][ix(node,j)]+=v
                ks[:2]=[D(0),D(0)]
        else:
            rigid=[sup.get(v,False) for v in ['rx','ry','rz','rrx','rry','rrz','rw']];pres=[sup.get(v) for v in ['dx','dy','dz','drx','dry','drz','dw']];ks=[dec(sup.get(v)) for v in ['kx','ky','kz','krx','kry','krz','kw']]
            if sup.get('isInclined'):
                normal=unit([dec(sup[v]) for v in ['normalX','normalY','normalZ']]);equation([(ix(node,d),normal[d]) for d in range(3)],dot(normal,list(map(dec,pres[:3]))));rigid[:3]=[0,0,0]
        for local in range(dpn):
            i=ix(node,local);k[i][i]+=ks[local]
            if rigid[local]:equation([(i,D(1))],dec(pres[local]))
        for i in range(n):
            for j in range(n):spring_matrix[i][j]+=k[i][j]-before[i][j]
        fixed_rows.extend(equations[before_eq:])
    for con in s.get('constraints',[]):
        if con['type'] not in ['rigidLink','equalDOF']:raise ValueError('constraint '+con['type'])
        master,slave=con['masterNode'],con['slaveNode']; offset=[b-a for a,b in zip(coords[master],coords[slave])]
        for d in con.get('dofs') or list(range(min(dpn,3 if dim==2 else 6))):
            terms=[(ix(slave,d),D(1)),(ix(master,d),D(-1))]
            if con['type']=='rigidLink' and d<dim:
                if dim==2:terms.append((ix(master,2),offset[1] if d==0 else -offset[0]))
                else:
                    for axis in range(3):
                        v=cross([D(int(j==axis)) for j in range(3)],offset)[d]
                        terms.append((ix(master,3+axis),-v))
            equation(terms)
    for conn in s.get('connectors',{}).values():
        assert dim==2
        ni,nj=conn['nodeI'],conn['nodeJ']; delta=[b-a for a,b in zip(coords[ni],coords[nj])];L=dot(delta,delta).sqrt();co,sn=unit(delta) if L else [D(1),D(0)]
        rows=[[-co,-sn,0,co,sn,0],[sn,-co,-L/2,-sn,co,-L/2],[0,0,-1,0,0,1]]
        ke=zeros(6,6)
        for key,row in zip(['kAxial','kShear','kMoment'],rows):
            kval=dec(conn.get(key))
            for i in range(6):
                for j in range(6):ke[i][j]+=kval*dec(row[i])*dec(row[j])
        scatter([ix(node,d) for node in [ni,nj] for d in range(3)],ke)
    p,c=affine(equations,prescribed,n)
    ct=transpose(c);red=mm(ct,mm(k,c));rhs=mv(ct,[v-w for v,w in zip(f,mv(k,p))])
    q=linear(red,rhs);u=[a+dot(b,q) for a,b in zip(p,c)]
    forces=[]
    for e,indices,kl,fl,t in records:
        ue=[u[i] if i is not None else D(0) for i in indices]; local=[a-b for a,b in zip(mv(kl,mv(t,ue)),fl)]
        forces.append({'id':e['id'],'values':local})
    return {'u':u,'index':index,'forces':forces,'k':k,'f':f,'springs':spring_matrix,'fixed':fixed_rows,'equations':equations}

def atan(x):
    result=D(0); power=x
    for i in range(200):
        term=power/D(2*i+1);result+=term;power*=-x*x
        if abs(term)<D('1e-95'):break
    return result


def physical_input(s,dim):
 if dim!=2:return s
 pi=16*atan(D(1)/5)-4*atan(D(1)/239)
 supports={}
 for key,sup in s['supports'].items():
  physical=dict(sup, kz=sup.get('ky'), kry=sup.get('kz'))
  physical.pop('ky',None)
  if sup.get('angle') is not None:physical['angle']=dec(sup['angle'])*180/pi
  supports[key]=physical
 return dict(s,supports=supports)


def refs(rec):
 s=physical_input(rec['input'],rec['dim']);dim=rec['dim']
 r=reference(s,dim);items=[];dpn=max(d for n,d in r['index'])+1
 def push(node,elem,tag,values):items.append({'node':node,'element':elem,'tag':tag,'values':[str(v) for v in values]})
 for node in sorted(v['id'] for v in s['nodes'].values()):
  u=[r['u'][r['index'][node,d]] for d in range(dpn)]
  push(node,None,'u',u[:dim]);push(node,None,'ry' if dim==2 else 'r',u[dim:3 if dim==2 else 6])
  if dpn==7:push(node,None,'warping',[u[6]])
 residual=[v-f for v,f in zip(mv(r['k'],r['u']),r['f'])];spring=mv(r['springs'],r['u']);reaction=[-v for v in spring]
 multipliers=linear(transpose(r['equations']),residual) if r['equations'] else []
 for row,value in zip(r['fixed'],multipliers):
  for i,v in enumerate(row):reaction[i]+=v*value
 for node in sorted(set(sup['nodeId'] for sup in s['supports'].values())):
  vals=[reaction[r['index'][node,d]] for d in range(dpn)]
  push(node,None,'R',vals[:dim]);push(node,None,'RM',vals[dim:3 if dim==2 else 6])
 for f in r['forces']:
  a=f['values'];off=len(a)//2
  push(None,f['id'],'N',[-a[0],a[off]])
  push(None,f['id'],'V',[a[1],-a[off+1]] if dim==2 else [a[1],-a[off+1],a[2],-a[off+2]])
  push(None,f['id'],'M',[a[2],-a[off+2]] if dim==2 else [a[3],-a[off+3],a[4],-a[off+4],a[5],-a[off+5]])
  if off==7:push(None,f['id'],'bimoment',[-a[6],a[13]])
 scale=max(abs(v) for v in r['f']);coords=list(s['nodes'].values());axes=['x','z'] if dim==2 else ['x','y','z'];length=max(max(dec(n[a]) for n in coords)-min(dec(n[a]) for n in coords) for a in axes)
 return {'items':items,'force_scale':str(scale),'length':str(length)}


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    sources = json.loads((root / 'docs/results-changes/1753-loaded-c08-inputs.json').read_text(), parse_float=D)
    for name, value in sources.items():
        fixture = root / f'engine/tests/metamorphic_corpus/stability/{name}.json'
        assert hashlib.sha256(fixture.read_bytes()).hexdigest() == value['fixture_sha256'], name
    with localcontext() as context:
        context.prec = 90
        out = {name: refs({'input': value['input'], 'dim': value['dimension']}) for name, value in sources.items()}
    destination = root / 'engine/tests/metamorphic_corpus/1753-accuracy-reference.json'
    encoded = json.dumps(out, indent=2) + '\n'
    if '--write' in sys.argv:
        destination.write_text(encoded)
    else:
        assert destination.read_text() == encoded, 'physical references need regeneration'
    print(f'{len(out)} physical references checked at 90 decimal digits')
