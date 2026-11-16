from audit_evidence import contributing_tests
import json,pathlib,collections,sys
import importlib.util
spec=importlib.util.spec_from_file_location('annotate_references',pathlib.Path(__file__).with_name('annotate-references.py'));annotation=importlib.util.module_from_spec(spec);spec.loader.exec_module(annotation);macneal_case=annotation.macneal_case

def main(p):
 d=json.loads((p/'reference-comparisons.json').read_text());models={f.name:json.loads(f.read_text()) for f in (p/'base-fixed-native').glob('*.json')};cases={c['id']:c for c in json.loads((p/'base/engine/tests/benchmarks/macneal_harder.json').read_text())['cases']}
 previous={(r['id'],r['model']):r for r in d.get('frozen_primary_comparisons',[])}
 fallback={'benchmark_curved_shell_hemisphere_8x8':{2:81},'benchmark_q9_navier_plate':{2:289},'benchmark_ss_navier_plate':{0:50},'benchmark_ss_scordelis_lo':{0:98,1:162}}
 rows=[];unresolved=[]
 def comparison(file,m,identity,selector,measure,reference,**extra):
  before=m['result']['Ok'];head=json.loads((p/'repo-fixed-native'/file).read_text())['result']
  av=measure(before);refused='Err' in head;bv=None if refused else measure(head['Ok'])
  row=dict(id=identity,model=file,test=m['test'],selector=selector,before=av,after=bv,reference=reference,before_error=abs(av-reference),after_error=None if refused else abs(bv-reference),farther=None if refused else av!=bv and abs(bv-reference)>abs(av-reference),same_input=True,status='refused at head' if refused else 'compared',**extra)
  if refused:row['head_result']=head
  rows.append(row)
  return row
 for r in d['rows']:
  annotation.classify_reference(r)
  if r['category']!='engineering_reference' or 'riks_' in r['test']:continue
  test=r['test'].split('::')[-1]
  if not r['models'] and test in fallback and r['observation'] in fallback[test]:
   count=fallback[test][r['observation']];r['models']=[f for f,m in models.items() if r['test'] in contributing_tests(m) and len(m['input'][0]['nodes'])==count];r['model_provenance']='Source mesh parameter and node count; full model variants retained.'
  if not r['models'] and test=='benchmark_curved_shell_hemisphere_8x8' and r['observation']==2:
   r['models']=[f for f,m in models.items() if m['analysis']=='solve_3d' and len(m['input'][0]['nodes'])==81 and len(m['input'][0].get('curvedShells',{}))==64 and m['input'][0]['nodes'].get('1',{}).get('x')==10.0]
  for file in r['models']:
   m=models[file];before=m['result'].get('Ok');after=json.loads((p/'repo-fixed-native'/file).read_text())['result'].get('Ok')
   if before is None:continue
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
   vals={(value(before,s),value(after,s) if after is not None else None) for s in selectors}
   if len(vals)!=1:unresolved.append(dict(id=r['id'],model=file,reason='Equal baseline components split; source selector needed',selectors=selectors));continue
   av,bv=vals.pop();
   if 'macneal' in r['test'] and after is not None:assert (av,bv)==(r['before'],r['after']),(r['id'],file,av,bv,r['before'],r['after'])
   comparison(file,{**m,'test':r['test']},r['id'],selectors[0],lambda result:value(result,selectors[0]),r['reference'])
 def append(file,m,component,reference,source,node=None,reactions=False,absolute=True):
  def measure(v):return sum(x[component] for x in v['reactions']) if reactions else (abs(next(x for x in v['displacements'] if x['nodeId']==node)[component]) if absolute else next(x for x in v['displacements'] if x['nodeId']==node)[component])
  comparison(file,m,source+':'+component,dict(node=node,component=component,reaction_sum=reactions,absolute=absolute and not reactions),measure,reference,reference_source=source)
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
  row['pr']=source.get('pr') if row['status']=='compared' and row['before']!=row['after'] else None
  row['first_parent_merge']=next(iter(source.get('first_parent_merges',[])),None) if row['pr'] else None
  if row['first_parent_merge']:row['evidence']='all-static-bisection.json.gz'
  prior=previous.get((row['id'],row['model']),{})
  if row['status']=='compared' and (prior.get('before'),prior.get('after'))==(row['before'],row['after']):
   for key in ['comparison_mode','reference_kind','pr','first_parent_merge','evidence']:
    if key in prior:row[key]=prior[key]
 d['coverage_counts']=dict(sorted(collections.Counter(r['category'] for r in d['rows']).items()))
 d['frozen_outcome_counts']={status:sum(r['status']==status for r in rows) for status in ['compared','refused at head']}
 d['frozen_primary_comparisons']=rows;d['frozen_farther']=[r for r in rows if r['farther']];d['unresolved_frozen_measurements']=unresolved;d['farther']=[r for r in d['rows'] if r['farther']]
 (p/'reference-comparisons.json').write_text(json.dumps(d,indent=2));print('shipped rows',len(d['rows']),'farther',len(d['farther']),'frozen primary',len(rows),'farther',len(d['frozen_farther']),'unresolved',len(unresolved),'outcomes',d['frozen_outcome_counts']);print('no farther model',[r['id'] for r in d['farther'] if not r['models']])

if __name__=='__main__':
 main(pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('/root/audit/soundness-2026-11-11'))
