import json,pathlib,collections
p=pathlib.Path('/root/audit/soundness-2026-11-11');d=json.loads((p/'reference-comparisons.json').read_text());models={f.name:json.loads(f.read_text()) for f in (p/'base-fixed-native').glob('*.json')};cases=json.loads((p/'base/engine/tests/benchmarks/macneal_harder.json').read_text())['cases']
def partial(a,b):
 if isinstance(a,dict):return isinstance(b,dict) and all(k not in b or partial(v,b[k]) for k,v in a.items())
 if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(partial(x,y) for x,y in zip(a,b))
 return a==b
for r in d['rows']:
 r['category']='engineering_reference'
 if r['test']=='research_benchmarks::fairclough_frame_equilibrium' and r['observation']==0:
  r['category']='test_input_metric';r['farther']=False;r['note']='Geometric volume summed over a HashMap in the test builder; not an engine output.'
 if 'macneal' in r['test']:
  name=r['before_site'] if r['id'].startswith('macneal:') else 'mitc4-regular-in' if 'regular_in' in r['test'] else 'mitc4-regular-out'
  case=next((c for c in cases if c['id']==name),None)
  if case:
   r['models']=[f for f,m in models.items() if m['analysis'] in ['solve_2d','solve_3d'] and all(partial(case['input'].get(k,{}),m['input'][0].get(k,{})) for k in ['nodes','quads','plates','elements','loads'])]
 if 'riks_' in r['test']:
  r['pr']=1885;r['attribution']='First-parent bisection for the corresponding arc-length benchmark family; exact full field evidence in native-fields.json.gz.'
  if not r['models']:
   r['models']=[max(((m['input'][0]['maxSteps'],f) for f,m in models.items() if m['analysis']=='solve_arc_length' and m['test']==r['test']),default=(None,None))[1]]
 elif r['category']=='engineering_reference':r['pr']=1753;r['attribution']='Pending per-model displacement bisection; source-based linear path attribution.'
 if 'raasch_hook' in r['test']:r['existing_caveat']='Large reference error predates audit interval. Both current raw outputs carry LIN-SMALL-DISPLACEMENT; MITC4 also carries SH-MITC4-CONVERGENCE. See reference-warnings.json.'
d['farther']=[r for r in d['rows'] if r['farther']]
(p/'reference-comparisons.json').write_text(json.dumps(d,indent=2));print('OBSERVATIONS',len(d['rows']),'FARTHER',len(d['farther']),'NO MODEL',[(r['id']) for r in d['farther'] if not r['models'] or r['models']==[None]])
warn={}
for f in ['solve_3d-77061941ed6503e8.json','solve_3d-6496121985f2aa27.json']:
 warn[f]={e:json.loads((p/e/f).read_text())['result'] for e in ['base-fixed-native','repo-fixed-native']}
(p/'reference-warnings.json').write_text(json.dumps(warn))
