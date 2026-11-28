import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "무료 오픈 소스 ETABS 대안",
  "description": "사용 중인 ETABS 작업 흐름과 Stabileo를 비교해 보십시오: 무료 브라우저 해석, 오픈 소스, 검증 근거, 현재의 한계, 계획된 가져오기.",
  "eyebrow": "무료 오픈 소스 ETABS 대안",
  "lead": "Stabileo는 브라우저에서 무료 오픈 소스 구조 해석을 제공합니다. ETABS 작업 흐름에 맞는지는 필요한 해석과 검토에 달려 있으며, 기능이 동등하다고 주장하는 것은 아닙니다.",
  "blocks": [
    {
      "k": "h",
      "t": "Stabileo가 현재 다루는 것"
    },
    {
      "k": "p",
      "t": "해석기 기능 행렬에는 2D와 3D 선형 정적 해석, 골조와 트러스, 하중조합과 포락선, P-Delta, 좌굴, 고유치 해석이 기록되어 있습니다. 판과 쉘 계열도 문서화되어 있습니다. Basic과 PRO 해석은 제공되며, 기준 설계와 AI 어시스턴트는 개발 중입니다."
    },
    {
      "k": "p",
      "t": "건물 작업 흐름에서는 해석기의 판과 쉘 기능과 슬래브, 벽, 복잡한 모델을 위한 PRO 인터페이스를 구별해야 합니다. PRO의 기준 설계는 아직 개발 중이며, 해석기에 기능이 있다고 해서 완전한 건물 설계 작업 흐름이 준비되었다는 뜻은 아닙니다."
    },
    {
      "k": "h",
      "t": "현재의 한계"
    },
    {
      "k": "p",
      "t": "SAP2000/ETABS 모델 가져오기는 계획 중이며 아직 제공되지 않습니다. .s2k나 .e2k 파일을 열 수 있다고 기대하지 마십시오. 기능 행렬에는 비선형 안정성, 프레임/쉘 혼합 케이스, 대형 모델 검증에서 남은 공백이 기록되어 있습니다. AI 어시스턴트는 개발 중이며 나중에 제공됩니다."
    },
    {
      "k": "h",
      "t": "결과를 어떻게 검증하는가"
    },
    {
      "k": "p",
      "t": "공개된 벤치마크, 독립 구현과의 비교, 테스트는 서로 다른 수준의 근거를 제공합니다. 지원되는 해석과 설계 검토는 기계로 검증된 한계를 가질 수 있으며, 이것이 모든 결과나 공학 모델을 인증하는 것은 아닙니다. 성숙도 행렬에는 각 계열의 근거와 열려 있는 이슈가 나열되어 있습니다."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "해석기 기능",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "검증 성숙도",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "제품 로드맵",
      "t": ""
    }
  ],
  "faqTitle": "출처와 범위",
  "faq": [
    {
      "q": "ETABS를 완전히 대체할 수 있습니까?",
      "a": "기능별 동등성을 주장하지 않습니다. 문서화된 기능과 한계를 프로젝트에 맞게 검토하십시오. ETABS는 비교 대상 작업 흐름을 밝히기 위해서만 언급하며, 제휴나 보증을 뜻하지 않습니다."
    }
  ]
};

export default body;
