from audit_evidence import contributing_tests
import json,pathlib,collections,sys
import importlib.util
spec=importlib.util.spec_from_file_location('annotate_references',pathlib.Path(__file__).with_name('annotate-references.py'));annotation=importlib.util.module_from_spec(spec);spec.loader.exec_module(annotation);macneal_case=annotation.macneal_case
p=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('/root/audit/soundness-2026-11-11');d=json.loads((p/'reference-comparisons.json').read_text());models={f.name:json.loads(f.read_text()) for f in (p/'base-fixed-native').glob('*.json')};cases={c['id']:c for c in json.loads((p/'base/engine/tests/benchmarks/macneal_harder.json').read_text())['cases']}
previous={(r['id'],r['model']):r for r in d.get('frozen_primary_comparisons',[])}
fallback={'benchmark_curved_shell_hemisphere_8x8':{2:81},'benchmark_q9_navier_plate':{2:289},'benchmark_ss_navier_plate':{0:50},'benchmark_ss_scordelis_lo':{0:98,1:162}}
rows=[];unresolved=[]
for r in d['rows']:
 if r['category']!='engineering_reference' or 'riks_' in r['test']:continue
 test=r['test'].split('::')[-1]
 if not r['models'] and test in fallback and r['observation'] in fallback[test]:
  count=fallback[test][r['observation']];r['models']=[f for f,m in models.items() if r['test'] in contributing_tests(m) and len(m['input'][0]['nodes'])==count];r['model_provenance']='Source mesh parameter and node count; full model variants retained.'
 if not r['models'] and test=='benchmark_curved_shell_hemisphere_8x8' and r['observation']==2:
  r['models']=[f for f,m in models.items() if m['analysis']=='solve_3d' and len(m['input'][0]['nodes'])==81 and len(m['input'][0].get('curvedShells',{}))==64 and m['input'][0]['nodes'].get('1',{}).get('x')==10.0]
 for file in r['models']:
  m=models[file];before=m['result'].get('Ok');after=json.loads((p/'repo-fixed-native'/file).read_text())['result'].get('Ok')
  if not before or not after:continue
  selectors=[];identities=[];component='uz';scale=1.0;average=False
  if 'macneal' in r['test']:
   name=macneal_case(r);c=cases.get(name)
   if c:identities=c['measurement']['nodes'];component=c['measurement']['component'];average=True
  elif test=='benchmark_q9_spherical_cap':identities=[1]
  elif test=='benchmark_q9_navier_plate':identities=[(int(len(m['input'][0]['nodes'])**0.5)//2)*(int(len(m['input'][0]['nodes'])**0.5))+int(len(m['input'][0]['nodes'])**0.5)//2+1]
  elif test=='benchmark_curved_shell_hemisphere_8x8':identities=[1];component='ux'
  elif test=='benchmark_ss_scordelis_lo':identities=[len(m['input'][0]['nodes'])-1]
  elif test=='benchmark_ss_navier_plate':
   s=m['input'][0]['nodes'];xs=[n['x'] for n in s.values()];ys=[n['y'] for n in s.values()];cx,cy=(min(xs)+max(xs))/2,(min(ys)+max(ys))/2;identities=[n['id'] for n in s.values() if n['x']==cx and n['y']==cy];average=True
  if identities:
   selectors=[dict(nodes=identities,component=component,scale=1,absolute=not 'macneal' in r['test'],average=average)]
  else:
   for v in before['displacements']:
    for k in ['ux','uy','uz']:
     for factor in [1,-1,1000,-1000]:
      if v[k]*factor==r['before']:selectors.append(dict(nodes=[v['nodeId']],component=k,scale=factor,absolute=False,average=False))
  def value(result,sel):
   vals=[next(x for x in result['displacements'] if x['nodeId']==n)[sel['component']] for n in sel['nodes']]
   if sel['absolute']:vals=[abs(v) for v in vals]
   return (sum(vals)/len(vals) if sel['average'] else vals[0])*sel['scale']
  if not selectors:unresolved.append(dict(id=r['id'],model=file,reason='No unambiguous measurement selector recovered'));continue
  vals={(value(before,s),value(after,s)) for s in selectors}
  if len(vals)!=1:unresolved.append(dict(id=r['id'],model=file,reason='Equal baseline components split; source selector needed',selectors=selectors));continue
  av,bv=vals.pop();
  if 'macneal' in r['test']:assert (av,bv)==(r['before'],r['after']),(r['id'],file,av,bv,r['before'],r['after'])
  ref=r['reference'];rows.append(dict(id=r['id'],model=file,test=r['test'],selector=selectors[0],before=av,after=bv,reference=ref,before_error=abs(av-ref),after_error=abs(bv-ref),farther=av!=bv and abs(bv-ref)>abs(av-ref),same_input=True))
def append(file,m,component,reference,source,node=None,reactions=False,absolute=True):
 a=m['result']['Ok'];b=json.loads((p/'repo-fixed-native'/file).read_text())['result']['Ok']
 def measure(v):return sum(x[component] for x in v['reactions']) if reactions else (abs(next(x for x in v['displacements'] if x['nodeId']==node)[component]) if absolute else next(x for x in v['displacements'] if x['nodeId']==node)[component])
 av,bv=measure(a),measure(b);ref=reference
 rows.append(dict(id=source+':'+component,model=file,test=m['test'],selector=dict(node=node,component=component,reaction_sum=reactions,absolute=absolute and not reactions),before=av,after=bv,reference=ref,before_error=abs(av-ref),after_error=abs(bv-ref),farther=av!=bv and abs(bv-ref)>abs(av-ref),same_input=True,reference_source=source))
for file,original in models.items():
 for test in contributing_tests(original):
  m={**original,'test':test}
  if m['analysis']!='solve_3d' or 'Ok' not in m['result']:continue
  test=m['test'];model=m['input'][0]
  if test=='benchmark_protocol::benchmark_protocol_roof':
   ymax=max(n['y'] for n in model['nodes'].values());node=next(n['id'] for n in model['nodes'].values() if n['x']==0 and n['y']==ymax)
   spec=json.loads((p/'repo/engine/tests/benchmarks/spec/scordelis-lo.json').read_text())
   for ref in spec['references']:append(file,m,'uz',ref['value'],'scordelis-lo '+ref['citation'],node=node,absolute=False)
  elif test.endswith('validation_vm41_3d_l_frame_out_of_plane'):
   tip=max(n['id'] for n in model['nodes'].values());l=max(n['x'] for n in model['nodes'].values());h=max(n['z'] for n in model['nodes'].values());mat=model['materials']['1'];sec=model['sections']['1'];e=mat['e']*1000;g=e/(2*(1+mat['nu']));force=next(x['data']['fy'] for x in model['loads'] if x['type']=='nodal');ref=force*l**3/(3*e*sec['iz'])+force*h**3/(3*e*sec['iz'])+force*h**2*l/(g*sec['j']);append(file,m,'uy',ref,'VM41 bending plus torsion, test source',node=tip)
  elif test.endswith('validation_nafems_r0031_3d_beam_bending'):
   tip=max(n['id'] for n in model['nodes'].values());l=max(n['x'] for n in model['nodes'].values());e=model['materials']['1']['e']*1000;sec=model['sections']['1'];force=next(x['data'] for x in model['loads'] if x['type']=='nodal')
   refs={'ux':force['fx']*l/(e*sec['a']),'uy':abs(force['fy'])*l**3/(3*e*sec['iz']),'uz':force['fz']*l**3/(3*e*sec['iy']),'rz':abs(force['fy'])*l**2/(2*e*sec['iz']),'ry':force['fz']*l**2/(2*e*sec['iy'])}
   for component,ref in refs.items():append(file,m,component,ref,'NAFEMS R0031 cantilever, test source',node=tip,absolute=component!='ux')
   for component in ['fx','fy','fz']:append(file,m,component,-force[component],'NAFEMS R0031 global equilibrium, test source',reactions=True)
sources={r['id']:r for r in d['rows']}
for row in rows:
 source=sources.get(row['id'],{})
 row['comparison_mode']='identical frozen input'
 row['reference_kind']=source.get('reference_kind','source formula or published target')
 row['pr']=source.get('pr') if row['before']!=row['after'] else None
 row['first_parent_merge']=next(iter(source.get('first_parent_merges',[])),None) if row['pr'] else None
 if row['first_parent_merge']:row['evidence']='all-static-bisection.json.gz'
 prior=previous.get((row['id'],row['model']),{})
 if (prior.get('before'),prior.get('after'))==(row['before'],row['after']):
  for key in ['comparison_mode','reference_kind','pr','first_parent_merge','evidence']:
   if key in prior:row[key]=prior[key]
d['frozen_primary_comparisons']=rows;d['frozen_farther']=[r for r in rows if r['farther']];d['unresolved_frozen_measurements']=unresolved;d['farther']=[r for r in d['rows'] if r['farther']]
(p/'reference-comparisons.json').write_text(json.dumps(d,indent=2));print('shipped rows',len(d['rows']),'farther',len(d['farther']),'frozen primary',len(rows),'farther',len(d['frozen_farther']),'unresolved',len(unresolved));print('no farther model',[r['id'] for r in d['farther'] if not r['models']])
