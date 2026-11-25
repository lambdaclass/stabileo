import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Presentare Stabileo alle 29e Giornate argentine di ingegneria strutturale",
  "excerpt": "Il 18 settembre abbiamo presentato a Córdoba il lavoro 86N: un agente di calcolo strutturale che propone modifiche e lascia ogni numero a un solutore verificato. Che cosa abbiamo mostrato, perché l’agente va tenuto separato dal calcolo e che cosa ci siamo portati a casa.",
  "blocks": [
    {
      "k": "p",
      "t": "Le 29e Giornate argentine di ingegneria strutturale (JAIE) si sono svolte a Córdoba dal 16 al 18 settembre, organizzate dall’Asociación de Ingenieros Estructurales. L’ultimo giorno abbiamo presentato il lavoro 86N, “Development of a structural calculation agent on a verified solver”, di Bautista Chesta, Raúl Bertero, Federico Carrone e Diego Kingston, nella sessione sull’intelligenza artificiale applicata all’ingegneria civile."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta che parla al pubblico; sullo schermo, un telaio a quattro campate con una trave cerchiata di rosso e il titolo “La struttura viene ricalcolata”.",
      "caption": "Presentazione del lavoro 86N. Sullo schermo, il momento in cui una trave smette di verificare e l’intero modello viene risolto di nuovo."
    },
    {
      "k": "h",
      "t": "Che cosa abbiamo mostrato"
    },
    {
      "k": "p",
      "t": "Il lavoro si regge su una regola architetturale: l’agente di IA interpreta ciò che l’ingegnere chiede e propone azioni, ma ogni numero viene dal solutore e dai moduli CIRSOC, che l’agente non può modificare. La chiamiamo il confine di determinismo."
    },
    {
      "k": "p",
      "t": "Nella presentazione l’abbiamo mostrato su un telaio a portale in calcestruzzo armato che non verifica. L’agente propone una trave più alta, il solutore risolve di nuovo l’intero modello e la verifica CIRSOC 201 viene ricalcolata sulla nuova struttura: il rapporto domanda/capacità scende da 1,10 a 0,97. Il lavoro riproduce quella verifica a mano, passo dopo passo."
    },
    {
      "k": "p",
      "t": "Il secondo caso era un edificio a quattro campate e tre piani con un pilastro eliminato. Alcune travi smettono di verificare, le loro sezioni vengono ridimensionate e ogni asta torna a verificare, con il solutore che risolve l’intero modello a ogni passo."
    },
    {
      "k": "h",
      "t": "Perché serve il confine"
    },
    {
      "k": "p",
      "t": "Per mostrarlo, abbiamo dato ad assistenti di IA generici la stessa richiesta di predimensionamento quindici volte. Hanno restituito sette sezioni diverse. La parte più eloquente: undici esecuzioni concordavano sul momento di progetto e hanno comunque proposto sei sezioni diverse."
    },
    {
      "k": "table",
      "caption": "La stessa richiesta di predimensionamento, ripetuta, e il telaio a portale corretto con il solutore.",
      "head": [
        "Che cosa",
        "Valore"
      ],
      "rows": [
        [
          "Esecuzioni della stessa richiesta",
          "15"
        ],
        [
          "Sezioni diverse restituite",
          "7"
        ],
        [
          "Rapporto tra l’area maggiore e quella minore",
          "1.80"
        ],
        [
          "Esecuzioni concordi su Mu = 207 kN·m",
          "11"
        ],
        [
          "Sezioni diverse tra quelle esecuzioni",
          "6"
        ],
        [
          "D/C del telaio a portale prima della correzione",
          "1.10"
        ],
        [
          "D/C del telaio a portale dopo la correzione",
          "0.97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Con un solutore dietro, lo stesso modello dà ogni volta lo stesso numero, e quel numero si può verificare. È ciò che vogliamo che un ingegnere possa firmare con fiducia."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston e Bautista Chesta, con i badge degli autori, davanti alla parete degli sponsor del congresso.",
      "caption": "Con Diego Kingston, coautore del lavoro, al congresso."
    },
    {
      "k": "h",
      "t": "Che cosa ci siamo portati a casa"
    },
    {
      "k": "p",
      "t": "Siamo tornati con contatti tra ingegneri strutturisti di tutto il paese e un invito a unirci alla rete degli ingegneri strutturisti. Abbiamo parlato anche con le università di Córdoba di usarlo nei loro corsi."
    },
    {
      "k": "p",
      "t": "Il lavoro completo è su stabileo.com/paper, e Stabileo funziona nel browser senza niente da installare."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Un riassunto del lavoro, con entrambi i casi e i loro numeri:"
    }
  ]
};

export default body;
