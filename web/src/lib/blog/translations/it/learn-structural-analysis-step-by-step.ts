import { courseMethodCounts } from '../../posts/course-method-counts';
import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Impara l’analisi strutturale passo dopo passo in Stabileo Base",
  "excerpt": "Base ora ha un corso: scegli un metodo e l’app risolve la tua struttura, o un esempio, passo dopo passo come su carta. Statica, linee d’influenza, secondo ordine, analisi plastica e dinamica. Gratuito.",
  "blocks": [
    {
      "k": "p",
      "t": "Il software di analisi ti dà i risultati tutti insieme. Imparare richiede l’opposto: vedere da dove viene ogni numero, nell’ordine in cui si fa alla lavagna. Questo è “Spiegato passo dopo passo”, il corso che ora vive dentro Stabileo Base. Scegli un metodo, l’app lo applica alla tua struttura e lo svolge passo dopo passo, con le equazioni, le figure e i numeri di quel modello, e finisce confrontando il risultato con il metodo matriciale."
    },
    {
      "k": "p",
      "t": "Il corso è stato scritto da Bautista Chesta, ingegnere civile (FIUBA), e arriva in sei unità: la base comune, statica e metodi classici, linee d’influenza, secondo ordine e instabilità, analisi plastica e dinamica. È gratuito, come tutto Base: si apre nel browser, senza nulla da installare e senza account, e i testi sono in spagnolo, inglese, portoghese, tedesco, francese, turco, ungherese, italiano, cinese e olandese."
    },
    {
      "k": "h",
      "t": "Come aprirlo"
    },
    {
      "k": "ol",
      "items": [
        "Vai su stabileo.com/app/basic.",
        "Premi Avanzate. Su un telefono si trova nella barra inferiore.",
        "Sotto “Esplora e impara”, premi Spiegato passo dopo passo. Si apre il catalogo dei metodi, raggruppati per argomento.",
        "Ogni metodo dice come deve essere la struttura per provarlo e se il tuo modello è adatto; il ? spiega cosa fa. “Apri un esempio” carica un modello adatto e apre il metodo; “Apri” lo applica al modello sullo schermo.",
        "Avanti e Indietro scorrono i passi, e le schede numerate saltano a uno. Metodi torna al catalogo."
      ]
    },
    {
      "k": "img",
      "base": "blog/course-catalog",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con il catalogo “Spiegato passo dopo passo” aperto nel pannello laterale: i metodi sotto metodo della rigidezza, metodo delle forze e travi continue, ciascuno con ciò che la struttura deve essere e i pulsanti Apri e Apri un esempio.",
      "caption": "Il catalogo: ogni metodo dice cosa serve al modello e viene con un esempio che lo soddisfa."
    },
    {
      "k": "note",
      "t": "I metodi spiegati funzionano su modelli piani. Nello spazio di lavoro 3D si aprono solo le due procedure guidate, rigidezza e flessibilità; “Apri un esempio” su qualsiasi altro metodo torna prima al piano."
    },
    {
      "k": "h",
      "t": "Statica, metodo delle forze e metodo degli spostamenti"
    },
    {
      "k": "p",
      "t": "È l’unità più ampia: travi continue con l’equazione dei tre momenti e la distribuzione dei momenti, telai con il metodo delle rotazioni, distribuzione dei momenti con e senza spostamento laterale e metodo degli spostamenti, travature reticolari per nodi, per sezioni (Ritter) e con la matrice di compatibilità, e deformazioni per doppia integrazione, area dei momenti, lavori virtuali e Castigliano. Per una struttura cinematicamente stabile il conteggio dà il grado di iperstaticità. In generale dà il numero di ridondanze meno il numero di meccanismi (GH = 3·m + r − 3·n − c per un telaio piano, GH = m + r − 2·n per una travatura reticolare), con le cerniere interne scritte per esteso e suddivise nelle sue parti esterna e interna."
    },
    {
      "k": "p",
      "t": "Nel metodo delle forze scegli la struttura principale: svincoli vincoli o estremi di asta finché le iperstatiche sono tante quanto il grado, e se la tua scelta lascia un meccanismo l’app spiega perché invece di risolverlo. Poi percorre i nove passi, con rigidezza assiale attiva o no e aste e molle scritte termine per termine. I lavori virtuali calcolano spostamenti, rotazioni e movimenti relativi, anche con molle, cedimenti vincolari e temperatura. Per provare: Esempi → Telaio a portale, Avanzate → Spiegato passo dopo passo → Metodo delle forze → Apri."
    },
    {
      "k": "img",
      "base": "blog/course-force-method",
      "w": 1600,
      "h": 1000,
      "alt": "La procedura guidata del metodo delle forze sull’esempio Telaio a portale, al passo della struttura principale: le tre reazioni del vincolo destro sono svincolate e l’app elenca le tre iperstatiche scelte.",
      "caption": "Metodo delle forze: scegli la struttura principale, e l’app ti dice se la scelta funziona."
    },
    {
      "k": "h",
      "t": "Linee d’influenza"
    },
    {
      "k": "p",
      "t": "Esempi → Trave continua, poi Avanzate → Linea d’influenza, e tocca una sezione della trave. Ci sono linee per reazioni, momento, taglio, sforzo normale, spostamenti e rotazioni, in qualsiasi sezione, estremi delle aste compresi, e la sezione si può spostare in seguito. Il pannello carica la linea con il carico permanente g, il carico variabile q e un carico concentrato P per i suoi estremi, disegna l’inviluppo lungo l’asta e apre la spiegazione passo dopo passo con le figure di Müller-Breslau. “Casi di carico e inviluppi” trova gli effetti maggiori e minori. La linea del momento è positiva dove tende la fibra inferiore, come il diagramma statico."
    },
    {
      "k": "img",
      "base": "blog/course-influence",
      "w": 1600,
      "h": 1000,
      "alt": "L’esempio Trave continua con l’inviluppo del momento ottenuto caricando le linee d’influenza, rosso per il massimo e blu per il minimo, e il pannello che carica la linea del momento a 2 m dall’appoggio sinistro con g = 10 e q = 5 kN/m: massimo 20,00 kN·m e minimo 10,00 kN·m, ciascuno confermato da una risoluzione diretta.",
      "caption": "La linea d’influenza del momento caricata per i suoi estremi, e l’inviluppo lungo la trave."
    },
    {
      "k": "h",
      "t": "Secondo ordine e instabilità"
    },
    {
      "k": "p",
      "t": "Con un telaio caricato, Avanzate → P-Δ (2º ordine) o Pcr (Eulero). Sotto “Come si calcola” scegli la formulazione e quanti elementi usare per asta. Nei metodi con matrice geometrica puoi scegliere l’approssimazione della corda (P/L). P-Δ mostra le sue iterazioni, e B₂ = 1/(1 − 1/λ₁) deriva dall’instabilità dello stesso modello con la stessa discretizzazione, accanto all’amplificazione dello spostamento nel nodo che si muove di più al primo ordine. L’instabilità usa quattro elementi per asta per impostazione predefinita, e quando la discretizzazione non può rappresentare il moltiplicatore lo rifiuta invece di riportarlo. Nel catalogo, il gruppo “Secondo ordine e instabilità” viene con un telaio preparato per tutti e quattro i metodi."
    },
    {
      "k": "h",
      "t": "Analisi plastica"
    },
    {
      "k": "p",
      "t": "Esempi → Telaio a portale, poi Avanzate → Collasso plastico. L’unità è scritta: ogni passo di carico, la curva λ–spostamento, le rotazioni plastiche, il meccanismo disegnato sul modello e verificato con i lavori virtuali, e un meccanismo che scegli toccando dove vanno le cerniere. I suoi risultati sono per ora trattenuti. Abbiamo scoperto che l’analisi limite che ne è alla base può dare un moltiplicatore di collasso fino a 4,6 volte diverso quando le aste sono rinumerate o invertite, o le unità cambiano (#758). Finché non sarà corretto, il pannello lo dice e rimanda alla segnalazione, e i metodi statico e cinematico nel catalogo sono disattivati con lo stesso motivo: nessun numero è meglio di uno che dipende da come è stato disegnato il modello."
    },
    {
      "k": "img",
      "base": "blog/course-plastic",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con l’esempio Telaio a portale e Avanzate → Collasso plastico scelto: non viene mostrata alcuna curva né meccanismo; un messaggio incorniciato dice che i risultati sono trattenuti perché il moltiplicatore di collasso plastico 2D può cambiare fino a 4,6 volte con la numerazione, la direzione delle aste o le unità, e rimanda alla segnalazione #758.",
      "caption": "Collasso plastico del telaio a portale, trattenuto finché non sarà corretto #758."
    },
    {
      "k": "h",
      "t": "Dinamica"
    },
    {
      "k": "p",
      "t": "Avanzate → Dinamica apre il pannello della dinamica. Un sistema a un grado di libertà viene preso dal modello, con la sua risposta libera e la sua risposta forzata a un carico armonico; uno a più gradi di libertà si risolve per sovrapposizione modale, compreso il telaio shear-type. I modelli di massa, concentrata o consistente e con condensazione, sono confrontati con le frequenze del motore, e si possono collocare masse puntuali nei nodi, con la loro inerzia rotazionale, che usa anche l’analisi modale. Nel gruppo “Dinamica strutturale” del catalogo, “Apri un esempio” carica un pilastro con una massa in sommità, un telaio shear-type a due piani o, per la massa distribuita, una mensola."
    },
    {
      "k": "img",
      "base": "blog/course-dynamics",
      "w": 1600,
      "h": 1000,
      "alt": "Un pilastro a mensola con una massa in sommità e il pannello della dinamica aperto sul sistema a un grado di libertà preso dal modello: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, la vibrazione libera smorzata e la risposta a una forza armonica con il suo fattore β.",
      "caption": "Un grado di libertà: il pilastro con una massa in sommità sotto una forza armonica."
    },
    {
      "k": "h",
      "t": "Tutto il catalogo"
    },
    {
      "k": "table",
      "caption": "I metodi in “Spiegato passo dopo passo”, per gruppo, nell’ordine del catalogo.",
      "head": [
        "Gruppo",
        "Numero",
        "Metodi"
      ],
      "rows": [
        [
          "Metodo della rigidezza",
          courseMethodCounts.stiffness,
          "Metodo matriciale, come procedura guidata"
        ],
        [
          "Metodo della flessibilità",
          courseMethodCounts.flexibility,
          "Metodo delle forze, come procedura guidata"
        ],
        [
          "Travi continue",
          courseMethodCounts.continuous,
          "Tre momenti (Clapeyron); distribuzione dei momenti (Hardy Cross)"
        ],
        [
          "Telai",
          courseMethodCounts.frames,
          "Incognite cinematiche; distribuzione dei momenti senza e con spostamento laterale; metodo delle rotazioni"
        ],
        [
          "Travature reticolari",
          courseMethodCounts.trusses,
          "Nodi; sezioni (Ritter); matrice di compatibilità"
        ],
        [
          "Deformazioni ed energia",
          courseMethodCounts.deformation,
          "Doppia integrazione; area dei momenti; lavori virtuali; Castigliano; sollecitazioni interne per tagli"
        ],
        [
          "Linee d’influenza",
          courseMethodCounts.influence,
          "Linea d’influenza"
        ],
        [
          "Secondo ordine e instabilità",
          courseMethodCounts.secondOrder,
          "Secondo ordine con funzioni φ e con la matrice geometrica; instabilità per numero di modi e per autovalori"
        ],
        [
          "Analisi plastica",
          courseMethodCounts.plastic,
          "Metodo cinematico; metodo statico (entrambi disattivati fino alla correzione di #758)"
        ],
        [
          "Dinamica strutturale",
          courseMethodCounts.dynamics,
          "Un grado di libertà; più gradi di libertà per decomposizione modale; massa distribuita"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Se insegni strutture, puoi usarlo in classe così com’è: un modello si condivide con un link e ogni studente lo apre nel proprio browser, nella propria lingua. Se un passo non è chiaro o un numero non coincide con quello che ottieni a mano, scrivici: è esattamente ciò che ci serve sapere."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Un altro strumento pensato per l’aula, l’analisi cinematica che spiega perché una struttura è un meccanismo:"
    }
  ]
};

export default body;
