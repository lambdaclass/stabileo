import type { Translations } from '../../types';

const messages: Translations = {
  "foundation.inconsistentPlateSprings": "各节点弹簧必须符合相应板的地基反力系数、脱离设置及水平约束。请核查各板并重新应用地基设置。",
  "foundation.mixedSoilSelection": "单个壳单元与整块弹性地基板共用地基节点。请分开指定，或选择设置兼容的整板。",
  "diag.model.flangeTwice": "T 形截面梁上方的板也被建模：翼缘在刚度中被计入两次。建议将腹板建为矩形、板建为壳；翼缘在设计数据中于配筋时考虑。",
  "diag.tooltip.MODEL_FLANGE_TWICE": "T 形截面与已建模的板：翼缘计入两次",
  "pro.plates.diag.looseCorner": "板中有节点未连接到任何杆件、支座或其他板，这些节点无法传递荷载",
  "plates.meshedAtAnalysisKept": "分析前已对 {n} 块板划分网格（{cells} 个单元），其余 {kept} 块保留原有网格。",
  "svc.engine.conflictingConstraints": "自由度 {dof}（节点 {node}）受 {n} 个约束绑定，仅最后一个生效",
  "diag.detail.nodes": "节点",
  "diag.detail.cases": "工况",
  "diag.detail.computed": "计算值",
  "diag.detail.limit": "限值",
  "diag.detail.ratio": "比值",
  "diag.detail.value": "数值",
  "diag.detail.dofIndices": "自由度",
  "diag.detail.n": "数量",
  "diag.detail.add": "待添加",
  "diag.detail.change": "待修改",
  "diag.detail.remove": "待删除",
  "plates.analysisStale": "这些板按已过期的网格求解：{names}。该网格仍然有效，但未跟随模型的最新变更；请重新划分网格，或开启“分析前划分网格”。",
  "xls.err.duplicatePhysicalColumn": "表示同一物理量的列 {k} 出现了多次。",
  "xls.err.duplicateLoadSheet": "只允许有一张名为 {sheet} 的工作表。",
  "plates.diag.looseCorner": "板中有节点未连接到任何杆件、支座或其他板，这些节点无法传递荷载",
};

export default messages;
