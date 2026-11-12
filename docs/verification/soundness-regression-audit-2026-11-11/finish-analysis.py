from audit_evidence import contributing_tests, paired_endpoint_keys
import pathlib,json,importlib.util,gzip,collections,hashlib,re,sys
area=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('/root/audit/soundness-2026-11-11')
spec=importlib.util.spec_from_file_location('audit_compare',pathlib.Path(__file__).with_name('compare.py'));cmp=importlib.util.module_from_spec(spec);spec.loader.exec_module(cmp)
base,head=area/'base-site-gallery',area/'repo-site-gallery'
rows=[];farther=[]
captures=[{p.name:p for p in endpoint.glob('site-*.json')} for endpoint in [base,head]]
for name in paired_endpoint_keys(*captures):
 p=captures[1][name]
 a=json.loads(captures[0][name].read_text());b=json.loads(p.read_text())
 changes=cmp.diffs(cmp.normalize(a['outcome']),cmp.normalize(b['outcome']))
 refs=[]
 ar={r['key']:r for r in a['outcome'].get('readouts',[])}
 for br in b['outcome'].get('readouts',[]):
  if br['key'] not in ar or 'reference' not in br:continue
  av=ar[br['key']]['value'];bv=br['value'];ref=br['reference']['value']
  item=dict(case=p.stem,quantity=br['key'],before=av,after=bv,reference=ref,source=br['reference']['source'],before_error=abs(av-ref),after_error=abs(bv-ref))
  if av!=bv and item['after_error']>item['before_error']:farther.append(item)
  refs.append(item)
 rows.append(dict(case=p.stem,parameters=b['parameters'],same_model=cmp.normalize(a['model'])==cmp.normalize(b['model']),before_status=a['outcome']['status'],after_status=b['outcome']['status'],changes=changes,references=refs))
site=dict(cases=len(rows),changed=sum(bool(r['changes']) for r in rows),drift=rows,farther_from_reference=farther)
(area/'site-gallery-diff.json').write_text(json.dumps(site,indent=2))
print('SITE',site['cases'],'changed',site['changed'],'new refusals',sum(r['before_status']=='ok' and r['after_status']=='refused' for r in rows),'farther nominal',len(farther),'model changes',sum(not r['same_model'] for r in rows),flush=True)
for r in rows:
 if r['changes'] or r['before_status']!=r['after_status']:print(r['case'],r['before_status'],r['after_status'],len(r['changes']),r['same_model'],flush=True)
records=[]
for p in (area/'repo-fixed-native').glob('*.json'):
 d=json.loads(p.read_text())
 if any(test.startswith('acceptance::') for test in contributing_tests(d)):records.append((p.name,d))
refs=[]
for case_path in (area/'repo/engine/tests/acceptance/models').glob('*.json'):
 case=json.loads(case_path.read_text());matches=[r for r in records if any(test.endswith('::'+case['id']) for test in contributing_tests(r[1]))]
 assert len(matches)==1,(case['id'],len(matches))
 file,d=matches[0];before=json.loads((area/'base-fixed-native'/file).read_text())['result']['Ok'];after=d['result']['Ok']
 def quantity(result,r):
  q=r['quantity']
  if q in ['frequency','period','loadFactor','eigenvalue']:
   m=result['modes'][r['mode']-1]
   return m['omega']**2 if q=='eigenvalue' else m[q]
  collection,identity,value=('displacements','nodeId',r['node']) if q=='displacement' else ('reactions','nodeId',r['node']) if q=='reaction' else ('elementForces','elementId',r['element'])
  return next(v for v in result[collection] if v[identity]==value)[r['component']]
 for r in case['references']:
  av,bv=quantity(before,r),quantity(after,r);ref=r['value'];allowed=max(r.get('tolAbs',0),r.get('tolRel',0)*abs(ref))
  refs.append(dict(case=case['id'],selector=r,before=av,after=bv,before_error=abs(av-ref),after_error=abs(bv-ref),allowed=allowed,before_pass=abs(av-ref)<=allowed,after_pass=abs(bv-ref)<=allowed,source=case['source']))
acceptance=dict(cases=len(list((area/'repo/engine/tests/acceptance/models').glob('*.json'))),references=len(refs),changed=sum(r['before']!=r['after'] for r in refs),farther=[r for r in refs if r['before']!=r['after'] and r['after_error']>r['before_error']],comparisons=refs)
(area/'acceptance-comparison.json').write_text(json.dumps(acceptance,indent=2))
print('ACCEPTANCE',acceptance['cases'],acceptance['references'],'changed',acceptance['changed'],'farther',len(acceptance['farther']),'pass before',sum(r['before_pass'] for r in refs),'pass after',sum(r['after_pass'] for r in refs),flush=True)
