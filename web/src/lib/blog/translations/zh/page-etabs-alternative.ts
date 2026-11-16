import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "ETABS 的免费开源替代方案",
  "description": "将 Stabileo 与您的 ETABS 工作流程比较：免费的浏览器分析、开源、验证依据、当前限制和计划中的导入。",
  "eyebrow": "ETABS 的免费开源替代方案",
  "lead": "Stabileo 在浏览器中提供免费、开源的结构分析。它是否适合您的 ETABS 工作流程，取决于您需要的分析和验算；这并不声称功能对等。",
  "blocks": [
    {
      "k": "h",
      "t": "Stabileo 目前涵盖的内容"
    },
    {
      "k": "p",
      "t": "求解器功能矩阵记录了 2D 和 3D 线性静力分析、框架与桁架、荷载组合与包络、P-Δ、屈曲和模态分析，同时也记录了板和壳单元族。基础模式和 PRO 的分析均可使用；规范设计和 AI 助手尚在开发中。"
    },
    {
      "k": "p",
      "t": "对于建筑工作流程，请区分求解器的板壳能力与 PRO 中用于楼板、墙和复杂模型的界面。PRO 中的规范设计仍在开发中；求解器具备某项功能，并不意味着完整的建筑设计工作流程已就绪。"
    },
    {
      "k": "h",
      "t": "当前限制"
    },
    {
      "k": "p",
      "t": "SAP2000/ETABS 模型导入已列入计划，目前不可用。请不要期望能打开 .s2k 或 .e2k 文件。功能矩阵记录了在非线性稳健性、框架与壳混合情形以及较大模型验证方面的剩余差距。AI 助手尚在开发中，稍后推出。"
    },
    {
      "k": "h",
      "t": "结果如何验证"
    },
    {
      "k": "p",
      "t": "已发表的基准算例、与独立实现的比较和测试，提供不同层次的依据。受支持的分析和设计验算可以带有机器检验的界；这并不为每个结果或工程模型提供认证。成熟度矩阵列出了每类功能的依据和未解决的问题。"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "求解器功能",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "验证成熟度",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "产品路线图",
      "t": ""
    }
  ],
  "faqTitle": "来源与范围",
  "faq": [
    {
      "q": "这是对 ETABS 的完整替代吗？",
      "a": "我们不声称与其功能一一对等。请针对您的项目查阅已记录的功能和限制。提到 ETABS 仅为说明所比较的工作流程，并不暗示任何隶属关系或认可。"
    }
  ]
};

export default body;
