import type { PostBody } from '../../types';

const body: PostBody = {
  title: 'Baustatik Schritt für Schritt lernen in Stabileo Basic',
  excerpt:
    'Basic hat jetzt einen Kurs: Sie wählen ein Verfahren, und die App rechnet Ihr Tragwerk oder ein Beispiel Schritt für Schritt wie auf dem Papier. Statik, Einflusslinien, Theorie II. Ordnung, Traglastverfahren und Dynamik. Kostenlos.',
  blocks: [
    { k: 'p', t: 'Ein Statikprogramm liefert die Ergebnisse auf einen Schlag. Zum Lernen braucht man das Gegenteil: sehen, woher jede Zahl kommt, in der Reihenfolge, in der man sie an der Tafel herleitet. Genau das ist „Schritt für Schritt erklärt“, der Kurs, der jetzt in Stabileo Basic steckt. Sie wählen ein Verfahren, die App wendet es auf Ihr Tragwerk an und entwickelt es Schritt für Schritt, mit den Gleichungen, den Abbildungen und den Zahlen dieses Modells, und vergleicht das Ergebnis am Ende mit dem Matrizenverfahren.' },
    { k: 'p', t: 'Den Kurs hat Bautista Chesta geschrieben, Bauingenieur (FIUBA), und er kommt in sechs Einheiten: die gemeinsame Grundlage, Statik und klassische Verfahren, Einflusslinien, Theorie II. Ordnung und Knicken, Traglastverfahren und Dynamik. Er ist kostenlos wie ganz Basic: Er öffnet sich im Browser, ohne Installation und ohne Konto, und die Texte gibt es auf Spanisch, Englisch, Portugiesisch, Deutsch, Französisch und Türkisch.' },

    { k: 'h', t: 'So öffnen Sie ihn' },
    {
      k: 'ol',
      items: [
        'Öffnen Sie stabileo.com/app/basic.',
        'Tippen Sie auf Erweitert. Auf dem Handy liegt es in der unteren Leiste.',
        'Unter „Erkunden und lernen“ tippen Sie auf Schritt für Schritt erklärt. Der Katalog der Verfahren öffnet sich, nach Themen gruppiert.',
        'Jedes Verfahren sagt, wie das Tragwerk beschaffen sein muss, um es auszuprobieren, und ob Ihr Modell das erfüllt; das ? erklärt, was es tut. „Beispiel öffnen“ lädt ein passendes Modell und öffnet das Verfahren; „Öffnen“ wendet es auf das Modell auf dem Bildschirm an.',
        'Weiter und Zurück gehen durch die Schritte, die nummerierten Reiter springen zu einem davon. Verfahren führt zurück zum Katalog.',
      ],
    },
    { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Stabileo Basic mit dem Katalog „Schritt für Schritt erklärt“ in der Seitenleiste: die Verfahren unter Weggrößenverfahren, Kraftgrößenverfahren und Durchlaufträger, jedes mit den Anforderungen an das Tragwerk und den Schaltflächen Öffnen und Beispiel öffnen.', caption: 'Der Katalog: Jedes Verfahren sagt, was das Modell braucht, und bringt ein passendes Beispiel mit.' },
    { k: 'note', t: 'Die erklärten Verfahren arbeiten mit ebenen Modellen. Im 3D-Arbeitsbereich öffnen sich nur die beiden Assistenten, Weggrößen- und Kraftgrößenverfahren; „Beispiel öffnen“ bei jedem anderen Verfahren wechselt zuerst in die Ebene.' },

    { k: 'h', t: 'Statik, Kraftgrößenverfahren und Weggrößenverfahren' },
    { k: 'p', t: 'Das ist die größte Einheit: Durchlaufträger mit der Dreimomentengleichung und dem Momentenausgleich nach Cross, Rahmen mit dem Drehwinkelverfahren, Momentenausgleich unverschieblich und verschieblich und dem Weggrößenverfahren mit kinematischen Unbekannten, Fachwerke mit Knotenpunkt- und Ritterschnittverfahren und mit der Kompatibilitätsmatrix, und Verformungen durch zweifache Integration, Momentenflächenverfahren, Arbeitssatz und Castigliano. Der Grad der statischen Unbestimmtheit wird überall gleich gezählt (beim ebenen Rahmen GH = 3·m + r − 3·n − c, beim Fachwerk GH = m + r − 2·n), mit ausgeschriebenen inneren Gelenken und getrennt in äußeren und inneren Anteil.' },
    { k: 'p', t: 'Beim Kraftgrößenverfahren wählen Sie das statisch bestimmte Grundsystem selbst: Sie lösen Auflager oder Stabenden, bis es so viele Unbekannte wie den Grad gibt, und wenn Ihre Wahl einen Mechanismus hinterlässt, erklärt die App warum, statt zu rechnen. Danach geht sie die neun Schritte durch, mit oder ohne Dehnsteifigkeit und mit Stäben und Federn Term für Term. Der Arbeitssatz berechnet Verschiebungen, Verdrehungen und Relativbewegungen, auch mit Federn, Setzungen und Temperatur. Zum Ausprobieren: Beispiele → Portalrahmen, Erweitert → Schritt für Schritt erklärt → Kraftgrößenverfahren → Öffnen.' },
    { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'Der Assistent des Kraftgrößenverfahrens am Beispiel Portalrahmen, im Schritt des Grundsystems: Die drei Reaktionen des rechten Auflagers sind gelöst, und die App zeigt die drei gewählten statisch Überzähligen.', caption: 'Kraftgrößenverfahren: Das Grundsystem wählen Sie, und die App sagt, ob die Wahl taugt.' },

    { k: 'h', t: 'Einflusslinien' },
    { k: 'p', t: 'Beispiele → Durchlaufträger, dann Erweitert → Einflusslinie, und tippen Sie auf einen Schnitt des Trägers. Es gibt Linien für Auflagerkräfte, Moment, Querkraft, Normalkraft, Verschiebungen und Verdrehungen, an jedem Schnitt einschließlich der Stabenden, und der Schnitt lässt sich danach verschieben. Das Panel belastet die Linie mit der ständigen Last g, der Verkehrslast q und einer Einzellast P für ihre Extremwerte, zeichnet die Umhüllende entlang des Stabes und öffnet die Schritt-für-Schritt-Erklärung mit den Müller-Breslau-Figuren. „Lastfälle und Umhüllende“ sucht die größten und kleinsten Wirkungen. Die Momentenlinie ist dort positiv, wo die untere Faser gezogen wird, wie im statischen Diagramm.' },
    { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'Das Beispiel Durchlaufträger mit der Momentenumhüllenden aus der Belastung der Einflusslinien, rot das Maximum und blau das Minimum, und dem Panel, das die Momentenlinie 2 m vom linken Auflager mit g = 10 und q = 5 kN/m belastet: Maximum 20,00 kN·m und Minimum 10,00 kN·m, jeweils durch eine direkte Berechnung bestätigt.', caption: 'Die Momenteneinflusslinie, für ihre Extremwerte belastet, und die Umhüllende entlang des Trägers.' },

    { k: 'h', t: 'Theorie II. Ordnung und Knicken' },
    { k: 'p', t: 'Mit einem belasteten Rahmen: Erweitert → P-Δ (II. Ordnung) oder Pcr (Euler). Unter „Wie gerechnet wird“ wählen Sie das Verfahren, mit Stabilitätsfunktionen φ, geometrischer Matrix oder Sehnenmatrix (P/L), und wie viele Elemente jeder Stab hat. P-Δ zeigt seine Iterationen, und B₂ = 1/(1 − 1/λ₁) stammt aus dem Knicken desselben Modells bei derselben Diskretisierung, neben der Verschiebungsvergrößerung am Knoten, der sich nach Theorie I. Ordnung am meisten verschiebt. Das Knicken rechnet standardmäßig mit vier Elementen pro Stab, und wenn die Diskretisierung den Faktor nicht darstellen kann, lehnt es ihn ab, statt ihn auszugeben. Im Katalog bringt die Gruppe „Theorie II. Ordnung und Knicken“ einen Rahmen mit, der für alle vier Verfahren vorbereitet ist.' },

    { k: 'h', t: 'Traglastverfahren' },
    { k: 'p', t: 'Beispiele → Portalrahmen, dann Erweitert → Plastischer Kollaps. Die Einheit ist geschrieben: jeder Laststeigerungsschritt, die λ-Verschiebungs-Kurve, die plastischen Rotationen, der am Modell gezeichnete und über das Prinzip der virtuellen Arbeit geprüfte Mechanismus und ein Mechanismus, den Sie wählen, indem Sie die Gelenkstellen antippen. Ihre Ergebnisse werden vorerst zurückgehalten. Wir haben festgestellt, dass die Traglastberechnung dahinter einen bis zu 4,6-fach anderen Kollapsfaktor liefern kann, wenn die Stäbe umnummeriert oder umgedreht werden oder sich die Einheiten ändern (#758). Bis das behoben ist, sagt das Panel das und verlinkt das Issue, und die statische und die kinematische Methode im Katalog sind aus demselben Grund deaktiviert: keine Zahl ist besser als eine, die davon abhängt, wie das Modell gezeichnet wurde.' },
    {
      k: 'table',
      caption: 'Das Beispiel Portalrahmen: der Kollaps, den die App berechnet, und ein von Hand gewählter Seitenverschiebungsmechanismus.',
      head: ['Mechanismus', 'λ'],
      rows: [
        ['Der, den die schrittweise Berechnung findet', '71,30'],
        ['Seitenverschiebung von Hand gewählt, mit Gelenken oben und unten an beiden Stützen', '168,75'],
      ],
    },
    { k: 'p', t: 'Die von Hand gewählte Seitenverschiebung ergibt einen höheren Faktor, und die App erklärt, warum sie nicht der Kollaps ist: Mit diesem Mechanismus überschreitet das Moment in einem Schnitt Mp, also ist sein λ nur eine obere Schranke, und durch Skalieren der Momente ergibt sich auch eine untere. Das ist der kinematische Satz, auf dem Bildschirm und mit den Zahlen des Modells.' },
    { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'Stabileo Basic mit dem Beispiel Portalrahmen und gewähltem Erweitert → Plastischer Kollaps: keine Kurve und kein Mechanismus; eine umrahmte Meldung sagt, dass die Ergebnisse zurückgehalten werden, weil sich der 2D-Traglastfaktor mit Nummerierung, Stabrichtung oder Einheiten um bis zum 4,6-Fachen ändern kann, und verlinkt Issue #758.', caption: 'Plastischer Kollaps des Portalrahmens, zurückgehalten, bis #758 behoben ist.' },

    { k: 'h', t: 'Dynamik' },
    { k: 'p', t: 'Erweitert → Dynamik öffnet das Dynamik-Panel. Ein Einmassenschwinger wird aus dem Modell genommen, mit freier Schwingung und erzwungener Antwort auf eine harmonische Last; ein Mehrmassenschwinger wird durch modale Superposition gelöst, der Schubrahmen eingeschlossen. Massenmodelle, konzentriert oder konsistent und mit Kondensation, werden mit den Frequenzen des Rechenkerns verglichen, und an Knoten lassen sich Punktmassen mit ihrer Drehträgheit setzen, die auch die Modalanalyse verwendet. In der Katalog-Gruppe „Baudynamik“ lädt „Beispiel öffnen“ eine Stütze mit Kopfmasse, einen zweigeschossigen Schubrahmen oder, für die verteilte Masse, einen Kragträger.' },
    { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'Eine Kragstütze mit Kopfmasse und das Dynamik-Panel beim Einmassenschwinger aus dem Modell: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, die gedämpfte freie Schwingung und die Antwort auf eine harmonische Kraft mit ihrem Faktor β.', caption: 'Ein Freiheitsgrad: die Stütze mit Kopfmasse unter einer harmonischen Kraft.' },

    { k: 'h', t: 'Alles im Katalog' },
    {
      k: 'table',
      caption: 'Die Verfahren in „Schritt für Schritt erklärt“, nach Gruppen, in der Reihenfolge des Katalogs.',
      head: ['Gruppe', 'Verfahren'],
      rows: [
        ['Weggrößenverfahren', 'Matrixform, als Assistent'],
        ['Kraftgrößenverfahren', 'Kraftgrößenverfahren, als Assistent'],
        ['Durchlaufträger', 'Dreimomentengleichung (Clapeyron); Momentenausgleich (Cross)'],
        ['Rahmen', 'Kinematische Unbekannte; Momentenausgleich unverschieblich und verschieblich; Drehwinkelverfahren'],
        ['Fachwerke', 'Knotenpunktverfahren; Ritterschnitt; Kompatibilitätsmatrix'],
        ['Verformungen und Energie', 'Zweifache Integration; Momentenflächen; Arbeitssatz; Castigliano; Schnittgrößen nach dem Schnittprinzip'],
        ['Einflusslinien', 'Einflusslinie'],
        ['Theorie II. Ordnung und Knicken', 'II. Ordnung mit φ-Funktionen und mit geometrischer Matrix; Knicken durch Modenzählung und über Eigenwerte'],
        ['Traglastverfahren', 'Kinematisches Verfahren; statisches Verfahren'],
        ['Baudynamik', 'Ein Freiheitsgrad; mehrere Freiheitsgrade durch modale Zerlegung; verteilte Masse'],
      ],
    },
    { k: 'p', t: 'Wenn Sie Baustatik unterrichten, können Sie es so, wie es ist, in der Vorlesung einsetzen: Ein Modell wird per Link geteilt, und jede Studentin und jeder Student öffnet es im eigenen Browser, in der eigenen Sprache. Wenn ein Schritt unklar ist oder eine Zahl nicht mit Ihrer Handrechnung übereinstimmt, schreiben Sie uns: Genau das müssen wir wissen.' },
    { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Ein weiteres Werkzeug für den Unterricht, die kinematische Analyse, die erklärt, warum ein Tragwerk ein Mechanismus ist:' },
  ],
};

export default body;
