import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Eine kostenlose Open-Source-Alternative zu SAP2000, im Browser",
  "description": "Stabileo: kostenlose Open-Source-Statik im Browser. 2D/3D-Rahmen, Schalen, P-Delta, Modal- und Spektrenanalyse, Nachweise nach AISC, ACI, Eurocode und CIRSOC.",
  "eyebrow": "Alternative zu SAP2000",
  "lead": "Stabileo ist kostenlose Open-Source-Software (AGPL-3.0) für die Tragwerksberechnung, die im Browser läuft, ohne Installation, Lizenzschlüssel oder Konto. Der Rechenkern ist in Rust geschrieben und nach WebAssembly kompiliert, sodass das Modell auf Ihrem eigenen Computer berechnet wird. Im Basis-Modus modellieren, belasten und berechnen Sie Rahmen und Fachwerke in 2D und 3D und lesen die Ergebnisse ab; der PRO-Modus, in Entwicklung und für alle offen, ergänzt Decken und Wände, DXF- und IFC-Import, Lasten nach Norm und Stabnachweise.",
  "blocks": [
    {
      "k": "h",
      "t": "Wann es eine gute Alternative ist"
    },
    {
      "k": "ul",
      "items": [
        "Rahmen, Fachwerke und Gebäude berechnen, ohne für eine Lizenz zu bezahlen oder etwas zu installieren, auf jedem Betriebssystem mit einem aktuellen Browser.",
        "Ergebnisse eines anderen Programms überprüfen: Stabileo wird mit sieben anderen Finite-Elemente-Programmen verglichen, und jede Zeile seines Codes lässt sich lesen.",
        "Lehren und Lernen: Es zeigt das Weggrößenverfahren Schritt für Schritt.",
        "Stahl- und Betonbauteile nach AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 und den argentinischen CIRSOC-Normen nachweisen, im PRO-Modus."
      ]
    },
    {
      "k": "h",
      "t": "Wann noch nicht"
    },
    {
      "k": "ul",
      "items": [
        "Wenn Sie die Bandbreite an Bemessungsnormen und die jahrzehntelange Bewährung eines etablierten kommerziellen Programms brauchen: Der PRO-Modus ist noch in Entwicklung.",
        "Wenn Ihr Büro Software verlangt, die von einem zugelassenen Ingenieur unabhängig geprüft wurde: Diese Prüfung hat noch nicht stattgefunden."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Wie wir die Ergebnisse prüfen und wo die Prüfungen enden:"
    }
  ],
  "faqTitle": "Häufige Fragen",
  "faq": [
    {
      "q": "Was ist die beste kostenlose Alternative zu SAP2000?",
      "a": "Das hängt davon ab, wofür Sie SAP2000 verwenden. Für die Berechnung von Rahmen, Fachwerken und Schalen in 2D und 3D im Browser, ohne etwas zu installieren, ist Stabileo kostenlos und Open Source. Für skriptgesteuerte nichtlineare Berechnungen in der Forschung ist OpenSees die seit Langem etablierte Open-Source-Option."
    },
    {
      "q": "Kann ich Stabileo verwenden, statt für eine SAP2000- oder ETABS-Lizenz zu bezahlen?",
      "a": "Für die Berechnung von Rahmen, Fachwerken und vielen Gebäuden und für Stabnachweise nach AISC 360, ACI 318, den Eurocodes und CIRSOC ja, und zwar kostenlos. Für die volle Bandbreite an Bemessungsnormen und eine lange Bewährung in der Praxis bieten kommerzielle Programme noch mehr; der PRO-Modus von Stabileo ist in Entwicklung."
    },
    {
      "q": "Ist Stabileo wirklich kostenlos?",
      "a": "Die Berechnung (Basis und PRO) ist für alle kostenlos. Die normgemäße Bemessung ist kostenlos, solange sie in Entwicklung ist, und bleibt danach kostenlos für öffentliche Universitäten und für alle, die sich an ihrer Entwicklung beteiligen. Der KI-Assistent wird kostenpflichtig sein. Der Code steht unter AGPL-3.0."
    },
    {
      "q": "Läuft es auf Mac oder Linux?",
      "a": "Ja. Es läuft in jedem aktuellen Browser, auf jedem Betriebssystem."
    }
  ]
};

export default body;
