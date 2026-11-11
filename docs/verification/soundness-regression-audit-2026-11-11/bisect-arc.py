import json,pathlib,subprocess
area=pathlib.Path('/root/audit/soundness-2026-11-11');repo=area/'repo';work=area/'arc-bisect';target=area/'target-arc-bisect'
def git(*a,cwd=repo):return subprocess.check_output(['git',*a],cwd=cwd,text=True).strip()
base=git('rev-parse','3e8b33d1c');head=git('rev-parse','85c002b3a');revs=[base]+git('rev-list','--first-parent','--reverse',base+'..'+head).splitlines()
rows=json.loads((area/'native-summary.json').read_text())['drift'];cases={}
for r in rows:
 if r['analysis']=='solve_arc_length' and r['test'] not in cases:cases[r['test']]=r['model']
if not work.exists():subprocess.run(['git','worktree','add','--detach',str(work),base],cwd=repo,check=True)
records={f:json.loads((area/'base-fixed-native'/f).read_text()) for f in cases.values()};cache={}
code='''fn main() { let v: serde_json::Value=serde_json::from_reader(std::io::stdin()).unwrap(); let r=dedaliano_engine::solver::arc_length::solve_arc_length(&serde_json::from_value(v).unwrap()); println!("{}",serde_json::to_string(&r).unwrap()); }'''
def evaluate(i):
 if i in cache:return cache[i]
 sha=revs[i];subprocess.run(['git','checkout','--detach',sha],cwd=work,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 (work/'engine/examples/audit_arc.rs').write_text(code)
 with (area/f'arc-bisect-build-{sha[:9]}.log').open('w') as log:subprocess.run(['nice','-n','19','nix','develop','--command','env','CARGO_BUILD_JOBS=2','CARGO_TARGET_DIR='+str(target),'RUSTC_WRAPPER=','cargo','build','--locked','--release','-p','dedaliano-engine','--example','audit_arc'],cwd=work,check=True,stdout=log,stderr=subprocess.STDOUT)
 cache[i]={}
 for f,r in records.items():
  p=subprocess.run(['nice','-n','19',str(target/'release/examples/audit_arc')],input=json.dumps(r['input'][0]),text=True,capture_output=True,check=True,timeout=90);cache[i][f]=json.loads(p.stdout)
 (area/'arc-bisect-progress.json').write_text(json.dumps(dict(revisions=revs,evaluations=cache)))
 print('evaluated',i,sha[:9],flush=True);return cache[i]
a=evaluate(0);b=evaluate(len(revs)-1);out=[]
for f,r in records.items():
 assert a[f]==r['result'],('base binary differs from captured test',f)
 assert a[f]!=b[f],('not reproduced',f)
 lo,hi=0,len(revs)-1
 while hi-lo>1:
  m=(lo+hi)//2
  if evaluate(m)[f]!=a[f]:hi=m
  else:lo=m
 out.append(dict(model=f,test=r['test'],first_bad=revs[hi],parent=revs[lo],merge_subject=git('show','-s','--format=%s',revs[hi]),before=evaluate(lo)[f],after=evaluate(hi)[f]));print('FIRST CHANGE',f,out[-1]['merge_subject'],flush=True)
(area/'arc-bisection.json').write_text(json.dumps(out))
