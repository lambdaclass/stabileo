import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: altri ventitré bollettini, e ogni issue aperta su risultati errati con avviso o rifiuto",
  "excerpt": "Dalla 0.4.0 sono stati segnalati 23 difetti e ventuno corretti, con la verifica a torsione incompleta e il collasso plastico 2D ancora rifiutato. Ogni difetto aperto genera un avviso o un rifiuto. La versione Base include il corso passo dopo passo.",
  "blocks": [
    {
      "k": "p",
      "t": "Dalla 0.4.0 abbiamo continuato a controllare Stabileo da più lati insieme: il solutore contro soluzioni pubblicate e altri programmi, le verifiche di progetto contro esempi svolti, la stessa struttura rinumerata, riscalata e spostata, e i file salvati dalle versioni precedenti. Ha portato a trovare altri ventitré difetti che potevano dare un risultato errato o non a favore di sicurezza. Ciascuno ha un bollettino che dice cosa non andava, chi è interessato e cosa ricontrollare. Ventuno sono corretti. Per SA-2026-040 la verifica a torsione resta incompleta e il collasso plastico 2D (SA-2026-044) resta rifiutato finché non si corregge #758."
    },
    {
      "k": "note",
      "t": "stabileo.com pubblica ogni modifica appena viene integrata, quindi la maggior parte di queste correzioni è già online, ciascuna dal giorno in cui è stata integrata. I progetti salvati prima di una modifica che li riguarda chiedono un ricontrollo quando vengono aperti, nella lingua del lettore. Due correzioni non possono farlo: un modello 2D ricavato da 3D prima di #1295 si apre senza avviso, perché a essere sbagliato era il modello (SA-2026-035). Ritaglialo da 3D, oppure risolvilo in 3D. Lo stesso vale per un rettangolo o un tubo importato da Excel o IFC prima di #1310 (SA-2026-039): importalo di nuovo."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base che apre un telaio piano dagli esempi, salvato come risolto con la versione dei risultati 15. Una finestra intitolata “I risultati sono cambiati dall’ultima volta che questo progetto è stato calcolato” elenca le modifiche che lo riguardano, tra cui la correzione dell’instabilità 2D per aste con sforzo normale variabile e il valore che governa letto al picco reale, ciascuna con la sua spiegazione, e chiede di spuntare “Ho letto queste modifiche” prima di continuare o di rieseguire l’analisi.",
      "caption": "Un progetto salvato prima di una modifica che lo riguarda chiede un ricontrollo quando viene aperto, ed elenca ogni modifica."
    },
    {
      "k": "h",
      "t": "Ricalcola i tuoi progetti"
    },
    {
      "k": "p",
      "t": "Questi sono i casi che spostano di più un risultato di progetto. Ogni bollettino ha il caso svolto e cosa fare con i risultati già consegnati."
    },
    {
      "k": "table",
      "caption": "Alcune correzioni della 0.5.0, come le documenta ciascun bollettino, con la versione dei risultati che ha introdotto ciascuna; SA-2026-035 non ne ha, quindi il suo bollettino è l’unico avviso.",
      "head": [
        "Bollettino",
        "Versione dei risultati",
        "Cosa non andava",
        "Gravità"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Le verifiche di progetto 3D leggevano il momento o il taglio laterale: un pilastro CIRSOC 201 inflesso attorno a Mz veniva verificato sulla sua altezza, 36 % di acciaio in meno in un esempio",
          "Critica"
        ],
        [
          "SA-2026-028",
          "8",
          "La flessione EN 1992-1-1 assumeva che l’acciaio teso snervasse: MRd fino al 22 % superiore",
          "Alta"
        ],
        [
          "SA-2026-030",
          "12",
          "Compressione CIRSOC 301: una sezione con Qa ≤ 0 otteneva una capacità superiore al suo carico di schiacciamento, e passava",
          "Alta"
        ],
        [
          "SA-2026-041",
          "19",
          "La verifica dei pilastri in c.a. abbinava il momento maggiore solo alla compressione maggiore: fino al 15 % non a favore di sicurezza in un esempio",
          "Alta"
        ],
        [
          "SA-2026-042",
          "23",
          "L’instabilità 2D sovrastimava il fattore delle aste la cui compressione cresce lungo di esse: da +43 % a +68 % per un’asta",
          "Alta"
        ],
        [
          "SA-2026-038",
          "35",
          "L’instabilità 3D usava lo sforzo normale medio di ogni asta: +43 % sul fattore di un’asta con un carico lungo di essa",
          "Alta"
        ],
        [
          "SA-2026-043",
          "32",
          "L’analisi armonica perdeva la correzione dei modi omessi quando un modo era molto più morbido degli altri: 79 volte fuori a 2,3 Hz in un esempio",
          "Alta"
        ],
        [
          "SA-2026-035",
          "—",
          "Un taglio da 3D a 2D inflette le aste attorno all’asse di sezione sbagliato: un portale Y–Z 13,5 volte troppo rigido",
          "Alta"
        ],
        [
          "SA-2026-033",
          "20",
          "Il generatore di carichi lasciava fuori l’intero carico di area di un piano quando un’asta bassa si trovava sopra una sua parte",
          "Alta"
        ],
        [
          "SA-2026-027",
          "11",
          "L’inviluppo dei gusci manteneva la combinazione con il Von Mises maggiore, non l’estremo di ogni componente: mx inferiore del 14 % in un esempio",
          "Alta"
        ],
        [
          "SA-2026-047",
          "49",
          "In un modello con gusci, un caso di carico che imponeva uno spostamento di vincolo perdeva tutte le sue tensioni nei gusci, quindi combinazioni e inviluppi sommavano solo le tensioni nei gusci degli altri casi: le tensioni combinate nei gusci potevano essere non a favore di sicurezza, senza avviso. Nelle versioni 0.2.0, 0.3.0 e 0.4.0 (#1676)",
          "Alta"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ogni progetto con gusci risolto prima di #1676 nomina SA-2026-047 quando si apre (#1691): come interessato quando il modello ha un caso di carico che impone uno spostamento di vincolo e combinazioni di carico, e altrimenti come possibilmente interessato, perché un progetto salvato non può mostrare di non aver mai avuto un caso di carico simile. Risolverlo di nuovo cancella l’avviso; poi confronta le tensioni nei gusci delle combinazioni che includono quel caso."
    },
    {
      "k": "p",
      "t": "Gli altri bollettini riguardano le aste in calcestruzzo con torsione secondo ACI 318 ed EN 1992 (SA-2026-040), i vincoli di un modello ritagliato in 2D da un piano Y–Z o X–Y (SA-2026-036), l’analisi co-rotazionale 3D con grandi rotazioni (SA-2026-037), un carico applicato a t = 0 a un grado di libertà privo di massa nella time history (SA-2026-031), il modo a frequenza zero di un meccanismo nell’analisi modale (SA-2026-032), la verifica di equilibrio della relazione dopo l’analisi (SA-2026-034), il collasso plastico 2D, che resta rifiutato finché non si corregge #758 (SA-2026-044), il collasso plastico 3D con un’asta senza momento plastico utilizzabile, ora rifiutato (SA-2026-045), l’analisi armonica che sceglieva tra sovrapposizione modale e calcolo diretto per ciascun carico, quindi la sovrapposizione si rompeva (SA-2026-046), rettangoli e tubi importati da Excel o IFC con Iy e Iz scambiati (SA-2026-039) e, per chi chiama direttamente il motore, il taglio dell’acciaio senza area a taglio secondo AISC 360 ed EN 1993 (SA-2026-025 e 026)."
    },
    {
      "k": "h",
      "t": "Altre modifiche che spostano i risultati"
    },
    {
      "k": "p",
      "t": "Anche altre modifiche spostano i numeri, quindi ciascuna è nell’avviso di ricontrollo; la maggior parte non ha un bollettino proprio, e il modo a frequenza zero dell’analisi modale è SA-2026-032 qui sopra:"
    },
    {
      "k": "ul",
      "items": [
        "Il valore che governa un’asta e l’inviluppo 2D leggono il picco reale del diagramma, non la più vicina delle 21 sezioni: possono salire, dello 0,23 % sotto un carico triangolare e dell’1,05 % sotto un breve carico parziale nei casi documentati, e non scendono mai.",
        "I meccanismi vengono rifiutati anziché risolti: dietro un collegamento rigido o un diaframma in 2D, dietro un connettore in 2D (#1415), e nell’analisi modale, che prima scartava il modo a frequenza zero e restituiva gli altri come completi, compreso un meccanismo che scorre lungo vincoli inclinati.",
        "L’analisi non lineare di materiale 3D risolve telai con e senza costante di ingobbamento, e nodi raggiunti solo da aste reticolari, invece di bloccarsi o rifiutarli; i modelli che si risolvevano prima danno gli stessi numeri.",
        "Gli autovalori ripetuti mantengono la loro molteplicità, e i risultati statici e modali verificano il proprio equilibrio e la propria ortogonalità prima di essere mostrati.",
        "In Base, P-Δ e carico critico dividono ogni asta in elementi, il collasso plastico chiude le cerniere che si scaricano, e la linea d’influenza del momento flettente prende le fibre inferiori tese come positive, come ogni altro momento in Base.",
        "Una verifica di progetto che non può essere valutata viene rifiutata invece di essere superata, e una rotazione nodale morbida ma reale non viene più bloccata quando il modello ha una parte molto più rigida.",
        "L’analisi lineare avverte quando una rotazione supera 0,1 rad, anche dentro la luce di un’asta (compresa la pendenza che la deformazione a taglio aggiunge al suo asse e la curvatura di un gradiente termico a un estremo svincolato, #1569) e sugli spostamenti propri di una combinazione, e quando la compressione può amplificare i suoi momenti oltre il 10 %; finché questo secondo avviso è mostrato, le verifiche CIRSOC 301 restano sospese. Dove una rotazione è segnalata, esegui un’analisi geometricamente non lineare (a grandi rotazioni); dove è segnalata l’amplificazione, un’analisi P-Δ o altra di secondo ordine."
      ]
    },
    {
      "k": "h",
      "t": "Con avviso o rifiuto, finché ogni correzione non esiste"
    },
    {
      "k": "p",
      "t": "Ogni problema aperto che può dare un risultato sbagliato ha ora un avviso o un rifiuto in ogni punto in cui può raggiungere l’ingegnere (#807). Un avviso mantiene il risultato e nomina il problema accanto ad esso; un rifiuto trattiene il risultato e ne spiega il motivo. Un registro nel repository elenca ogni problema di sicurezza aperto con il suo avviso o rifiuto, la condizione che lo attiva e il test che dimostra che scatta, e un test lo mantiene in accordo con il motore."
    },
    {
      "k": "ul",
      "items": [
        "Rifiutati: il moltiplicatore di collasso plastico 2D, che può cambiare fino a 4,6 volte con la numerazione, la direzione delle aste e le unità (#758); un moltiplicatore di instabilità fuori dai limiti del proprio certificato (#741); i gusci MITC4 su mesh distorte con flessione nel piano significativa (#798); e i gusci MITC4 e MITC9 su geometria svergolata (#1057).",
        "Con avviso: tra gli altri, time-history, sovrapposizione modale 3D, modelli quasi singolari, contatto, analisi non lineare del materiale e connettori con rigidezze diverse.",
        "A parte ciò che rifiuta, il contenimento cambia un solo numero: la reazione 2D di un vincolo con cedimento che porta anche una molla nella direzione del cedimento ora include la forza di quella molla. Ogni altro valore dei 145.515 nel corpus dei risultati è identico."
      ]
    },
    {
      "k": "note",
      "t": "Due rifiuti tolgono risultati che alcuni lettori usano. I moltiplicatori di collasso plastico dei telai piani sono trattenuti finché non si corregge il #758. Sono trattenute anche alcune mesh di gusci distorte i cui risultati stavano entro il 2 % dei riferimenti: abbiamo scelto un rifiuto di troppo piuttosto che una rigidezza sbagliata mostrata senza avviso, e restringerlo è nella tabella di marcia."
    },
    {
      "k": "h",
      "t": "Inoltre nella 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Base insegna l’analisi strutturale passo dopo passo: statica, metodi delle forze e degli spostamenti, linee d’influenza, secondo ordine e instabilità, analisi plastica e dinamica, ciascuno spiegato passo dopo passo nell’app. La sua unità sul collasso plastico è trattenuta insieme al resto del collasso plastico 2D finché non si corregge il #758.",
        "Tedesco, francese e turco sono di nuovo disponibili.",
        "L’assistente AI funziona con la tua chiave Anthropic o OpenAI, conservata solo nel tuo browser, e /tools ha modelli dal vivo che il motore risolve di nuovo mentre muovi un cursore.",
        "PRO: piano tipo e piani simili, risultati delle piastre per unità di larghezza con momenti e direzioni principali, la relazione dopo l’analisi, un visualizzatore di sola lettura con “Duplica e modifica”, e un IFC collegato disegnato come riferimento 3D.",
        "I file salvati dalle versioni 0.2.0, 0.3.0 e 0.4.0 si aprono, migrano e danno gli stessi risultati a ogni modifica, tranne dove si applica una modifica dei risultati registrata; un file salvato da una versione più recente viene rifiutato con un messaggio che lo dice.",
        "La stessa struttura riscalata, rinumerata, invertita o spostata deve dare la stessa risposta, verificata su 17 tipi di analisi a ogni modifica e su 8.192 modelli generati ogni notte.",
        "Corretti anche: l’interazione suolo-struttura riporta le sue reazioni vincolari, che prima restituiva vuote (#1675); i gusci di due famiglie numerati allo stesso modo vengono rifiutati da combinazioni e inviluppi invece di combinarne uno al posto dell’altro (#1669); e le tensioni di von Mises e principali dei gusci non vanno più in overflow o underflow a grandezze estreme, con risultati nell’intervallo normale identici bit per bit (#1688).",
        "Un progetto calcolato con una versione che aveva un errore noto di risultato sbagliato in una funzione che usa cita il bollettino finché non viene calcolato di nuovo (#1657), e i progetti registrano ogni analisi eseguita, quindi un bollettino su un’analisi resta finché quell’analisi non viene eseguita di nuovo (#1663).",
        "Più veloce: il salvataggio automatico ogni 30 s salta un progetto invariato (#1664), un grande spazio di lavoro 3D si riapre con meno memoria da liberare (#1668), e i risultati 3D pubblicati sono congelati così la verifica di rifiuto per problema noto viene eseguita una volta per risultato (#1689).",
        "Più verifiche del motore: reciprocità con momenti, combinazioni con coefficienti e sovrapposizione di ogni componente di tensione dei gusci (#1665), e un record di risultato per nodo, vincolo, elemento e guscio per ogni analisi (#1674), che hanno trovato i difetti di SSI e di combinazione dei gusci indicati sopra.",
        "Stabileo Research e Stabileo Tools: riproduzioni eseguibili di articoli e benchmark pubblicati, riviste dopo un passaggio con tre revisori, e calcolatori gratuiti che girano sullo stesso motore."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Come funzionano i bollettini, e i primi ventiquattro:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indice dei bollettini di sicurezza",
      "t": "Ogni bollettino, con la sua gravità, il problema e la correzione:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Registro delle modifiche",
      "t": "Il registro tecnico completo:"
    }
  ]
};

export default body;
