import json
from collections import Counter
import pathlib
import sys
from audit_evidence import contributing_tests


def partial(a,b):
 if isinstance(a,dict):return isinstance(b,dict) and all(k in b and partial(v,b[k]) for k,v in a.items())
 if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(partial(x,y) for x,y in zip(a,b))
 return a==b


def macneal_case(row):
 test=row['test'].split('::')[-1]
 if row['id'].startswith('macneal:'):return row['before_site']
 if test=='macneal_frame_shear_and_moment':
  return ['frame-shear-1-uz','frame-shear-2-uz','frame-shear-4-uz','frame-shear-8-uz','frame-moment-4-uz','frame-moment-4-ry'][row['observation']]
 if test=='macneal_regular_in':return 'mitc4-regular-in'
 if test=='macneal_regular_out':return 'mitc4-regular-out'
 raise ValueError(f"No source measurement for {row['id']}")


def classify_reference(row):
 name=row['test'].split('::')[-1]
 kinds={
  'mattiasson_load_step_independence':('self_consistency','load-step consistency/self-convergence'),
  'signed_response_checks_reject_reversals':('checker_control','synthetic signed-response checker control'),
 }
 if name in kinds:
  row['category'],row['reference_kind']=kinds[name]
  row['pr']=None;row['first_parent_merges']=[]
  row['attribution']='No solver accuracy or engineering-reference coverage claim; '+row['reference_kind']+'.'
 return row


def main(p):
 d=json.loads((p/'reference-comparisons.json').read_text())
 models={f.name:json.loads(f.read_text()) for f in (p/'base-fixed-native').glob('*.json')}
 cases=json.loads((p/'base/engine/tests/benchmarks/macneal_harder.json').read_text())['cases']
 for r in d['rows']:
  r['category']='engineering_reference'
  classify_reference(r)
  if r['test']=='research_benchmarks::fairclough_frame_equilibrium' and r['observation']==0:
   r['category']='test_input_metric';r['farther']=False;r['note']='Geometric volume summed over a HashMap in the test builder; not an engine output.'
  if 'macneal' in r['test']:
   name=macneal_case(r)
   case=next((c for c in cases if c['id']==name),None)
   if case is None:raise ValueError(f"No benchmark case for {r['id']}")
   if case:
    r['models']=[f for f,m in models.items() if m['analysis'] in ['solve_2d','solve_3d'] and partial(case['input'],m['input'][0])]
   if not r['models']:raise ValueError(f"No complete input match for {r['id']}")
  if 'macneal_frame_shear_and_moment' in r['test']:
   r['pr']=None;r['first_parent_merges']=[];r['attribution']='Exact frame input and signed source measurement; '+('unchanged at both endpoints.' if r['before']==r['after'] else 'changed response requires separate boundary evidence.')
  elif 'riks_' in r['test']:
   r['pr']=1885;r['attribution']='Observed adjacent first-parent transition for the corresponding arc-length benchmark family; exact full field evidence in native-fields.json.gz.'
   if not r['models']:
    r['models']=[max(((m['input'][0]['maxSteps'],f) for f,m in models.items() if m['analysis']=='solve_arc_length' and r['test'] in contributing_tests(m)),default=(None,None))[1]]
  elif r['category']=='engineering_reference':
   r.setdefault('pr',None);r.setdefault('attribution','Boundary attribution requires separate evidence.')
  if 'raasch_hook' in r['test']:r['existing_caveat']='Large reference error predates audit interval. Both current raw outputs carry LIN-SMALL-DISPLACEMENT; MITC4 also carries SH-MITC4-CONVERGENCE. See reference-warnings.json.'
 d['coverage_counts']=dict(sorted(Counter(r['category'] for r in d['rows']).items()))
 d['farther']=[r for r in d['rows'] if r['farther']]
 (p/'reference-comparisons.json').write_text(json.dumps(d,indent=2));print('OBSERVATIONS',len(d['rows']),'FARTHER',len(d['farther']),'NO MODEL',[(r['id']) for r in d['farther'] if not r['models'] or r['models']==[None]])


if __name__=='__main__':
 main(pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('/root/audit/soundness-2026-11-11'))
