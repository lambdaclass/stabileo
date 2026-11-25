import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Aste di telaio o elementi finiti? Due modelli, non due metodi",
  "excerpt": "Per un’asta prismatica, il metodo della rigidezza è il caso particolare esatto del metodo degli elementi finiti. Ciò che cambia è il modello, e per una trave alta il modello a telaio dà una freccia dal 19 al 34% troppo piccola.",
  "blocks": [
    {
      "k": "p",
      "t": "“Devo usare il metodo della rigidezza o gli elementi finiti?” esce in ogni aula e in ogni studio di progettazione, ed è la domanda sbagliata. Il problema è che tratta i due come alternative intercambiabili, e non lo sono."
    },
    {
      "k": "p",
      "t": "Il metodo della rigidezza è il metodo degli elementi finiti applicato alle aste di telaio. Ciò che separa un programma “a telaio” da un programma “a elementi finiti” è il modello. Un elemento di telaio porta una teoria monodimensionale di come si deforma un’asta; una mesh di gusci è un continuo bidimensionale discretizzato. Scegliere tra i due è una decisione ingegneristica, e questo articolo parla di quando prenderla e di quanto costa sbagliare."
    },
    {
      "k": "h",
      "t": "Un’asta rettilinea non ha bisogno di mesh"
    },
    {
      "k": "p",
      "t": "Negli elementi finiti, lo spostamento dentro ogni elemento si approssima con funzioni di forma. Per un’asta inflessa, le consuete sono i polinomi cubici di Hermite. E la soluzione dell’equazione della trave di Eulero-Bernoulli senza carico lungo la luce è essa stessa un polinomio cubico, quindi l’approssimazione coincide con la soluzione esatta."
    },
    {
      "k": "p",
      "t": "Per questo la matrice di rigidezza di un’asta prismatica, quella di qualsiasi libro di analisi matriciale, è esatta, e per questo dividere un’asta in più elementi non migliora nulla. Con un carico distribuito vale lo stesso nei nodi, purché i carichi nodali equivalenti siano calcolati in modo consistente."
    },
    {
      "k": "table",
      "caption": "Trave semplicemente appoggiata di 6 m, sezione 20×60, 10 kN/m, E = 30.000 MPa. Freccia in mezzeria con la trave divisa in un numero diverso di elementi di telaio.",
      "head": [
        "Elementi di telaio nella trave",
        "Freccia in mezzeria [mm]"
      ],
      "rows": [
        [
          "2",
          "1.5625"
        ],
        [
          "4",
          "1.5625"
        ],
        [
          "10",
          "1.5625"
        ],
        [
          "50",
          "1.5625"
        ],
        [
          "Forma chiusa 5qL⁴/384EI",
          "1.5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Due elementi o cinquanta, il motore restituisce lo stesso numero, e coincide con la forma chiusa."
    },
    {
      "k": "quote",
      "t": "Creare la mesh di un’asta rettilinea non la rende più accurata: la rende più lenta."
    },
    {
      "k": "note",
      "t": "Quell’esattezza vale entro la teoria della trave. La matrice risolve esattamente l’equazione di Eulero-Bernoulli, ma se l’asta non si comporta come una trave di Eulero-Bernoulli, una soluzione esatta di quell’equazione non aiuta. Il resto di questo articolo riguarda quei casi."
    },
    {
      "k": "h",
      "t": "Dove le strade si separano"
    },
    {
      "k": "p",
      "t": "La teoria di Eulero-Bernoulli assume che le sezioni piane restino piane e perpendicolari all’asse, il che equivale a ignorare la deformazione a taglio. Per una trave snella è un’ottima approssimazione. Per una trave alta no."
    },
    {
      "k": "p",
      "t": "Abbiamo preso la stessa trave di 6 m sotto lo stesso carico e ne abbiamo aumentato l’altezza a passi. Ogni caso è stato risolto due volte: con elementi di telaio, come fa la modalità Base, e come guscio MITC4 con mesh nel piano della trave, cosa che può fare la modalità PRO."
    },
    {
      "k": "table",
      "caption": "Trave semplicemente appoggiata di 6 m, larga 20 cm, 10 kN/m, E = 30.000 MPa, ν = 0,2. Freccia in mezzeria, sull’asse.",
      "head": [
        "L/h",
        "Altezza h [m]",
        "Elementi di telaio [mm]",
        "Gusci [mm]",
        "Modello a telaio inferiore di"
      ],
      "rows": [
        [
          "20",
          "0.30",
          "12.500",
          "12.567",
          "0.5 %"
        ],
        [
          "10",
          "0.60",
          "1.5625",
          "1.5961",
          "2.1 %"
        ],
        [
          "5",
          "1.20",
          "0.19531",
          "0.21206",
          "7.9 %"
        ],
        [
          "3",
          "2.00",
          "0.042188",
          "0.052145",
          "19.1 %"
        ],
        [
          "2",
          "3.00",
          "0.012500",
          "0.019017",
          "34.3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A L/h = 10, una trave ordinaria, la differenza è del 2%. A L/h = 5 è quasi dell’8%. A L/h = 3 il modello a telaio dà una freccia del 19% più piccola, e a L/h = 2, di un terzo più piccola."
    },
    {
      "k": "quote",
      "t": "Il modello a telaio rende sempre la trave più rigida di quanto sia davvero."
    },
    {
      "k": "h",
      "t": "Verifica con una calcolatrice"
    },
    {
      "k": "p",
      "t": "Non devi fidarti sulla parola del guscio. La teoria della trave di Timoshenko include la deformazione a taglio e, per una trave semplicemente appoggiata sotto carico uniforme, aggiunge un termine alla freccia: q·L² / (8·κ·G·A), con κ = 5/6 per una sezione rettangolare e G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Trave a L/h = 3 (luce 6 m, altezza 2 m): quattro risposte alla stessa domanda.",
      "head": [
        "Modello",
        "Freccia in mezzeria [mm]"
      ],
      "rows": [
        [
          "Elementi di telaio (Eulero-Bernoulli)",
          "0.0422"
        ],
        [
          "Elementi di telaio più il termine di taglio, a mano",
          "0.0530"
        ],
        [
          "Gusci MITC4",
          "0.0521"
        ],
        [
          "Elasticità piana, forma chiusa",
          "0.0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A L/h = 3 quel termine vale 0,0108 mm; sommato ai 0,0422 mm di Eulero-Bernoulli, dà 0,0530 mm. Il guscio dà 0,0521 mm e la soluzione in forma chiusa di elasticità piana di Timoshenko e Goodier dà 0,0523 mm. Le tre risposte che includono il taglio concordano entro il 2%. Quella che lo ignora è il 19% più bassa."
    },
    {
      "k": "note",
      "t": "La freccia non è tutto. A quell’altezza la distribuzione delle tensioni normali non è più lineare, quindi nemmeno la formula di Navier si applica. Per questo l’ACI 318, base della CIRSOC 201, tratta come trave alta qualsiasi elemento con luce libera fino a quattro volte la sua altezza e richiede un progetto che tenga conto della distribuzione non lineare delle deformazioni, ad esempio con un modello a puntoni e tiranti."
    },
    {
      "k": "h",
      "t": "Contano pochi centesimi di millimetro?"
    },
    {
      "k": "p",
      "t": "In quella trave da sola, non molto. In una struttura isostatica un errore di rigidezza influisce solo sulla freccia, e una trave alta 2 m comunque si inflette pochissimo. L’errore comincia a contare quando la rigidezza decide come si distribuiscono i carichi, cosa che accade in qualsiasi struttura iperstatica."
    },
    {
      "k": "p",
      "t": "Il caso tipico è la parete di taglio. In un modello a telaio una parete è un pilastro molto largo: riceve il momento d’inerzia della parete e sta sulla sua linea d’asse. Per una parete tozza, lunga rispetto alla sua altezza, l’elemento di telaio la rende sensibilmente più rigida di quanto sia."
    },
    {
      "k": "table",
      "caption": "Parete spessa 20 cm, incastrata alla base, con 100 kN applicati in orizzontale in testa. Spostamento del bordo superiore.",
      "head": [
        "Parete, lunghezza × altezza [m]",
        "Altezza / lunghezza",
        "Elemento di telaio [mm]",
        "Guscio [mm]",
        "Elemento di telaio più rigido di"
      ],
      "rows": [
        [
          "4 × 3",
          "0.75",
          "0.0281",
          "0.0627",
          "2,23 volte"
        ],
        [
          "3 × 3",
          "1.00",
          "0.0667",
          "0.1129",
          "1,69 volte"
        ],
        [
          "2 × 3",
          "1.50",
          "0.2250",
          "0.2943",
          "1,31 volte"
        ],
        [
          "3 × 6",
          "2.00",
          "0.533",
          "0.625",
          "1,17 volte"
        ],
        [
          "3 × 9",
          "3.00",
          "1.800",
          "1.937",
          "1,08 volte"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Una parete lunga 4 m e alta 3 m, di un solo piano, risulta 2,2 volte più rigida se modellata con un elemento di telaio. Una lunga 3 m e alta 9 m, di tre piani, è solo l’8% più rigida. La differenza conta soprattutto per le pareti tozze."
    },
    {
      "k": "p",
      "t": "E questo cambia come si ripartisce il taglio. Prendi due pareti sulla stessa linea, una lunga 4 m e una 2 m, entrambe alte 3 m e collegate dal solaio. Con elementi di telaio, la parete corta prende l’11,1% del taglio. Con i gusci ne prende il 17,6%, il 58% in più di quanto preveda il modello a telaio. Il carico in più che il modello a telaio assegna alla parete lunga viene tolto a quella corta, che finisce progettata per meno taglio di quello che porterà davvero."
    },
    {
      "k": "h",
      "t": "Domande a cui un modello a telaio non sa rispondere"
    },
    {
      "k": "p",
      "t": "Finora si tratta di casi in cui gli elementi di telaio danno il numero sbagliato. In altri non possono dare alcun numero, perché la domanda non trova posto nel modello."
    },
    {
      "k": "ul",
      "items": [
        "Una piastra a fungo. Come si divide il momento tra la fascia sul pilastro e la fascia centrale, e quanto se ne concentra sopra ciascun pilastro, è un’informazione bidimensionale. Un graticcio di travi può approssimarla, ma quell’informazione non è nel modello.",
        "Una parete con aperture. Un elemento di telaio ha una sola sezione in ogni punto del suo asse, quindi una finestra in mezzo alla parete non ha dove andare.",
        "Il nodo. In un modello a telaio il nodo trave-pilastro è un punto, quindi il momento massimo compare sulla linea d’asse. In realtà il nodo è grande quanto il pilastro e la sezione che si progetta è quella sulla faccia del pilastro.",
        "Un carico concentrato vicino a un appoggio. In quella zona le sezioni piane non restano piane, per lo stesso motivo della trave alta."
      ]
    },
    {
      "k": "h",
      "t": "Dove devono concordare"
    },
    {
      "k": "p",
      "t": "L’altra metà dell’argomento conta altrettanto. Per la trave snella della prima riga, a L/h = 20, elementi di telaio e gusci differiscono dello 0,5%. Non è zero, perché il taglio c’è sempre, ma è trascurabile. E deve esserlo: se i due modelli non concordano su un’asta snella, controlla prima il modello a elementi finiti, e in particolare la mesh."
    },
    {
      "k": "note",
      "t": "Lo shear locking è un esempio classico di elemento che fallisce. Un quadrilatero per piastre spesse formulato in modo ingenuo diventa molto più rigido del dovuto quando la piastra è sottile, e il solaio si comporta come se fosse più spesso. L’elemento MITC4 di Stabileo esiste per evitarlo: interpola le deformazioni a taglio in modo diverso, così l’elemento non si blocca."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Scegliere la teoria in base allo spessore, e cosa costa una scelta sbagliata, è la stessa questione che pone la torsione:"
    },
    {
      "k": "h",
      "t": "Entrambi i modelli in un solo programma"
    },
    {
      "k": "p",
      "t": "Avere elementi trave e gusci nello stesso programma non è una novità. SAP2000, ETABS, Robot e midas combinano entrambi in un unico modello, ed è la base di partenza del software professionale. Ma non sono pensati per spiegare ciò che calcolano. All’altro estremo, strumenti didattici come Ftool e MASTAN2 insegnano molto bene l’analisi dei telai ma non arrivano agli elementi finiti."
    },
    {
      "k": "p",
      "t": "Stabileo ha entrambe le modalità in un solo programma. La modalità Base risolve con elementi trave e percorre il metodo della rigidezza in nove passi: numerazione dei gradi di libertà, matrici locali, trasformazione, assemblaggio, vettore dei carichi, condizioni al contorno, soluzione, reazioni vincolari e sollecitazioni. La modalità PRO risolve con elementi finiti, usando gusci MITC4 e piastre DKT accanto agli elementi trave. Tra gli strumenti che abbiamo esaminato, non abbiamo trovato un altro programma che permetta di imparare come funziona l’analisi e poi applicarla a un modello più completo senza cambiare strumento."
    },
    {
      "k": "img",
      "base": "blog/deep-beam-shell",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, area di lavoro Analizza, con la trave alta di 6 m per 2 m modellata come parete di elementi guscio e risolta. Il pannello dei risultati elenca 225 spostamenti e 192 tensioni nei gusci; in Verifiche dei risultati stima l’errore di discretizzazione in circa l’11 % in norma energetica e chiede di raffinare la mesh o di eseguire la verifica di convergenza prima di usare i risultati.",
      "caption": "Il modello a guscio qui sotto, risolto: l’app stima da sola l’errore della propria mesh e dice quando la mesh è troppo grossolana per farvi affidamento."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "La trave con L/h = 3 in modalità Base: luce di 6 m, sezione 20×200 cm e 10 kN/m, modellata con due elementi trave. Passa il cursore al centro della trave e legge “uz: -0.042 mm”, in accordo con la formula di Eulero-Bernoulli."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "La stessa trave in modalità PRO, modellata come guscio con 192 elementi MITC4 da 25 cm. In Analizza → Spostamenti, il nodo 113 (mezzeria, a metà altezza) riporta “-5.19e-5” m, cioè 0,0519 mm. La tabella qui sopra usa una mesh più fitta e dà 0,0521 mm."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Cosa spiegano e cosa non spiegano gli strumenti gratuiti, strumento per strumento:"
    },
    {
      "k": "h",
      "t": "In breve"
    },
    {
      "k": "ol",
      "items": [
        "Per un’asta prismatica, il metodo della rigidezza è il caso particolare esatto degli elementi finiti. Ciò che scegli è il modello.",
        "Un’asta dritta non richiede mesh. Se dividerla cambia il risultato, c’è qualcos’altro che non va.",
        "Sotto L/h ≈ 5 il modello a telaio sottostima la freccia di oltre l’8 %, e sotto 3 di oltre il 19 %. Rende sempre la trave più rigida.",
        "In una struttura iperstatica quell’errore cambia il modo in cui si ripartiscono i carichi. Controlla le pareti tozze prima delle travi.",
        "Solai a piastra, pareti con aperture e carichi vicini ai vincoli pongono domande a cui un modello a telaio non sa rispondere.",
        "Dove l’asta è snella, i due modelli devono concordare. Se non concordano, controlla la mesh."
      ]
    },
    {
      "k": "note",
      "t": "Come sono stati calcolati i numeri: tutti provengono dal motore di Stabileo, lo stesso che usa l’applicazione. Elementi trave: Eulero-Bernoulli, con vincoli sull’asse. Gusci: MITC4 nel piano della trave, con 24 elementi nell’altezza (16 cambia la quarta cifra), il carico sul bordo superiore e i vincoli distribuiti su tutta l’altezza delle sezioni di estremità. Pareti: la stessa formulazione, con la base incastrata per tutta la lunghezza e il carico orizzontale distribuito lungo la sommità. Il termine di taglio e la soluzione dell’elasticità piana sono forme chiuse che puoi verificare a mano."
    }
  ]
};

export default body;
