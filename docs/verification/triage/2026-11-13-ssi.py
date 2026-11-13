import json,math,itertools
import mpmath as m
m.mp.dps=90
from pathlib import Path
fixture=Path(__file__).resolve().parents[3]/'engine/tests/fixtures/nightly-2026-11-13.json'
models=json.loads(fixture.read_text())
out={}
for case in ['2011','transformed-2011']:
 s=models[case];e=s['elements']['1'];a=s['nodes'][str(e['nodeI'])];b=s['nodes'][str(e['nodeJ'])];d=[m.mpf(b[k])-m.mpf(a[k]) for k in ['x','z']];L=m.sqrt(sum(x*x for x in d));ex=[x/L for x in d];ey=[-ex[1],ex[0]];E=m.mpf(s['materials'][str(e['materialId'])]['e'])*1000;sec=s['sections'][str(e['sectionId'])];ea=E*m.mpf(sec['a']);ei=E*m.mpf(sec['iz']);qi=m.mpf(s['loads'][0]['data']['qI']);qj=m.mpf(s['loads'][0]['data']['qJ']);K=m.matrix(3);f=m.matrix(3,1)
 for i in range(2):
  f[i]=ey[i]*L*(7*qi+3*qj)/20
  K[i,2]=K[2,i]=6*ei/L**2*ey[i]
  for j in range(2):K[i,j]=ea/L*ex[i]*ex[j]+12*ei/L**3*ey[i]*ey[j]
 f[2]=L**2*(3*qi+2*qj)/60;K[2,2]=4*ei/L
 u=m.lu_solve(K,f);weight=[1,1,2/L];fn=m.sqrt(sum((f[i]*weight[i])**2 for i in range(3)))
 def near(v):
  mid=float(v);r=[mid];a=b=mid
  for _ in range(25):a=math.nextafter(a,-math.inf);b=math.nextafter(b,math.inf);r.extend([a,b])
  return r
 best=m.inf;chosen=None
 for xz in itertools.product(*[near(v) for v in u[:2]]):
  theta=float((f[2]-K[2,0]*xz[0]-K[2,1]*xz[1])/K[2,2])
  x=(*xz,theta)
  r=K*m.matrix(x)-f;q=m.sqrt(sum((r[i]*weight[i])**2 for i in range(3)))/fn
  if q<best:best=q;chosen=x
 assert best < m.mpf('1e-10')
 out[case]={'exact_u':[str(v) for v in u],'best_translation_grid_relative_residual':str(best),'chosen':chosen}
print(json.dumps(out,indent=2))
