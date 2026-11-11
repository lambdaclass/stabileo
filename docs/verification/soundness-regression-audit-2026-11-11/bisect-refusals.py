import pathlib,json,subprocess,re
area=pathlib.Path('/root/audit/soundness-2026-11-11')
repo=area/'repo';work=area/'bisect-probe';target=area/'target-bisect'
def git(*args,cwd=repo):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
base=git('rev-parse','3e8b33d1c');head=git('rev-parse','85c002b3a')
revisions=[base]+git('rev-list','--first-parent','--reverse',base+'..'+head).splitlines()
summary=json.loads((area/'native-summary.json').read_text())
cases=[r for r in summary['drift'] if not r['before_refused'] and r['after_refused']]
if not work.exists():subprocess.run(['git','worktree','add','--detach',str(work),base],cwd=repo,check=True)
cache={}
records=[]
for r in cases:
 raw=json.loads((area/'base-fixed-native'/r['model']).read_text())
 records.append((r,raw['input'][0]))
def evaluate(index):
 if index in cache:return cache[index]
 sha=revisions[index]
 subprocess.run(['git','checkout','--detach',sha],cwd=work,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 subprocess.run(['git','diff','--exit-code','--','engine/src'],cwd=work,check=True)
 with (area/f'bisect-build-{sha[:9]}.log').open('w') as f:
  subprocess.run(['nice','-n','19','nix','develop','--command','env','CARGO_BUILD_JOBS=2','CARGO_TARGET_DIR='+str(target),'RUSTC_WRAPPER=','cargo','build','--locked','--release','-p','dedaliano-engine','--example','solve_json'],cwd=work,check=True,stdout=f,stderr=subprocess.STDOUT)
 values={}
 for r,model in records:
  p=subprocess.run(['nice','-n','19',str(target/'release/examples/solve_json'),'--3d'],input=json.dumps(model),text=True,capture_output=True,timeout=90)
  out=json.loads(p.stdout)
  values[r['model']]={'refused':p.returncode==2,'returncode':p.returncode,'output':out}
 cache[index]=values
 (area/'refusal-bisect-progress.json').write_text(json.dumps({'revisions':revisions,'evaluations':cache},indent=2))
 print('evaluated',index,sha[:9],[v['refused'] for v in values.values()],flush=True)
 return values
first=evaluate(0);last=evaluate(len(revisions)-1)
result=[]
for r,model in records:
 file=r['model'];lo,hi=0,len(revisions)-1
 assert not first[file]['refused'] and last[file]['refused']
 while hi-lo>1:
  mid=(lo+hi)//2
  if evaluate(mid)[file]['refused']:hi=mid
  else:lo=mid
 before,after=evaluate(lo)[file],evaluate(hi)[file]
 result.append(dict(model=file,test=r['test'],input=model,first_bad=revisions[hi],parent=revisions[lo],merge_subject=git('show','-s','--format=%s',revisions[hi]),before=before,after=after))
 print('FIRST BAD',file,revisions[hi],result[-1]['merge_subject'],flush=True)
(area/'refusal-bisection.json').write_text(json.dumps(result,indent=2))
