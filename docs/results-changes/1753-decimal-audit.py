import json
import sys
from decimal import Decimal as D, localcontext
from pathlib import Path
with localcontext() as c:
    c.prec=90
    source=Path(sys.argv[1]).read_text()
    payload=next((line.split('SANITY_AUDIT ',1)[1] for line in source.splitlines() if line.startswith('SANITY_AUDIT ')),source)
    data=json.loads(payload)
    n=data['n']; a=[[D.from_float(v) for v in data['k'][i*n:(i+1)*n]] for i in range(n)]
    f=list(map(D.from_float,data['f'])); u=list(map(D.from_float,data['u']))
    lu=[r[:] for r in a]; perm=list(range(n))
    for j in range(n):
        p=max(range(j,n), key=lambda i:abs(lu[i][j]))
        lu[j],lu[p]=lu[p],lu[j]; perm[j],perm[p]=perm[p],perm[j]
        assert lu[j][j]
        for i in range(j+1,n):
            lu[i][j]/=lu[j][j]
            for k in range(j+1,n): lu[i][k]-=lu[i][j]*lu[j][k]
    def solve(b):
        x=[b[i] for i in perm]
        for i in range(n): x[i]-=sum(lu[i][j]*x[j] for j in range(i))
        for i in reversed(range(n)): x[i]=(x[i]-sum(lu[i][j]*x[j] for j in range(i+1,n)))/lu[i][i]
        return x
    exact=solve(f)
    residual=[sum(a[i][j]*u[j] for j in range(n))-f[i] for i in range(n)]
    norm=lambda v:max(map(abs,v))
    rowsums=[D(0)]*n
    for j in range(n):
        col=solve([D(i==j) for i in range(n)])
        for i in range(n): rowsums[i]+=abs(col[i])
    cond=max(sum(map(abs,row)) for row in a)*max(rowsums)
    print('condition_inf',cond)
    print('residual_inf_relative',norm(residual)/norm(f))
    print('relative_forward_error_inf',norm([x-y for x,y in zip(u,exact)])/norm(exact))
    print('component relative error (nonzero)', max(abs(x/y-1) for x,y in zip(u,exact) if abs(y)>D('1e-10')))
    print('residual_times_condition',norm(residual)/norm(f)*cond)
    print('max_absolute_forward_error',norm([x-y for x,y in zip(u,exact)]))
    if len(sys.argv)>2:
        nodes=sorted({node for (node,local),i in data['dofs']})
        rows={node:dict(nodeId=node,ux=0.,uy=0.,uz=0.,rx=0.,ry=0.,rz=0.) for node in nodes}
        for (node,local),i in data['dofs']:
            if i<n: rows[node][['ux','uy','uz','rx','ry','rz'][local]]=float(exact[i])
        Path(sys.argv[2]).write_text(json.dumps(list(rows.values()),indent=2)+'\n')
