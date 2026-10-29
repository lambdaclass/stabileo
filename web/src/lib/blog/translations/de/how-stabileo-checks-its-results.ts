import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Wie wir die Ergebnisse von Stabileo prüfen und wo die Prüfungen enden",
  "excerpt": "Der Rechenkern, die formale Verifikation und die KI: wie wir nach Fehlern in den Zahlen suchen, die Stabileo liefert, was die Zertifikate beweisen und was keine Verifikation garantieren kann.",
  "blocks": [
    {
      "k": "p",
      "t": "Ein Statikprogramm kann eine falsche Zahl liefern, ohne dass irgendetwas darauf hindeutet. In den letzten Wochen haben wir jeden Teil von Stabileo auf mehreren unabhängigen Wegen getestet, Dutzende echter Fehler gefunden, viele davon auf der unsicheren Seite, und die meisten behoben. Jeder wird bewertet und, falls er bereits verwendete Ergebnisse beeinflusst haben könnte, als Sicherheitshinweis veröffentlicht, zusammen mit dem, was bis dahin zu tun ist; einige werden noch bewertet. Dieser Beitrag erklärt, wie wir nach diesen Fehlern suchen, was die Zertifikate beweisen, die mit den Ergebnissen geliefert werden, und, ebenso offen, was außerhalb jeder Verifikation liegt."
    },
    {
      "k": "h",
      "t": "Ein Rechenkern"
    },
    {
      "k": "p",
      "t": "Der Rechenkern ist in Rust geschrieben und nach WebAssembly kompiliert: Er läuft auf dem eigenen Rechner des Nutzers, ohne Installation und ohne das Modell an einen Server zu senden. Es ist derselbe Code, der in der kontinuierlichen Integration läuft. Im Oktober 2026 haben wir die parallelen TypeScript-Berechnungen entfernt, die den Rechenkern stillschweigend ersetzten, wenn er nicht verfügbar war: Die Anwendung sagt das jetzt, statt mit einer unverifizierten Kopie zu rechnen."
    },
    {
      "k": "h",
      "t": "Fünf Wege, nach Fehlern zu suchen"
    },
    {
      "k": "p",
      "t": "Kein einzelner Test findet jeden Fehler, deshalb verwenden wir mehrere, die auf unterschiedliche Weise versagen:"
    },
    {
      "k": "ul",
      "items": [
        "Vergleich mit anderen Programmen. Dieselben Modelle, feste und jede Nacht neu erzeugte zufällige, werden mit OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos und CalculiX berechnet. Jeder Unterschied wird untersucht, bis wir wissen, ob der Fehler bei uns liegt oder ob die beiden Programme den Fall unterschiedlich modellieren.",
        "Veröffentlichte Referenzen. Eine Abnahmesuite aus Fällen, deren Ergebnisse von ihren Autoren veröffentlicht wurden, nicht von einem anderen kommerziellen Programm, mit Toleranzen nach der in der Quelle angegebenen Genauigkeit. Bemessungsnachweise werden mit veröffentlichten Rechenbeispielen verglichen (INTI-CIRSOC, AISC und andere).",
        "Physikalische Invarianten. Ein Modell zu drehen, zu spiegeln, umzunummerieren oder seine Einheiten zu ändern, muss die Antwort genau so verändern, wie es die Physik vorgibt; Superposition, Reziprozität und Energiebilanz müssen erfüllt sein. Diese Tests brauchen überhaupt keinen Referenzwert.",
        "Herleitungen. Die Elementmatrizen der Rahmenelemente werden symbolisch aus den Grundprinzipien hergeleitet und Term für Term mit denen im Code verglichen; für die übrigen Elemente gibt es schriftliche Herleitungen, die ein anderer Ingenieur prüfen kann.",
        "Fuzzing und Mutationstests. Millionen erzeugter Eingaben suchen nach Abstürzen und nicht endlichen Ergebnissen, und absichtlich in den Code eingebaute Fehler prüfen, ob die Tests sie erkennen."
      ]
    },
    {
      "k": "table",
      "caption": "Einige Zahlen der Verifikationsarbeit, aus den Dokumenten im Repository.",
      "head": [
        "Was",
        "Anzahl"
      ],
      "rows": [
        [
          "Unabhängige Finite-Elemente-Programme im Vergleich",
          "7"
        ],
        [
          "Abnahmefälle mit veröffentlichten Ergebnissen",
          "12"
        ],
        [
          "Veröffentlichte Referenzwerte in diesen Fällen",
          "105"
        ],
        [
          "Lean-Sätze, deren Axiome die kontinuierliche Integration prüft",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "Die 105 Referenzwerte sind überwiegend Eigenfrequenzen von Gebäuderahmen (SAC, IASC-ASCE, Bathe und Wilson). Sie decken die Modalanalyse und die lineare Berechnung von Rahmen gut ab; für andere Berechnungsarten sind sie kein Beleg."
    },
    {
      "k": "h",
      "t": "Zertifikate: ein Ergebnis mit Fehlerschranke"
    },
    {
      "k": "p",
      "t": "Für Ergebnisse, bei denen das möglich ist, versucht Stabileo im Hintergrund zusätzlich ein Zertifikat zu erstellen: eine mit Intervallarithmetik berechnete Schranke, die die exakte Lösung des gelösten Systems enthält. Gelingt das nicht, wird das Ergebnis mit Angabe des Grundes als nicht zertifiziert markiert. Die Schranke gilt für den numerischen Fehler, nicht für den Diskretisierungsfehler des Netzes oder des Zeitschritts. Für die lineare Berechnung, Kombinationen, die Modalanalyse und den plastischen Kollaps ist die Kernmathematik dieser Schranke in Lean bewiesen, einem Beweisassistenten, in dem der Computer jeden Schritt prüft; einige Schritte (Bindungen, eine Bedingung des modalen Nachweises) sind noch nicht formalisiert. Auch P-Delta-, Spektral-, harmonische und Zeitverlaufsberechnungen haben Zertifikate, ihre Mathematik ist aber noch nicht in Lean formalisiert. Die kontinuierliche Integration lehnt jeden unvollständigen Beweis und jedes hinzugefügte Axiom ab, und bei einigen Zertifikatsarten ist der Prüfer, der ausgeführt wird, genau der Lean-Code, um den es in den Beweisen geht."
    },
    {
      "k": "h",
      "t": "Was die Zertifikate nicht aussagen"
    },
    {
      "k": "ul",
      "items": [
        "Ein Zertifikat begrenzt den Fehler beim Lösen des Systems, so wie es aufgestellt wurde. Es beweist nicht, dass das System das Modell abbildet: Die Assemblierung der Steifigkeitsmatrix und der Lasten wird auf die oben beschriebenen Weisen getestet, aber nicht zertifiziert. Als das Drillknicken fehlte (SA-2026-007), zertifizierte das Zertifikat das falsche Problem. Seit 0.3.0 stellen durchgängige Zertifikate das System für Rahmen und Fachwerke unabhängig neu auf und prüfen das Ergebnis gegen das Modell selbst; Schalen, Volumenelemente und Verbindungselemente sind noch nicht abgedeckt.",
        "Lean beweist die Mathematik; dass der Rust-Code genau diesen Algorithmus umsetzt, ist nicht bewiesen, außer bei den Prüfern, die selbst Lean-Code sind.",
        "Die zertifizierten Bemessungsnachweise werten ihre Formeln in Intervallarithmetik aus, die Formeln selbst sind aber nicht formalisiert: Sie werden mit veröffentlichten Rechenbeispielen verglichen, wo es solche gibt, und die Abdeckung jeder Norm (welche Abschnitte, welche Beispiele) steht in der Reifegradmatrix. Mauerwerk, Anschlüsse, Gründungen und Gebrauchstauglichkeit sind nicht zertifiziert.",
        "Keine Verifikation des Programms verifiziert das Modell. Lasten, Auflager und Idealisierung sind Entscheidungen des Ingenieurs; die Modellprüfung warnt vor häufigen Fehlern, ersetzt aber nicht das Urteilsvermögen.",
        "Eine unabhängige Prüfung durch einen zugelassenen Tragwerksplaner hat es noch nicht gegeben. Ergebnisse nach CIRSOC 301 sind weiterhin als experimentell gekennzeichnet."
      ]
    },
    {
      "k": "h",
      "t": "Die KI entwirft und prüft; sie rechnet nicht"
    },
    {
      "k": "p",
      "t": "Der KI-Assistent entwirft Modelle aus einer Beschreibung und prüft bestehende, berechnet aber keine Ergebnisse: Die Zahlen stammen aus dem Rechenkern und den Bemessungsmodulen der Anwendung. Seine Erklärungen sind Text eines Sprachmodells und können falsch sein; maßgebend sind die Werte in den Ergebnissen. Bevor eine Änderung angewendet wird, zeigt er, was er ändern wird, und sie lässt sich in einem Schritt rückgängig machen. Die KI-Funktionen senden die Beschreibung und das Modell an einen Server, der ein Sprachmodell abfragt; Rechenkern, Ergebnisse und Nachweise brauchen ihn nicht und funktionieren offline."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Warum ein KI-Agent nicht rechnen sollte, an einem durchgerechneten Beispiel:"
    },
    {
      "k": "h",
      "t": "Wenn etwas versagt"
    },
    {
      "k": "p",
      "t": "Fehler, die bereits verwendete Ergebnisse beeinflusst haben könnten, werden als Sicherheitshinweise veröffentlicht, mit Angaben dazu, wie man ein betroffenes Modell erkennt und was bis dahin zu tun ist; andere sicherheitsrelevante Fehler werden noch bewertet und aufgenommen, wenn sie einen Hinweis rechtfertigen. Offene Sicherheitshinweise werden geschlossen, sobald die Korrektur auf stabileo.com online ist."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Die veröffentlichten Sicherheitshinweise und ihr Status:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/TRUSTED_BASE.md",
      "label": "Vertrauensbasis der Zertifikate",
      "t": "Was bewiesen, was getestet und was vorausgesetzt wird, Komponente für Komponente:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Reifegradmatrix der Verifikation",
      "t": "Für jede Berechnung, jedes Element und jede Bemessungsnorm der erreichte Verifikationsgrad und die Belege:"
    }
  ]
};

export default body;
