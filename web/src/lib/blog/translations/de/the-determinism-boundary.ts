import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Die Determinismusgrenze: warum ein KI-Agent nicht selbst rechnen darf",
  "excerpt": "Ein Sprachmodell kann nicht garantieren, dass eine Zahl stimmt. In der Architektur, die wir für die Tragwerksplanung vorschlagen, interpretiert der Agent und macht Vorschläge, und jede Zahl stammt aus einem verifizierten Rechenkern.",
  "blocks": [
    {
      "k": "p",
      "t": "Jahrzehnte kommerzieller Software haben den rein numerischen Teil der Tragwerksberechnung schnell gemacht. Eine Steifigkeitsmatrix aufzustellen und ein lineares Gleichungssystem zu lösen, ist ein gut verstandenes Problem und rechnerisch günstig. Die Zeit des Ingenieurs geht in andere Dinge: das Modell aufzubauen, es bei jeder Änderung der Architektur neu aufzubauen, Lasten und Kombinationen festzulegen, jedes Bauteil nach der Norm nachzuweisen und die statische Berechnung und die Pläne zu erstellen."
    },
    {
      "k": "p",
      "t": "Der Engpass ist diese Handarbeit rund um die Berechnung. Beim Aufbauen, Ändern, Nachweisen und Dokumentieren des Modells kann ein KI-Agent helfen, unter einer Bedingung: Die Berechnung selbst darf er nie anfassen."
    },
    {
      "k": "h",
      "t": "Was ein Sprachmodell nicht garantieren kann"
    },
    {
      "k": "p",
      "t": "Ein Sprachmodell erzeugt Text nach Wahrscheinlichkeiten. Es hat kein Wissen über Physik oder darüber, wie reale Systeme sich verhalten, und es kann halluzinieren: Antworten erzeugen, die plausibel klingen und keinen Sinn ergeben. In der Tragwerksberechnung ist das Risiko konkret. Modellieren erfordert räumliches Denken und topologische Konsistenz, und wenn ein Modell in mehreren Schritten aufgebaut wird, summieren sich die Fehler."
    },
    {
      "k": "p",
      "t": "Die stärkste Einschränkung kommt allerdings aus der Berufspraxis. Jedes statische Ergebnis wird unterschrieben, mit der Urheberschaft und der rechtlichen Haftung, die eine Unterschrift mit sich bringt. Die Zahl, nach der eine Stütze bemessen wird, ist eine Verpflichtung des zugelassenen Ingenieurs, der sie freigibt. Ein Agent, der ungeprüfte Ergebnisse übergibt, lässt den Fachmann mit dem Risiko allein, eine Berechnung zu unterschreiben, die niemand geprüft hat."
    },
    {
      "k": "quote",
      "t": "Die Richtigkeit muss eine Eigenschaft des Rechenkerns sein, nicht der Sprache."
    },
    {
      "k": "h",
      "t": "Die Determinismusgrenze"
    },
    {
      "k": "p",
      "t": "Die Architektur trennt das Denken in natürlicher Sprache von der numerischen Berechnung. Der Agent schlägt Entwürfe und Szenarien vor, aber ein Ergebnis zählt erst, wenn es aus einem Programm kommt, das der Agent nicht verändern kann und das die Physik des Problems abbildet. Das Modell wählt, welches deterministische Werkzeug es mit welchen Parametern aufruft, und arbeitet mit dem, was das Werkzeug zurückgibt. Es erzeugt nie eine eigene Zahl und erfindet nie Geometrie."
    },
    {
      "k": "p",
      "t": "In der Praxis braucht das drei Schichten. Die Absichtsschicht ist der Agent: Er interpretiert natürliche Sprache, stellt Rückfragen und gibt typisierte Aktionen aus. Die deterministische Berechnungsschicht enthält alles, was ingenieurtechnische Daten erzeugt: den Rechenkern, die CIRSOC-Module, die die Nachweise nach Norm führen, und die Generatoren, die eine Tragwerkstypologie zu einem vollständigen Modell ausbauen. Die Dokumentationsschicht erstellt Berichte, Pläne und Mengenermittlungen aus bereits berechneten Ergebnissen."
    },
    {
      "k": "p",
      "t": "Das Muster ist nicht neu. Es bestimmt die neuere Literatur über Ingenieuragenten und taucht in benachbarten Gebieten auf: Programmieragenten funktionieren, weil ein Compiler und eine Testsuite ihnen sagen, ob der Code kompiliert und die Tests besteht, und AlphaProof beweist Theoreme, weil ein formaler Verifizierer keinen Fehler durchlässt. Wir übernehmen es bewusst als Entwurfsprinzip."
    },
    {
      "k": "h",
      "t": "Was die Grenze garantiert und was außerhalb liegt"
    },
    {
      "k": "p",
      "t": "Es hilft, genau zu sagen, was diese Grenze garantiert und was sie offenlässt. Was sie garantiert:"
    },
    {
      "k": "ul",
      "items": [
        "Jede Zahl, die der Agent nennt, lässt sich auf ein bestimmtes Ergebnis des Rechenkerns zurückführen: Kombination, Auswertungsstelle, Stab.",
        "Jede Ausgabe der KI wird vor dem Import gegen das Modellschema geprüft und abgelehnt, wenn sie fehlerhaft ist oder unbekannte Felder enthält.",
        "Fällt der KI-Dienst aus, arbeiten der Rechenkern, der Editor und die Nachweise nach Norm weiter."
      ]
    },
    {
      "k": "p",
      "t": "Was sie nicht garantiert: dass das idealisierte Modell das richtige für das reale Problem ist (das ist eine ingenieurtechnische Entscheidung), dass der Entwurf optimal ist, dass Lasten und Annahmen vollständig sind oder dass die Auslegung der Norm keine Prüfung braucht."
    },
    {
      "k": "note",
      "t": "Die Grenze erlaubt Ihnen, zu kontrollieren, woher jedes Ergebnis stammt; sie garantiert nicht, dass das Modell, das Sie aufgestellt haben, das reale Problem richtig abbildet. Der Agent arbeitet wie ein technischer Zeichner: Er schlägt eine Änderung vor, der Nutzer sieht eine Zusammenfassung dessen, was geändert wird, und kann sie anwenden, neu anfordern oder verwerfen. Jede angewendete Änderung ist ein einziger Rückgängig-Schritt."
    },
    {
      "k": "h",
      "t": "Ein Fall, in dem das Modell neu berechnet werden muss"
    },
    {
      "k": "p",
      "t": "Der Ingenieur beschreibt einen Stahlbetonrahmen mit 6 m Spannweite und 4 m Höhe, eingespannten Stützenfüßen und einer Streckenlast auf dem Riegel. Der Agent fragt nach, was fehlt: Stahl oder Beton? Eingespannte oder gelenkige Stützenfüße? Gibt es eine Horizontallast? Dann gibt er die Aktion aus, die den Rahmen erzeugt. Das Backend baut sie deterministisch zu einem Modell mit 4 Knoten, 3 Stäben und 6 freien Freiheitsgraden aus. Der Entwurf verwendet Beton H-21, zunächst einen Balken 25×40 cm, Stützen 30×30 cm und 30 kN/m auf dem Balken."
    },
    {
      "k": "p",
      "t": "Nach der Berechnung trägt jede Stütze eine vertikale Auflagerreaktion von 90 kN, und das globale Gleichgewicht ist exakt erfüllt: ΣRz = 180 kN = q·L. Das maßgebende Balkenmoment ist Mu = 80,8 kN·m in Feldmitte. Der Biegenachweis nach CIRSOC 201 für den Balken 25×40 mit 3Ø16 ergibt eine Tragfähigkeit von φMn = 73,3 kN·m; der Balken erfüllt den Nachweis also nicht."
    },
    {
      "k": "table",
      "caption": "Biegenachweis des Rahmenriegels vor und nach der Korrektur.",
      "head": [
        "Zustand",
        "Querschnitt",
        "Bewehrung",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Erfüllt"
      ],
      "rows": [
        [
          "Anfänglich",
          "25×40 cm",
          "3Ø16",
          "80,8",
          "73,3",
          "1,10",
          "Nein"
        ],
        [
          "Korrigiert",
          "30×55 cm",
          "3Ø16",
          "105,6",
          "108,6",
          "0,97",
          "Ja"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Beachten Sie die Spalte Mu. Wird der Balken von 25×40 auf 30×55 vergrößert, steigt die Beanspruchung von 80,8 auf 105,6 kN·m. In einem statisch unbestimmten Rahmen legt die Statik die Summe aus Endmoment und Feldmoment fest; die Steifigkeit ändert nur, wie sich diese Summe aufteilt. Ein Balken, der im Verhältnis zu seinen Stützen steifer ist, erhält von ihnen weniger Endeinspannung und verhält sich eher wie ein Einfeldträger, sodass sein Feldmoment, das hier maßgebend ist, zunimmt."
    },
    {
      "k": "quote",
      "t": "Ein Agent, der die Wirkung schätzt, ohne neu zu berechnen, läge falsch und würde dabei genauso überzeugend klingen."
    },
    {
      "k": "p",
      "t": "Das Beispiel zeigt, warum das Modell neu berechnet werden muss, zusätzlich zur neuen Tragfähigkeit des geänderten Querschnitts. In einem statisch unbestimmten Tragwerk ändert die Vergrößerung eines Querschnitts die Verteilung der Schnittgrößen, und die Beanspruchung kann genau in dem Stab steigen, den man entlasten wollte."
    },
    {
      "k": "h",
      "t": "Eine Stütze aus einem bereits bemessenen Gebäude entfernen"
    },
    {
      "k": "p",
      "t": "Der zweite Fall geht von einem Rahmen mit vier Feldern zu 5 m und drei Geschossen zu 3 m aus, mit eingespannten Stützenfüßen, Balken 25×50 cm (4Φ16), Stützen 35×35 cm und 25 kN/m auf jedem Balken: 20 Knoten, 27 Stäbe und 45 freie Freiheitsgrade. Nach Berechnung und Nachweis erfüllen alle Balken die Nachweise mit Reserve."
    },
    {
      "k": "p",
      "t": "Eine Änderung der Architektur entfernt eine innere Stütze im Erdgeschoss. Die Bearbeitungsaktion löscht sie mit einer Prüfung der strukturellen Integrität, und das Modell wird neu berechnet; das globale Gleichgewicht ist vorher und nachher erfüllt (ΣRz = 1500 kN). Die Balken, die auf dieser Stütze auflagen, spannen jetzt 10 m und übernehmen zusammen mit den darüber liegenden Balken das verlorene Auflager. Sechs Balken überschreiten D/C = 1."
    },
    {
      "k": "table",
      "caption": "Der maßgebende Balken des Gebäudes in seinen drei Zuständen.",
      "head": [
        "Zustand",
        "Querschnitt",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Erfüllt"
      ],
      "rows": [
        [
          "Unverändert",
          "25×50 (4Φ16)",
          "54,2",
          "125,3",
          "0,43",
          "Ja"
        ],
        [
          "Stütze entfernt",
          "25×50 (4Φ16)",
          "203,9",
          "125,3",
          "1,63",
          "Nein"
        ],
        [
          "Neu bemessen",
          "30×65 (5Φ20)",
          "189,8",
          "313,7",
          "0,61",
          "Ja"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Das Moment des maßgebenden Balkens vervierfacht sich nahezu. Mit 30×65 cm und 5Φ20 in den betroffenen Balken und einer neuen Berechnung erfüllen wieder alle Balken die Nachweise. Der Fall zeigt auch, dass eine Änderung, die von Hand bedeutet, viele Stäbe neu zu modellieren, neu zu berechnen, neu nachzuweisen und neu zu bewehren, in einem kurzen Gespräch erledigt werden kann, wobei jede Zahl auf den Rechenkern zurückführbar ist und der Freigabe durch den Ingenieur unterliegt."
    },
    {
      "k": "h",
      "t": "Vier Entwurfsentscheidungen hinter der Grenze"
    },
    {
      "k": "ol",
      "items": [
        "Typisierte Aktionen statt frei erzeugtem Code. In mehreren früheren Systemen schreibt das Modell Python-Skripte, die dann gegen einen externen Rechenkern ausgeführt werden. Hier ist die Ausgabe des Agenten auf eine geschlossene Menge von Aufrufen mit expliziten Ein- und Ausgabeverträgen beschränkt, die jeweils vor der Ausführung gegen ein Schema geprüft werden. Diese Grenze ist enger als beliebiger Code und leichter zu prüfen.",
        "Ein eigener Rechenkern statt einer Schicht über einem fremden. Der Rechenkern ist von Grund auf in Rust geschrieben, ohne externe Abhängigkeiten für lineare Algebra, und hat eine eigene Verifikationssuite gegen analytische Lösungen und Referenz-Benchmarks: rund 6800 bestandene Tests, dazu Vergleiche mit einem kommerziellen Programm an denselben Modellen mit Abweichungen unter 0,1 %.",
        "Native Nachweise nach Norm. Nachweise nach CIRSOC 201 und 301, die wir in keiner Open-Source-Software nativ umgesetzt gefunden haben. Das Betonmodul ist umgesetzt und getestet; das Stahlmodul lebt noch ausschließlich im Frontend und hat keine eigene Testsuite. Wir sagen das, um seinen Reifegrad nicht zu überschätzen.",
        "Läuft im Browser. Der Rechenkern wird nach WebAssembly kompiliert und läuft lokal auf dem Rechner des Nutzers, ohne Rechenserver und ohne Installation."
      ]
    },
    {
      "k": "note",
      "t": "Aktualisierung, 20. Oktober 2026: Seit Version 0.2.0 prüft der Rechenkern jeden Stahlnachweis nach CIRSOC 301 nach (ein Ergebnis, das er nicht bestätigt, wird als nicht erfüllt oder als nicht verifiziert angezeigt), und das Modul wird gegen veröffentlichte Rechenbeispiele getestet; die Nachweise bleiben als experimentell gekennzeichnet, bis eine unabhängige Prüfung vorliegt. Die Zahlen in diesem Beitrag stammen aus dem veröffentlichten Paper und wurden mit der Version vom August 2026 berechnet, vor den Korrekturen an den Betonnachweisen in 0.2.0 (Sicherheitshinweis SA-2026-002); sie werden so wiedergegeben, wie sie dort stehen."
    },
    {
      "k": "h",
      "t": "Von einem getesteten zu einem bewiesenen Rechenkern"
    },
    {
      "k": "p",
      "t": "Die Grenze garantiert, dass jede Aussage des Agenten auf eine Ausgabe des Rechenkerns zurückgeführt werden kann. Diese Garantie erbt eine Einschränkung: Der Rechenkern ist vertrauenswürdig, weil er umfassend getestet ist, aber seine Korrektheit ist nicht formal bewiesen. Eine Testsuite, so gründlich sie sein mag, deckt nur die Fälle ab, an die ihre Autoren gedacht haben."
    },
    {
      "k": "p",
      "t": "In diesem Zusammenhang wiegt das noch schwerer. Ein Agent baut Modelle auf, ändert sie in mehreren Schritten und liest die Ergebnisse, um neue Aktionen vorzuschlagen; dabei erhält der Rechenkern Eingaben, die kein Ingenieur geprüft hat, bevor sie ihn erreichten. Verhält sich der Rechenkern in einem Grenzfall falsch (eine fast singuläre Steifigkeitsmatrix, entartete Geometrie, eine extreme Lastkombination), kann der Agent dieses Ergebnis ohne jede Warnung zitieren."
    },
    {
      "k": "p",
      "t": "Zwei Techniken können diese Lücke verkleinern. Eigenschaftsbasiertes Fuzzing erzeugt Tausende gültiger Zufallsmodelle und prüft Invarianten, die für jede Eingabe gelten müssen:"
    },
    {
      "k": "ul",
      "items": [
        "Globales Gleichgewicht: ΣR = P, unabhängig von Geometrie, Materialien oder Auflagern.",
        "Symmetrie der Steifigkeitsmatrix: K = Kᵀ durch Konstruktion.",
        "Positive Definitheit von K für jedes Tragwerk ohne Mechanismen.",
        "Invarianz gegenüber Starrkörpertransformationen: Ein Modell zu verschieben oder zu drehen, ändert die Schnittgrößen nicht."
      ]
    },
    {
      "k": "p",
      "t": "Die formale Verifikation geht dieselbe Lücke von der anderen Seite an: eine mathematische Spezifikation dieser Eigenschaften schreiben und mit einem Beweisassistenten wie Lean 4 beweisen, dass die Implementierung sie erfüllt. Tests können Fehler finden; formale Verifikation kann zeigen, dass es im spezifizierten Bereich keine gibt. Beides ergänzt sich: Findet der Fuzzer eine Eingabe, die eine Eigenschaft verletzt, wird diese Eigenschaft zum Kandidaten für einen Beweis."
    },
    {
      "k": "note",
      "t": "Das Ziel ist ein Rechenkern, dessen kritischer numerischer Kern formal verifiziert ist. Dann würde die Determinismusgrenze zu einer mathematischen Garantie: Jede Zahl in einer statischen Berechnung ließe sich auf eine als korrekt bewiesene Rechnung zurückführen."
    },
    {
      "k": "h",
      "t": "Wo das heute steht"
    },
    {
      "k": "p",
      "t": "Zum Schluss, was verfügbar ist und was nicht. Der Rechenkern, der Editor, die CIRSOC-Nachweise, der Lehrmodus und die Erstellung von Berichten und Plänen laufen heute im Browser unter stabileo.com, ohne Installation und ohne Konto. Die Agentenschicht ist in aktiver Entwicklung: Ihre Routen laufen in Entwicklung und Test gegen unser eigenes Backend, auf demselben Rechenkern und mit denselben Zahlen wie alles andere, aber dieses Backend ist noch nicht Teil der öffentlichen Website."
    },
    {
      "k": "p",
      "t": "Der geschlossene Kreislauf mit dem Rechenkern in der Schleife, in dem der Agent ohne menschliches Eingreifen vorschlägt, berechnet, bewertet und ändert, steht auf der Roadmap und ist nicht umgesetzt. Die native Normabdeckung beschränkt sich auf CIRSOC 201 und 301; der Rest ist künftige Arbeit."
    },
    {
      "k": "p",
      "t": "CAD hat den mechanischen Teil des Zeichnens übernommen und die Tabellenkalkulation das wiederkehrende Rechnen, während das ingenieurmäßige Urteil beim Ingenieur blieb. Der Agent ist der nächste Schritt auf dieser Linie: Er übernimmt das Aufbauen und Ändern des Modells, die Eingabe der Lasten, das Führen der Nachweise und die Vorbereitung der Dokumentation. Nichts davon überträgt die Verantwortung: Die unterschriebene Zahl bleibt die des Ingenieurs."
    },
    {
      "k": "note",
      "t": "Dieser Text ist eine Bearbeitung von „Desarrollo de un agente estructural de cálculo sobre un solver verificado“ (Chesta, Bertero, Carrone und Kingston), vorgestellt auf der JAIE 2026. Die zitierten Zahlen sind Ausgaben des Stabileo-Rechenkerns und seines Moduls für CIRSOC 201 und stammen aus diesem Paper."
    }
  ]
};

export default body;
