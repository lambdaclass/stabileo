import type { Locale } from '../src/lib/i18n/offered';

// Independent copy expectations: changes to the pricing policy must update this contract.
export const PRICING = {
  "en": {
    "modules": [
      "Basic",
      "PRO · Analysis",
      "PRO · Code design",
      "Stabileo AI",
      "Education"
    ],
    "audiences": [
      "Firms and individuals",
      "Universities"
    ],
    "free": "Free",
    "paid": "Paid",
    "atCost": "Paid at cost",
    "intro": "The core program, for structural analysis in the browser, is open source and free for everyone. Some specialised modules are paid; universities get those modules free. Stabileo AI and heavy cloud compute are paid by everyone, universities included, priced to cover what they cost.",
    "notes": [
      "Some specialised modules are paid; universities get those modules free.",
      "Stabileo AI and heavy cloud compute are paid by everyone, universities included, priced to cover what they cost."
    ]
  },
  "es": {
    "modules": [
      "Básico",
      "PRO · Cálculo",
      "PRO · Diseño normativo",
      "Stabileo IA",
      "Educativo"
    ],
    "audiences": [
      "Empresas y particulares",
      "Universidades"
    ],
    "free": "Gratis",
    "paid": "Pago",
    "atCost": "Pago al costo",
    "intro": "El programa principal, para análisis estructural en el navegador, es de código abierto y gratuito para todos. Algunos módulos especializados son pagos; las universidades los reciben gratis. Stabileo IA y el cómputo intensivo en la nube son pagos para todos, incluidas las universidades, a un precio que cubre su costo.",
    "notes": [
      "Algunos módulos especializados son pagos; las universidades los reciben gratis.",
      "Stabileo IA y el cómputo intensivo en la nube son pagos para todos, incluidas las universidades, a un precio que cubre su costo."
    ]
  },
  "pt": {
    "modules": [
      "Básico",
      "PRO · Cálculo",
      "PRO · Projeto normativo",
      "Stabileo IA",
      "Educacional"
    ],
    "audiences": [
      "Empresas e particulares",
      "Universidades"
    ],
    "free": "Grátis",
    "paid": "Pago",
    "atCost": "Pago a preço de custo",
    "intro": "O programa principal, para análise estrutural no navegador, é de código aberto e gratuito para todos. Alguns módulos especializados são pagos; as universidades recebem esses módulos gratuitamente. O Stabileo IA e a computação intensiva na nuvem são pagos por todos, inclusive pelas universidades, a um preço que cobre seu custo.",
    "notes": [
      "Alguns módulos especializados são pagos; as universidades recebem esses módulos gratuitamente.",
      "O Stabileo IA e a computação intensiva na nuvem são pagos por todos, inclusive pelas universidades, a um preço que cobre seu custo."
    ]
  },
  "de": {
    "modules": [
      "Basis",
      "PRO · Berechnung",
      "PRO · Bemessung nach Norm",
      "Stabileo AI",
      "Lehre"
    ],
    "audiences": [
      "Unternehmen und Privatpersonen",
      "Universitäten"
    ],
    "free": "Kostenlos",
    "paid": "Kostenpflichtig",
    "atCost": "Zum Selbstkostenpreis",
    "intro": "Das Kernprogramm für die Tragwerksberechnung im Browser ist Open Source und für alle kostenlos. Einige spezialisierte Module sind kostenpflichtig; Universitäten erhalten diese Module kostenlos. Stabileo AI und rechenintensive Cloud-Berechnungen sind für alle kostenpflichtig, auch für Universitäten. Der Preis deckt die anfallenden Kosten.",
    "notes": [
      "Einige spezialisierte Module sind kostenpflichtig; Universitäten erhalten diese Module kostenlos.",
      "Stabileo AI und rechenintensive Cloud-Berechnungen sind für alle kostenpflichtig, auch für Universitäten. Der Preis deckt die anfallenden Kosten."
    ]
  },
  "fr": {
    "modules": [
      "Basique",
      "PRO · Calcul",
      "PRO · Dimensionnement réglementaire",
      "Stabileo AI",
      "Enseignement"
    ],
    "audiences": [
      "Entreprises et particuliers",
      "Universités"
    ],
    "free": "Gratuit",
    "paid": "Payant",
    "atCost": "Au prix coûtant",
    "intro": "Le programme principal, pour l’analyse de structures dans le navigateur, est open source et gratuit pour tout le monde. Certains modules spécialisés sont payants ; les universités les obtiennent gratuitement. Stabileo IA et les calculs lourds dans le cloud sont payants pour tout le monde, universités comprises, à un prix qui couvre leur coût.",
    "notes": [
      "Certains modules spécialisés sont payants ; les universités les obtiennent gratuitement.",
      "Stabileo IA et les calculs lourds dans le cloud sont payants pour tout le monde, universités comprises, à un prix qui couvre leur coût."
    ]
  },
  "tr": {
    "modules": [
      "Temel",
      "PRO · Analiz",
      "PRO · Yönetmeliğe göre tasarım",
      "Stabileo AI",
      "Eğitim"
    ],
    "audiences": [
      "Şirketler ve bireyler",
      "Üniversiteler"
    ],
    "free": "Ücretsiz",
    "paid": "Ücretli",
    "atCost": "Maliyeti karşılayan ücret",
    "intro": "Tarayıcıda yapı analizi sağlayan temel program açık kaynaklıdır ve herkes için ücretsizdir. Bazı uzmanlaşmış modüller ücretlidir; üniversiteler bu modülleri ücretsiz alır. Stabileo AI ve yoğun bulut hesaplamaları, üniversiteler dahil herkes için ücretlidir; fiyatları maliyetlerini karşılayacak şekilde belirlenir.",
    "notes": [
      "Bazı uzmanlaşmış modüller ücretlidir; üniversiteler bu modülleri ücretsiz alır.",
      "Stabileo AI ve yoğun bulut hesaplamaları, üniversiteler dahil herkes için ücretlidir; fiyatları maliyetlerini karşılayacak şekilde belirlenir."
    ]
  }
} satisfies Record<Locale, { modules: string[]; audiences: string[]; free: string; paid: string; atCost: string; intro: string; notes: string[] }>;

// Obsolete development/education exemptions must not survive elsewhere on the page.
export const OBSOLETE_PRICING: Record<Locale, RegExp> = {
  en: /free (?:during|while|throughout)|(?:everything|all modules) (?:is |are )?free|(?:education|universities).{0,40}without exceptions/i,
  es: /gratis (?:durante|mientras)|gratuito (?:durante|mientras)|todo (?:es )?gratis|sin excepciones/i,
  pt: /grátis (?:durante|enquanto)|gratuito (?:durante|enquanto)|tudo (?:é )?grátis|sem exceções/i,
  de: /kostenlos (?:während|solange)|(?:während|solange)[^.]*kostenlos|alles (?:ist )?kostenlos|ohne Ausnahmen/i,
  fr: /gratuit(?:e|s)? (?:pendant|durant|tant que)|tout est gratuit|sans exception/i,
  tr: /geliştirme (?:süresince|boyunca|aşamasında)[^.]*ücretsiz|her şey ücretsiz|istisnasız/i,
};

