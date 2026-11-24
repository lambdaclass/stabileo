import pathlib,re
root=pathlib.Path('engine/tests')
source=(root/'audit_capture.rs').read_text()
arm='"solve_plastic_2d_unrefused"=>serde_json::to_value(crate::solver::plastic::solve_plastic_2d_unrefused(&serde_json::from_value(input[0].clone()).unwrap())).unwrap(),\n'
source=source.replace('_=>panic!("unknown analysis"),',arm+'_=>panic!("unknown analysis"),')
source+='''
pub fn solve_plastic_2d_unrefused(input:&dedaliano_engine::types::PlasticInput)->Result<dedaliano_engine::solver::plastic::PlasticResult,String> {
let result=crate::solver::plastic::solve_plastic_2d_unrefused(input);
record("solve_plastic_2d_unrefused",serde_json::json!([input]),&result);
result
}
'''
(root/'audit_capture_lib.rs').write_text(source)
p=root/'unrefused/mod.rs'
text=p.read_text()
paths=[(p.parent/name).resolve() for name in re.findall(r'#\[path = "([^"]+)"\]',text)]
paths+=[p.parent/'metamorphic_plastic.rs']
if 'mod audit_capture_lib;' not in text:
 p.write_text(text+'\n#[path = "../audit_capture_lib.rs"]\nmod audit_capture_lib;\n')
for path in paths:
 if not path.is_file():continue
 s=path.read_text().replace('crate::audit_capture::','crate::unrefused_oracles::audit_capture_lib::')
 s=re.sub(r'(?<!fn )(?<![\w:])(?:(?:dedaliano_engine::)?solver::)?(?:plastic::)?solve_plastic_2d_unrefused\s*\(', 'crate::unrefused_oracles::audit_capture_lib::solve_plastic_2d_unrefused(',s)
 path.write_text(s)
