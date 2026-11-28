import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stesso modello, stessi numeri: determinismo e provenienza",
  "excerpt": "Due calcoli dello stesso modello nella stessa sessione potevano differire nelle ultime cifre. Perché succedeva, come l’abbiamo risolto e come ogni rapporto ora dice quale versione e quali dati lo hanno prodotto, così che chiunque possa riprodurlo.",
  "blocks": [
    {
      "k": "p",
      "t": "Una relazione di calcolo firmata deve essere riproducibile. Se tra un anno qualcuno riapre il progetto, o lo rivede un altro ingegnere, lo stesso modello deve dare gli stessi numeri, e deve essere chiaro quale versione del programma li ha prodotti."
    },
    {
      "k": "p",
      "t": "Quando l’abbiamo misurato abbiamo scoperto che non sempre era così: due calcoli dello stesso modello nella stessa sessione potevano differire nelle ultime cifre, e alcuni risultati uscivano in un ordine diverso. Le differenze erano minime, ma un numero che cambia mentre non è cambiato nulla è un numero che non si può verificare."
    },
    {
      "k": "h",
      "t": "Da dove veniva la differenza"
    },
    {
      "k": "p",
      "t": "Il motore tiene nodi, aste, vincoli e carichi in tabelle hash, e ogni tabella è creata con un seme casuale: lo stesso file letto due volte viene percorso in due ordini diversi. Sommare numeri in virgola mobile in un altro ordine può cambiare l’ultimo bit, perché l’addizione al calcolatore non è associativa. Gli assemblatori 3D ordinavano già le aste, ma quelli 2D, i cicli su carichi e vincoli e la maggior parte delle altre analisi no."
    },
    {
      "k": "ul",
      "items": [
        "Ogni scansione di una tabella di ingresso ora avviene in un ordine fisso, quello delle sue chiavi: 587 punti in tutto il motore.",
        "Anche le somme di equilibrio e i termini incrociati dei vincoli inclinati sono percorsi in un ordine fisso.",
        "Gli avvisi escono ordinati per numero di nodo o di asta, non a caso."
      ]
    },
    {
      "k": "table",
      "caption": "Cosa è cambiato nel motore, e come viene verificato.",
      "head": [
        "Voce",
        "Numero"
      ],
      "rows": [
        [
          "Scansioni di tabelle di ingresso portate a un ordine fisso",
          "587"
        ],
        [
          "Letture di ogni modello casuale confrontate bit per bit",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Un test legge ogni modello casuale sei volte, lo risolve e confronta i risultati come testo, bit per bit, nelle analisi lineare, modale, di instabilità e P-Delta. Una scansione non ordinata che cambia un risultato emerge come differenza tra le esecuzioni."
    },
    {
      "k": "h",
      "t": "Ogni rapporto dice da dove viene"
    },
    {
      "k": "p",
      "t": "Ogni relazione di calcolo, rapporto PRO, cartella di lavoro e CSV ora porta un blocco di provenienza: versione e commit dell’app e del motore, l’impronta SHA-256 del modulo WebAssembly che ha eseguito il calcolo, un’impronta del modello esatto, delle impostazioni e dei risultati mostrati, e lo stato dei certificati (un inviluppo di carichi mobili registra meno: il suo modello e le sue impostazioni). Se il progetto è cambiato mentre l’esportazione era in preparazione, non viene esportato nulla: un rapporto non porta mai i numeri di uno stato con la provenienza di un altro."
    },
    {
      "k": "p",
      "t": "Con quel blocco l’app può riprodurre un rapporto: risolve di nuovo il progetto e confronta ogni impronta. Il verdetto è “riprodotto” solo quando tutte coincidono (una build WebAssembly diversa è segnalata accanto, non contata come differenza); quando una non ha potuto essere ricalcolata dice “incompleto”, mai “riprodotto”. Esiste anche uno strumento a riga di comando che risolve due volte lo stesso input e verifica le impronte."
    },
    {
      "k": "img",
      "base": "blog/reproduce",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con la finestra “Riproduci dalla provenienza”: un riquadro in cui incollare il blocco di provenienza di un rapporto o caricare il rapporto salvato, e i pulsanti “Scarica l’input del solutore” e “Risolvi di nuovo e confronta”.",
      "caption": "“Verifica un rapporto esportato”: il progetto aperto viene risolto di nuovo e ogni impronta è confrontata con quelle del rapporto."
    },
    {
      "k": "h",
      "t": "I vecchi progetti lo dicono"
    },
    {
      "k": "p",
      "t": "Ogni progetto salvato registra la versione dei risultati con cui è stato calcolato. Quando si apre un progetto calcolato prima di una modifica che riguarda le sue funzioni, l’app elenca quelle modifiche, spiegate nella tua lingua, e segna i risultati come non aggiornati finché non viene calcolato di nuovo. Per due errori memorizzati nel modello il progetto può riaprirsi senza avviso: per SA-2026-035 ricrea il taglio 2D dal modello 3D originale e per SA-2026-039 reimporta le sezioni interessate. Nel dubbio una modifica conta come applicabile: un avviso di troppo costa un minuto, uno di meno può nascondere un numero che si è spostato."
    },
    {
      "k": "h",
      "t": "Un limite"
    },
    {
      "k": "p",
      "t": "L’app confronta sempre WebAssembly con WebAssembly. Lo strumento nativo ha riprodotto bit per bit le impronte del browser sul modello di prova, ma le funzioni trigonometriche provengono da librerie diverse su ogni piattaforma, quindi un modello il cui assemblaggio le usa in modo che i due arrotondino diversamente potrebbe differire nell’ultimo bit tra la riga di comando e il browser."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "L’altra metà del fidarsi di un numero: verificarlo rispetto al modello:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "La descrizione tecnica completa:"
    }
  ]
};

export default body;
