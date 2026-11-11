import json,pathlib,sys,collections
area=pathlib.Path('/root/audit/soundness-2026-11-11')
missing=object()
def normalize(v,key=''):
 if isinstance(v,dict):return {k:normalize(x,k) for k,x in v.items() if k!='timings'}
 if isinstance(v,list):
  for identity in ['nodeId','elementId','id']:
   if v and all(isinstance(x,dict) and identity in x for x in v):
    v=sorted(v,key=lambda x:str(x[identity]));break
  return [normalize(x) for x in v]
 return v
def diffs(a,b,path=''):
 if a is missing or b is missing:
  return [dict(path=path, **({'after':b} if a is missing else {'before':a}))]
 if isinstance(a,dict) and isinstance(b,dict):
  out=[]
  for key in sorted(a.keys()|b.keys()):out+=diffs(a.get(key,missing),b.get(key,missing),path+'.'+key if path else key)
  return out
 if isinstance(a,list) and isinstance(b,list):
  out=[]
  for i in range(max(len(a),len(b))):out+=diffs(a[i] if i<len(a) else missing,b[i] if i<len(b) else missing,f'{path}[{i}]')
  return out
 if a is not missing and b is not missing and type(a)==type(b) and a==b:return []
 if isinstance(a,(dict,list)) or isinstance(b,(dict,list)):
  if a is missing:a={} if isinstance(b,dict) else []
  if b is missing:b={} if isinstance(a,dict) else []
  if type(a)==type(b):return diffs(a,b,path)
 row={'path':path}
 if a is not missing:row['before']=a
 if b is not missing:row['after']=b
 return [row]
def run(base,head,name):
 names={p.name for p in (area/base).glob('*.json')}|{p.name for p in (area/head).glob('*.json')}
 rows=[];errors=[];unchanged=[];unmatched=[]
 for file in sorted(names):
  bp,hp=area/base/file,area/head/file
  if not bp.exists() or not hp.exists():unmatched.append(file);continue
  a,b=json.loads(bp.read_text()),json.loads(hp.read_text())
  if 'harnessError' in a or 'harnessError' in b:errors.append(dict(model=file,before=a.get('harnessError'),after=b.get('harnessError')));continue
  native='result' in a
  av,bv=(a['result'],b['result']) if native else ({'values':a['values'],'raw':a.get('raw')},{'values':b['values'],'raw':b.get('raw')})
  change=diffs(normalize(av),normalize(bv))
  if not change:unchanged.append(file);continue
  row=dict(model=file,test=b.get('test',b.get('case')),changes=change)
  if native:row['input']=b['input'];row['analysis']=b['analysis']
  row['numeric_changes']=sum(isinstance(c.get('before'),(float,int)) and not isinstance(c.get('before'),bool) and isinstance(c.get('after'),(float,int)) for c in change)
  row['before_refused']='Err' in a.get('result',{}) if native else not a['values'].get('solve.ok',False)
  row['after_refused']='Err' in b.get('result',{}) if native else not b['values'].get('solve.ok',False)
  rows.append(row)
 out=dict(base=base,head=head,matched=len(names)-len(unmatched),changed=len(rows),unchanged=unchanged,unmatched=unmatched,errors=errors,drift=rows)
 (area/f'{name}-diff.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
 print(name,'changed',len(rows),'unchanged',len(unchanged),'errors',len(errors),'unmatched',len(unmatched),'fields',sum(len(r['changes']) for r in rows),flush=True)
 for r in rows[:80]:print(r['test'],r['model'],len(r['changes']),r['before_refused'],r['after_refused'],flush=True)
if __name__ == '__main__':
 run('base-web','head-web','web')
 if len(sys.argv)>1:run('base-fixed-native','repo-fixed-native','native')
