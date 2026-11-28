import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Certificati end-to-end: verificare il risultato rispetto al modello",
  "excerpt": "Un certificato che dimostra che un sistema assemblato male è stato risolto bene non vale granché. Come Stabileo ricostruisce da solo ogni modello di telaio e certifica il risultato rispetto al modello, cosa ha trovato e cosa lascia fuori.",
  "blocks": [
    {
      "k": "p",
      "t": "Da settimane ogni analisi statica lineare di Stabileo passa per un certificato che, quando si ottiene, dà un limite verificato da una macchina all’errore con cui è stato risolto il sistema di equazioni K·u = f. Ma quel sistema lo assembla il motore stesso. Se l’assemblaggio avesse un errore, un segno sbagliato in una trasformazione, un termine di Timoshenko mancante, una forza di incastro perfetto errata, il certificato dimostrerebbe con tutto il rigore che il sistema sbagliato è stato risolto correttamente."
    },
    {
      "k": "p",
      "t": "I certificati end-to-end colmano quella lacuna per telai e travature reticolari, in 2D e in 3D: il risultato è verificato rispetto al modello così com’è scritto, non rispetto alle matrici assemblate dal motore."
    },
    {
      "k": "h",
      "t": "Un secondo assemblaggio, indipendente"
    },
    {
      "k": "p",
      "t": "Un verificatore scritto a parte ricostruisce la rigidezza e i carichi a partire dai dati del modello, senza chiamare alcuna funzione di elemento o di assemblaggio del motore. Usa formule proprie e una propria numerazione dei gradi di libertà:"
    },
    {
      "k": "ul",
      "items": [
        "la flessione di ogni asta dalla flessibilità a mensola, invertita, e l’altro estremo dall’equilibrio, con la deformazione a taglio di Timoshenko;",
        "le cerniere con condensazione statica, una rotazione svincolata alla volta;",
        "i carichi sulle aste come lavoro sulle deformate esatte dell’asta scarica, con gli integrali in forma chiusa;",
        "assi locali, vincoli inclinati, molle, collegamenti rigidi, diaframmi e vincoli multipunto, ricavati dalle convenzioni del modello."
      ]
    },
    {
      "k": "p",
      "t": "Tutto è calcolato in aritmetica degli intervalli, seni e coseni compresi, con limiti rigorosi: ogni dato del modello entra come il decimale con cui è stato digitato, racchiuso in un intervallo. Quando una decisione dipende da una soglia che l’intervallo non può stabilire, il verificatore rifiuta invece di indovinare."
    },
    {
      "k": "h",
      "t": "Cosa afferma il certificato"
    },
    {
      "k": "p",
      "t": "Con quella rigidezza esatta, il verificatore dimostra che il modello ha una soluzione unica e limita la distanza tra gli spostamenti restituiti dal motore e quella soluzione, su ogni grado di libertà che il modello determina. Le matrici del motore non hanno parte in quell’affermazione. Vengono confrontate a parte: devono concordare con quelle ricostruite a una parte su 10¹⁰, e gli spostamenti devono soddisfare i vincoli del modello a una parte su 10⁹. In caso contrario, il risultato è riportato come non verificato end-to-end, con il motivo."
    },
    {
      "k": "p",
      "t": "Il teorema alla base del limite è dimostrato in Lean. Nell’app, il pannello dei risultati mostra la riga “Verificato end-to-end” con il limite sull’errore di spostamento, oppure il motivo per cui non è stato possibile verificarlo."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con l’esempio del telaio a portale risolto. In Verifiche del risultato nel pannello dei risultati, la riga “Verificato end-to-end: un riassemblaggio indipendente del modello concorda; errore di spostamento ≤ 3.68e-15” compare sotto il certificato.",
      "caption": "La riga nel pannello dei risultati, sull’esempio del telaio a portale."
    },
    {
      "k": "h",
      "t": "Cosa ha trovato"
    },
    {
      "k": "table",
      "caption": "Modelli verificati end-to-end nell’integrazione continua: in tutti l’assemblaggio del motore concorda con quello ricostruito.",
      "head": [
        "Insieme",
        "Modelli",
        "Certificati"
      ],
      "rows": [
        [
          "Modelli di prova 2D",
          "82",
          "82"
        ],
        [
          "Modelli di prova 3D",
          "32",
          "32"
        ],
        [
          "Telai 2D casuali",
          "200",
          "200"
        ],
        [
          "Telai 3D casuali",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ogni modello di prova e centinaia di telai generati a caso concordano e sono certificati, e gli errori di assemblaggio inseriti di proposito nel motore fanno fallire la verifica. Ha trovato anche problemi reali:"
    },
    {
      "k": "ul",
      "items": [
        "un diaframma 3D nel piano XZ legava i nodi con la rotazione dal segno sbagliato;",
        "in 2D, un momento su un nodo dove ogni asta è incernierata veniva assorbito da una molla artificiale, e il certificato del sistema assemblato lo faceva passare benché il modello non abbia soluzione;",
        "un collegamento rigido a partire da un nodo del genere nascondeva un meccanismo reale."
      ]
    },
    {
      "k": "p",
      "t": "I primi due sono corretti: il diaframma segue la rotazione di corpo rigido, e quel momento è rifiutato prima del calcolo. E quando il motore ha cambiato il significato di diaframma, in modo che l’intero piano ruoti come un unico corpo, il verificatore non ha fatto passare nulla di falso: è rimasto onesto, con limiti inutili, finché le sue convenzioni non sono state aggiornate. È esattamente a questo che serve un controllo indipendente."
    },
    {
      "k": "h",
      "t": "Cosa lascia fuori"
    },
    {
      "k": "ul",
      "items": [
        "Gusci, solidi, connettori, travi curve e torsione con ingobbamento non sono ancora ricostruiti: sono riportati come fuori ambito, mai come verificati.",
        "Le formule del verificatore codificano la meccanica del modello. Sono scritte separatamente dal motore e confrontate con esso, ma non sono dimostrate.",
        "L’implementazione in Rust non è dimostrata equivalente all’algoritmo in Lean, come per ogni certificato.",
        "Un certificato dice che il risultato appartiene al modello. Non dice che il modello rappresenti bene la struttura: quello resta il lavoro dell’ingegnere."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Gli altri modi in cui cerchiamo gli errori, e i loro limiti:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/CERTIFY.md",
      "label": "CERTIFY.md, “Certificati end-to-end”",
      "t": "La descrizione tecnica completa, con le formule e i test:"
    }
  ]
};

export default body;
