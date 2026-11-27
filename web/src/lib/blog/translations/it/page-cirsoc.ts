import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Verifiche CIRSOC nel browser: cosa include e cosa no",
  "description": "Stabileo verifica il calcestruzzo (CIRSOC 201) e l’acciaio (CIRSOC 301, sperimentale) e genera i carichi CIRSOC 101–104, nel browser. Cosa include e cosa no.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo è un software open source di analisi strutturale che verifica le aste in calcestruzzo armato secondo CIRSOC 201 (edizione 2025) e le aste in acciaio secondo CIRSOC 301-2018, e genera carichi e combinazioni secondo CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Parte I) e CIRSOC 104-2005, le normative strutturali dell’Argentina. Usa lo stesso modello e lo stesso solutore con cui analizzi, gira nel browser e non richiede installazione. L’analisi è gratuita per tutti. Il progetto secondo normativa sta in PRO; è ancora in sviluppo, è a pagamento ed è gratuito per le università.",
  "blocks": [
    {
      "k": "h",
      "t": "Cosa è disponibile e quanto è verificato"
    },
    {
      "k": "p",
      "t": "Certificato significa che ogni risultato porta un limite sul proprio errore numerico calcolato in aritmetica degli intervalli; non significa che il modello sia giusto né che un ingegnere lo abbia rivisto. Gli esempi pubblicati sono gli esempi svolti INTI-CIRSOC."
    },
    {
      "k": "table",
      "caption": "Cosa verifica oggi Stabileo secondo CIRSOC, con il livello di verifica di ogni parte.",
      "head": [
        "Normativa",
        "Cosa fa",
        "Stato"
      ],
      "rows": [
        [
          "CIRSOC 201 — calcestruzzo armato",
          "Travi e pilastri: flessione, pressoflessione, taglio e armatura minima; sezioni, diagrammi di interazione e solai dal motore",
          "Disponibile in PRO. Flessione e taglio delle travi certificati; pressoflessione e solai testati, non certificati. 3 articoli su 5 verificati con gli esempi INTI-CIRSOC 201-2005"
        ],
        [
          "CIRSOC 201-2025 — dettagli costruttivi",
          "Ancoraggio, controllo della fessurazione, copriferro e disposizione delle barre",
          "Disponibile in PRO. Testato"
        ],
        [
          "CIRSOC 301-2018 — acciaio",
          "Trazione, compressione (instabilità flessionale e flesso-torsionale), flessione e taglio",
          "Disponibile, etichettato sperimentale fino a una revisione indipendente. Certificato; 10 articoli su 14 verificati con gli esempi INTI-CIRSOC 301-2018"
        ],
        [
          "CIRSOC 301-2018 J — collegamenti",
          "Saldature d’angolo e collegamenti bullonati",
          "In sviluppo; 2 articoli su 4 verificati con esempi pubblicati"
        ],
        [
          "CIRSOC 201 — plinti isolati",
          "Pressione sul terreno, taglio, punzonamento e flessione",
          "In sviluppo; confrontato con una seconda implementazione"
        ],
        [
          "CIRSOC 101-2025 — carichi e combinazioni",
          "Le sette combinazioni del §2.3.2, carichi permanenti e variabili",
          "Ciò che è implementato è verificato articolo per articolo con il testo ufficiale; ghiaccio, eventi straordinari e alcune disposizioni non coperti"
        ],
        [
          "CIRSOC 102-2025 — vento",
          "Pressioni e combinazioni di esercizio",
          "Ciò che è implementato è verificato con il testo ufficiale; alcuni casi non coperti"
        ],
        [
          "INPRES-CIRSOC 103-2018 Parte I — sismico",
          "Spettro, metodo per zona, peso sismico e combinazione sismica",
          "Ciò che è implementato è verificato; alcune disposizioni non sono coperte"
        ],
        [
          "CIRSOC 104-2005 — neve",
          "Carichi di neve per località",
          "Verificato con le tabelle"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Come funziona"
    },
    {
      "k": "ul",
      "items": [
        "Un solo modello: disegni o importi la struttura (DXF, IFC o un modello Excel) e le verifiche usano le stesse sollecitazioni dell’analisi, senza nulla copiato a mano in un altro foglio di calcolo.",
        "I carichi e le combinazioni secondo CIRSOC 101, 102, 103 e 104 si generano dai dati del progetto.",
        "Per le verifiche supportate e completate sono disponibili il rapporto domanda/capacità, l’articolo determinante e i passaggi del calcolo. Un rapporto parziale non stabilisce che l’asta supera la verifica.",
        "Il solutore gira sul tuo computer: il modello non viene inviato a nessun server per essere calcolato. Il codice è aperto (AGPL-3.0).",
        "Lo stesso modello dà gli stessi numeri a parità di impostazioni di analisi e versione del solutore, e ogni relazione registra la versione e i dati che l’hanno prodotta."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Un esempio svolto passo dopo passo, con il modello da aprire nell’editor:"
    },
    {
      "k": "h",
      "t": "Come lo validiamo, e dove finisce la validazione"
    },
    {
      "k": "ul",
      "items": [
        "Le verifiche di progetto sono confrontate articolo per articolo con gli esempi svolti INTI-CIRSOC, e i carichi con i testi ufficiali; ogni differenza è documentata con la sua causa.",
        "L’analisi è confrontata con altri sette programmi agli elementi finiti.",
        "Non c’è ancora stata una revisione indipendente da parte di un ingegnere strutturista abilitato, e l’acciaio è ancora etichettato come sperimentale.",
        "Nessun programma verifica il modello: i carichi, i vincoli e l’idealizzazione sono decisioni dell’ingegnere."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Quando troviamo un difetto che potrebbe aver influito su risultati già utilizzati, lo pubblichiamo con ciò che occorre ricontrollare:"
    }
  ],
  "faqTitle": "Domande frequenti",
  "faq": [
    {
      "q": "Quale software verifica il progetto strutturale secondo le norme CIRSOC?",
      "a": "Stabileo verifica il calcestruzzo armato secondo CIRSOC 201 e l’acciaio secondo CIRSOC 301-2018 (etichettato come sperimentale), e genera carichi e combinazioni secondo CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 e CIRSOC 104-2005. È open source, gira nel browser e offre moduli di progetto a pagamento, gratuiti per le università."
    },
    {
      "q": "Stabileo è gratuito per le verifiche CIRSOC?",
      "a": "Il programma di base, per l’analisi strutturale nel browser, è open source e gratuito per tutti. Alcuni moduli specialistici sono a pagamento; le università li ottengono gratis. Stabileo AI e il calcolo intensivo nel cloud sono a pagamento per tutti, università comprese, a un prezzo che copre ciò che costano."
    },
    {
      "q": "Posso usare Stabileo per un calcolo che firmerò?",
      "a": "La responsabilità di un progetto è dell’ingegnere che lo firma, con qualsiasi programma. Stabileo pubblica ciò che è verificato e a quale livello; non ha ancora avuto una revisione indipendente da parte di un ingegnere abilitato e l’acciaio è etichettato come sperimentale, quindi verifica a mano gli elementi che governano."
    },
    {
      "q": "Quale edizione di CIRSOC 201 usa?",
      "a": "L’edizione 2025. Per i progetti precedenti si può selezionare la 2005 nelle norme del progetto, ma il progetto di travi e pilastri con quell’edizione non è ancora disponibile. Le verifiche del motore sono confrontate con gli esempi svolti INTI-CIRSOC 201-2005."
    }
  ]
};

export default body;
