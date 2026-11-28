import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: sedici correzioni in più e tutti i bollettini pubblicati",
  "excerpt": "Cosa è cambiato dalla 0.2.0: sedici difetti che potevano dare un risultato sbagliato, corretti e pubblicati come bollettini; certificati che verificano il risultato rispetto al modello; e gli stessi numeri a ogni calcolo.",
  "blocks": [
    {
      "k": "p",
      "t": "La versione 0.3.0 è uscita il 21 ottobre 2026. Dalla 0.2.0 abbiamo continuato a verificare il solutore in diversi modi indipendenti e abbiamo trovato altri sedici difetti che potevano dare un risultato sbagliato. Sono corretti, e per ognuno c’è un bollettino di sicurezza pubblicato che dice cosa non andava, chi è interessato e cosa ricontrollare."
    },
    {
      "k": "note",
      "t": "stabileo.com pubblica ogni modifica non appena viene integrata, quindi queste correzioni sono attive dal 19, 20 o 21 ottobre. L’app avvisa una volta che i risultati potrebbero essere cambiati, e i progetti salvati prima di una modifica che li riguarda chiedono un ricontrollo quando vengono aperti."
    },
    {
      "k": "h",
      "t": "Rieseguire i tuoi progetti"
    },
    {
      "k": "p",
      "t": "Questi sono i casi che possono spostare di più un risultato di progetto. Ogni bollettino ha il caso svolto completo e cosa fare con i risultati che hai già consegnato."
    },
    {
      "k": "img",
      "base": "blog/recheck-notice",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO che apre un telaio in calcestruzzo salvato a settembre. Una finestra intitolata “I risultati sono cambiati dall’ultima volta che questo progetto è stato calcolato” elenca le modifiche che riguardano il modello, tra cui correzioni del solutore trovate dai certificati dei risultati e la compatibilità delle deformazioni secondo CIRSOC 201, e chiede di spuntare “Ho letto queste modifiche” prima di proseguire con risultati non aggiornati o di ricalcolare.",
      "caption": "L’apertura di un progetto calcolato prima di una correzione che lo riguarda: l’app elenca quelle modifiche e mantiene i risultati come non aggiornati finché non vengono calcolati di nuovo."
    },
    {
      "k": "table",
      "caption": "Alcune delle correzioni della 0.3.0: il valore corretto e quello che dava la versione precedente.",
      "head": [
        "Bollettino",
        "Caso",
        "Corretto",
        "Prima"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Puntone di una copertura a due falde: sforzo normale alla base (kN)",
          "-56,67",
          "-41,67"
        ],
        [
          "SA-2026-007",
          "Pilastro cruciforme di 1,5 m: carico critico (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Telaio spaziale rinumerato: moltiplicatore di collasso plastico",
          "176,47",
          "424,3"
        ],
        [
          "SA-2026-015",
          "Pennone strallato: tensione nello strallo (kN)",
          "5,18",
          "4,34"
        ],
        [
          "SA-2026-013",
          "Mensola di gusci curvi: momento all’incastro (kN·m/m)",
          "35,0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Gli altri bollettini riguardano lo spettro di risposta con CQC, i modelli piani risolti in 3D con momenti nodali, i vincoli passati da molla a rigido, gli archi fuori dal piano X–Z, le curve del terreno p-y, t-z e q-z, il guscio pieno nelle piastre sottili e, per chi usa direttamente il motore o la sua API, l’analisi non lineare di materiale, gli elementi MITC9 curvi e i carichi di temperatura sulle aste."
    },
    {
      "k": "h",
      "t": "Un avviso invece di un errore silenzioso"
    },
    {
      "k": "ul",
      "items": [
        "Un risultato che un difetto ancora aperto potrebbe influenzare porta un avviso che lo nomina, nella tua lingua. Ne resta uno: l’analisi non lineare di materiale è un modello secante sull’intera asta.",
        "Quando un carico di temperatura non indica il coefficiente di dilatazione o l’altezza della sezione, il risultato dice quale valore è stato assunto.",
        "Ciò che non ha soluzione viene rifiutato: un momento applicato a un grado di libertà rotazionale libero con rigidezza rotazionale nulla, un carico di guscio su un elemento di un altro tipo, una curva del terreno senza i dati che il suo riferimento richiede."
      ]
    },
    {
      "k": "h",
      "t": "Controllato più a fondo"
    },
    {
      "k": "ul",
      "items": [
        "Certificati end-to-end per telai e travature reticolari: un verificatore indipendente ricostruisce la rigidezza e i carichi a partire dal modello e certifica gli spostamenti rispetto al modello, non solo rispetto alle matrici assemblate dal motore. Ha già trovato tre casi in cui motore e modello non concordavano.",
        "Lo stesso modello dà sempre gli stessi numeri, bit per bit, e ogni rapporto, cartella di lavoro e CSV registra quale versione e quali dati lo hanno prodotto.",
        "Il progetto del calcestruzzo secondo CIRSOC 201 proviene da un’unica implementazione nel motore.",
        "Stime dell’errore di mesh per piastre e gusci, mostrate come stime, mai come certificate."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "L’elenco completo dei bollettini, con cosa ricontrollare per ciascuno:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Note di rilascio 0.3.0",
      "t": "Le note complete, con i limiti noti:"
    }
  ]
};

export default body;
