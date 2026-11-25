import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt o De Saint-Venant: quale teoria della torsione si applica e quanto costa sbagliare scelta",
  "excerpt": "Tre formule, una sezione, tre numeri diversi. Quale si applica dipende dalla parete; dove ne valgono due insieme, Bredt risulta dal 2 al 15% troppo basso.",
  "blocks": [
    {
      "k": "p",
      "t": "Tre formule diverse danno la tensione tangenziale dovuta alla torsione. Per la stessa sezione possono differire di ordini di grandezza, e quale si applica dipende dal tipo di parete della sezione."
    },
    {
      "k": "p",
      "t": "Questo è in qualsiasi libro di testo. Ciò che si spiega raramente è cosa succede quando due delle tre valgono per la stessa sezione: danno risposte diverse e la differenza va sempre nello stesso verso."
    },
    {
      "k": "h",
      "t": "Le tre formule"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Solo sezioni circolari, e lì è esatta: è l’unico caso in cui le sezioni piane restano piane. La tensione cresce linearmente con il raggio, da un minimo sulla faccia interna a un massimo sulla faccia esterna.",
        "Bredt, τ = T / (2·Aₘ·t). Per sezioni chiuse a parete sottile. Il momento torcente è portato da un flusso di taglio che circola attorno all’area racchiusa. Aₘ è l’area racchiusa dalla linea media della parete, non dalla sua faccia esterna; confondere le due è un errore comune.",
        "De Saint-Venant, τ = T·t / J con J = (1/3)·Σb·t³. Per sezioni aperte a parete sottile. Senza un percorso chiuso, il flusso deve tornare su se stesso attraverso lo spessore, ed è per questo che lo spessore compare al cubo."
      ]
    },
    {
      "k": "note",
      "t": "De Saint-Venant viene spesso presentata come “la teoria delle sezioni aperte”, ma è la teoria generale, e le altre due ne sono casi particolari con soluzione in forma chiusa. Su una sezione circolare la sua soluzione coincide esattamente con quella di Cauchy, perché la simmetria circolare fa sì che la sezione non si ingobbi. Su una parete chiusa sottile, la sua soluzione è quella di Bredt."
    },
    {
      "k": "h",
      "t": "Quando ne valgono due, non concordano"
    },
    {
      "k": "p",
      "t": "Prendi un tubo circolare. Cauchy si applica ed è esatta. Si applica anche Bredt: la parete è chiusa e un flusso di taglio la percorre. Ma Bredt assume la tensione costante nello spessore, mentre in Cauchy cresce con il raggio. Quindi Bredt dà la media e Cauchy dà il massimo."
    },
    {
      "k": "table",
      "caption": "Tubo circolare cavo: quanto Bredt sta sotto il valore esatto, per spessore relativo della parete.",
      "head": [
        "t / rₘ",
        "Esempio (rₘ = 50 mm)",
        "τ Bredt / τ esatta",
        "Bredt inferiore di"
      ],
      "rows": [
        [
          "0.05",
          "parete di 2,5 mm",
          "0.976",
          "2.4 %"
        ],
        [
          "0.10",
          "parete di 5,0 mm",
          "0.955",
          "4.5 %"
        ],
        [
          "0.20",
          "parete di 10,0 mm",
          "0.918",
          "8.2 %"
        ],
        [
          "0.50",
          "parete di 25,0 mm",
          "0.850",
          "15.0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt è basso in tutti e quattro i casi. Per un tubo con parete di 5 mm e raggio medio di 50 mm, che la solita regola pratica considera ancora a parete sottile, la tensione reale è il 4,7% più alta di quella calcolata. Con una parete di 10 mm, l’8,9%."
    },
    {
      "k": "quote",
      "t": "L’errore ha sempre lo stesso segno: Bredt risulta basso."
    },
    {
      "k": "p",
      "t": "Una differenza del 4,5% non salta all’occhio in una verifica di progetto, quindi un elemento che non verifica può sembrare verificato."
    },
    {
      "k": "img",
      "base": "blog/torsion-tube",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo in modalità Base con una mensola CHS 105×5 sotto un momento torcente di 1 kN·m. Il pannello della sezione è aperto su Torsione: T = 1,00 kN·m, τmax = 13,34 MPa, J = 393,7 cm⁴, etichettato “Circolare — esatta”, seguito dalle tre teorie a partire da De Saint-Venant.",
      "caption": "Il tubo della tabella in Stabileo: 13,34 MPa, con ogni teoria elencata sotto con la sua formula."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Lo stesso tubo in Stabileo: una mensola CHS 105×5 sotto un momento torcente di 1 kN·m. Il pannello si apre su Torsione e mostra Cauchy 13,34 MPa e Bredt 12,73 MPa, il 95% della tabella qui sopra. Sposta il punto o cambia la sezione e tutti e tre i valori si aggiornano."
    },
    {
      "k": "h",
      "t": "Aprire la parete cambia l’ordine di grandezza"
    },
    {
      "k": "p",
      "t": "Tra teorie che si sovrappongono la differenza è di qualche punto percentuale. Tra una parete chiusa e una aperta è di ordini di grandezza. Prendi un tubo quadrato di 100×100 mm con parete di 5 mm e taglialo per tutta la lunghezza: mantiene la sua area, il suo peso e quasi tutta la sua rigidezza flessionale."
    },
    {
      "k": "table",
      "caption": "Lo stesso tubo quadrato 100×100×5, chiuso e con un taglio longitudinale, sotto un momento torcente di 1 kN·m.",
      "head": [
        "",
        "Chiuso",
        "Con taglio",
        "Fattore"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4,286,875",
          "15,833",
          "271"
        ],
        [
          "τ [MPa]",
          "11.08",
          "315.79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "La rigidezza torsionale scende di un fattore 271 e la tensione sale di un fattore 29. Un profilo a C e un tubo quadrato dello stesso peso si comportano in modo molto diverso a torsione."
    },
    {
      "k": "note",
      "t": "C’è un altro termine che spesso si trascura: l’ingobbamento. Quando una sezione aperta non può ingobbarsi liberamente, perché è vincolata o perché il momento torcente varia lungo l’asta, si aggiunge la torsione da ingobbamento a quella di De Saint-Venant. Ignorarla porta anch’essa a una sottostima."
    },
    {
      "k": "h",
      "t": "Che cosa fa Stabileo in proposito"
    },
    {
      "k": "p",
      "t": "Stabileo le mostra tutte e tre, ciascuna con la sua formula, i suoi termini e il suo valore. Mostra anche quelle che non si applicano, con il motivo. E quando due sono valide per la stessa sezione, mostra la differenza tra loro invece di sceglierne una in silenzio."
    },
    {
      "k": "p",
      "t": "Il baricentro, il centro di taglio e il nocciolo centrale d’inerzia sono trattati allo stesso modo: calcolati passo dopo passo, in piena vista, sul poligono reale della sezione e non da una formula per ogni forma."
    },
    {
      "k": "note",
      "t": "Per vederlo, apri l’editor, disegna o scegli un’asta e vai su Avanzate → Analisi della sezione → Torsione. Per un tubo circolare vedrai Cauchy e Bredt affiancati, con la differenza percentuale tra loro. Per un profilo a C vedrai Bredt segnato come non applicabile, con il motivo."
    },
    {
      "k": "h",
      "t": "In breve"
    },
    {
      "k": "ol",
      "items": [
        "La parete forma un circuito chiuso? Bredt, con Aₘ misurata sulla linea media.",
        "È aperta? De Saint-Venant, e lo spessore entra al cubo: governa la parete più spessa.",
        "È circolare? Cauchy, ed è esatta. Se usi anche Bredt, aspettati che risulti basso.",
        "L’ingobbamento è impedito? Allora De Saint-Venant da sola non basta."
      ]
    },
    {
      "k": "p",
      "t": "In ogni caso, annota quale teoria hai usato insieme al valore."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "La stessa domanda (quale teoria si applica e quanto costa sbagliare scelta) si pone quando si sceglie tra aste di telaio ed elementi finiti:"
    },
    {
      "k": "note",
      "t": "Le cifre di questo articolo vengono da soluzioni in forma chiusa per le sezioni indicate: un tubo circolare cavo con Aₘ sulla linea media e un tubo quadrato 100×100×5 con il J chiuso di Bredt e il J aperto di De Saint-Venant. Puoi riprodurle in Stabileo con le stesse sezioni."
    }
  ]
};

export default body;
