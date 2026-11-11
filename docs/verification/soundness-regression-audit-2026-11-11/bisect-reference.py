import pathlib,json,subprocess
area=pathlib.Path('/root/audit/soundness-2026-11-11');repo=area/'repo';work=area/'reference-bisect';target=area/'target-reference-bisect'
def git(*a,cwd=repo):return subprocess.check_output(['git',*a],cwd=cwd,text=True).strip()
base=git('rev-parse','3e8b33d1c');head=git('rev-parse','85c002b3a');revs=[base]+git('rev-list','--first-parent','--reverse',base+'..'+head).splitlines()
if not work.exists():subprocess.run(['git','worktree','add','--detach',str(work),base],cwd=repo,check=True)
records={}
for f in (area/'base-fixed-native').glob('solve_3d-*.json'):
 r=json.loads(f.read_text())
 if r.get('test')=='macneal_harder::browser_cases' and 'Ok' in r['result']:records[f.name]=r
cache={}
def signature(out):return out['displacements']
def evaluate(i):
 if i in cache:return cache[i]
 sha=revs[i];subprocess.run(['git','checkout','--detach',sha],cwd=work,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 with (area/f'reference-bisect-build-{sha[:9]}.log').open('w') as log:subprocess.run(['nice','-n','19','nix','develop','--command','env','CARGO_BUILD_JOBS=2','CARGO_TARGET_DIR='+str(target),'RUSTC_WRAPPER=','cargo','build','--locked','--release','-p','dedaliano-engine','--example','solve_json'],cwd=work,check=True,stdout=log,stderr=subprocess.STDOUT)
 cache[i]={}
 for f,r in records.items():
  p=subprocess.run(['nice','-n','19',str(target/'release/examples/solve_json'),'--3d'],input=json.dumps(r['input'][0]),text=True,capture_output=True,timeout=90);cache[i][f]=json.loads(p.stdout)
 print('evaluated',i,sha[:9],flush=True);return cache[i]
a=evaluate(0);b=evaluate(len(revs)-1);out=[]
for f,r in records.items():
 if signature(a[f])==signature(b[f]):continue
 lo,hi=0,len(revs)-1
 while hi-lo>1:
  mid=(hi+lo)//2
  if signature(evaluate(mid)[f])!=signature(a[f]):hi=mid
  else:lo=mid
 out.append(dict(model=f,first_change=revs[hi],parent=revs[lo],subject=git('show','-s','--format=%s',revs[hi]),before=evaluate(lo)[f],after=evaluate(hi)[f]));print('FIRST CHANGE',f,out[-1]['subject'],flush=True)
(area/'reference-bisection.json').write_text(json.dumps(out))
