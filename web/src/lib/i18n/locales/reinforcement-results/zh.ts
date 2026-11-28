import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.confinementUnassessed": "约束未通过验算。绘制柱配筋详图前，请核实记录的轴力和箍筋布置。",
  "detailing.cutoff.unverified": "梁 {element}，x = {x} m。局部抗剪承载力和配筋不足以证明钢筋可在此处截断。",
  "detailing.schedule.spliceNote": "编号 {mark}（{length} m）长于 {stock} m 的定尺钢筋，需要搭接。",
  'project.adoptedReinforcementIgnored': "此版本忽略项目中保存的已选用配筋，使用设计配筋。",
  'wall.boundaryBarCount': "墙体每一端的边缘钢筋根数必须为非负整数。",
  'wall.tensionAtOpenings': "带洞口墙的受拉验算需要净截面及贯穿该截面的连续钢筋。",
  'wall.tensionRequiresBarLayout': "拉弯组合验算需要竖向钢筋的布置。",
  'wall.tensionShearEdition': "无法按 {edition} 版验算墙体的拉剪组合作用。",
};

export default messages;
