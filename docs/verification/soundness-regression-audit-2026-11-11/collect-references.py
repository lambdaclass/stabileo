from audit_evidence import contributing_tests
import pathlib,json,re,collections,gzip
p=pathlib.Path('/root/audit/soundness-2026-11-11');endpoints={};rawlogs={}
for endpoint in ['base','repo']:
 rows=[];counts=collections.Counter()
 for f in sorted(p.glob(endpoint+'-reference-*.log')):
  text=f.read_text();rawlogs[f.name]=text
  for line in text.splitlines():
   if 'AUDIT_REFERENCE=' not in line:continue
   r=json.loads(line.split('AUDIT_REFERENCE=',1)[1]);test=r['test'];key=(test,counts[test]);counts[test]+=1;rows.append((key,r))
 for f in p.glob(endpoint+'-complete-shells-*.log'):
  m=re.search(r'MACNEAL_HARDER_RESULTS=(.*)',f.read_text())
  if not m:continue
  for r in json.loads(m[1]):
   if r.get('value') is not None:rows.append((('macneal:'+r['id'],0),dict(test='macneal_harder::browser_cases',site=r['id'],actual=r['value'],reference=r['reference'])))
 endpoints[endpoint]=dict(rows)
models=collections.defaultdict(list)
for f in (p/'base-fixed-native').glob('*.json'):
 r=json.loads(f.read_text());test=r.get('test');value=r['result'].get('Ok')
 if not value or not isinstance(value,dict):continue
 vals=[]
 if r['analysis']=='solve_arc_length':
  vals.append(value['finalLoadFactor']);solver=r['input'][0]['solver'];force=sum(-x['data'].get('fz',0) for x in solver['loads'] if x['type']=='nodal');vals.append(value['finalLoadFactor']*force)
  vals.extend(d.get('uz',0) for d in value['results']['displacements'])
 elif r['analysis']=='solve_3d':
  vals.extend(d.get(k,0) for d in value['displacements'] for k in ['ux','uy','uz'])
 else:continue
 for test in contributing_tests(r):
  for v in vals:
   for x in [v,-v,1000*v,-1000*v]:models[(test,x)].append(f.name)
rows=[];unmatched=[]
for key,a in endpoints['base'].items():
 b=endpoints['repo'].get(key)
 if b is None:unmatched.append(dict(key=key,before=a));continue
 same_reference=a['reference']==b['reference'];ae=abs(a['actual']-a['reference']) if same_reference else None;be=abs(b['actual']-b['reference']) if same_reference else None;r=dict(id=key[0]+':'+str(key[1]),test=a['test'],observation=key[1],before_site=a['site'],after_site=b['site'],before=a['actual'],after=b['actual'],reference=b['reference'],before_reference=a['reference'],same_reference=a['reference']==b['reference'],before_error=ae,after_error=be,farther=(b['actual']!=a['actual'] and be>ae) if same_reference else None,models=list(dict.fromkeys(models.get((a['test'],a['actual']),[]))),attribution='Source review pending first-parent boundary',pr=None)
 rows.append(r)
result=dict(rows=rows,farther=[r for r in rows if r['farther']],unmatched=unmatched,unmatched_after=[k for k in endpoints['repo'] if k not in endpoints['base']])
(p/'reference-comparisons.json').write_text(json.dumps(result,indent=2))
with gzip.open(p/'reference-probe-logs.json.gz','wt') as f:json.dump(rawlogs,f)
print('reference observations',len(rows),'farther',len(result['farther']),'unmatched',len(unmatched),len(result['unmatched_after']))
print(collections.Counter(r['test'] for r in result['farther']))
for r in result['farther'][:8]:print(r)
