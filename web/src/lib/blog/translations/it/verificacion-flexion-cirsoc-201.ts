import type { PostBody } from '../../types';
import { flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Verifica a flessione secondo CIRSOC 201, passo dopo passo",
  "excerpt": "Quasi tutti ricordano φMn ≥ Mu. Quella è l’ultima riga della verifica, non la verifica. L’esito si decide prima, e uno di quei passi può far scendere φ sotto 0,9.",
  "blocks": [
    {
      "k": "p",
      "t": "La maggior parte delle persone ricorda una verifica a flessione come una sola disuguaglianza: φMn ≥ Mu. È vero, ed è l’ultima riga. Ciò che decide l’esito avviene prima, in passi che raramente ricevono un’occhiata attenta perché sembrano burocrazia."
    },
    {
      "k": "p",
      "t": "Ecco cosa restituisce il modulo CIRSOC 201 di Stabileo per una trave di 20×40 cm in calcestruzzo H-25, acciaio fy 420, copriferro di 25 mm e staffe da 8 mm, sotto un momento di 60 kN·m:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Armatura tesa: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Dieci passaggi. Il decimo è quello che tutti ricordano. Quelli che decidono il risultato sono il terzo e il nono."
    },
    {
      "k": "h",
      "t": "Passaggio 3: il minimo governa più spesso di quanto sembri"
    },
    {
      "k": "p",
      "t": "L’articolo 9.6.1.2 richiede un’armatura minima a flessione pari al maggiore tra 0.25·√f'c/fy·bw·d e 1.4/fy·bw·d. Di solito la si tratta come un limite che quasi mai viene raggiunto. Nelle travi degli edifici residenziali viene raggiunto di continuo."
    },
    {
      "k": "table",
      "caption": "La stessa trave 20×40 in H-25 sotto momenti crescenti: che cosa decide l’armatura.",
      "head": [
        "Mu [kN·m]",
        "As per resistenza [cm²]",
        "As,min [cm²]",
        "Governa"
      ],
      "rows": [
        [
          "15",
          "1.12",
          "2.39",
          "il minimo"
        ],
        [
          "30",
          "2.28",
          "2.39",
          "il minimo"
        ],
        [
          "60",
          "4.73",
          "2.39",
          "la resistenza"
        ],
        [
          "90",
          "7.38",
          "2.39",
          "la resistenza"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Il punto di incrocio è a Mu = 31,5 kN·m. Sotto quel momento, dimensionare per resistenza non serve a nulla: la sezione porta comunque 2,39 cm². Conviene sapere da che parte dell’incrocio si trova una trave prima di discutere della sua armatura."
    },
    {
      "k": "h",
      "t": "E il minimo raramente dipende dal calcestruzzo"
    },
    {
      "k": "p",
      "t": "Delle due espressioni dell’articolo, quella con √f'c supera l’altra solo per calcestruzzi piuttosto resistenti."
    },
    {
      "k": "table",
      "caption": "Le due espressioni del minimo, per fy 420, per mille.",
      "head": [
        "Calcestruzzo",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Governa"
      ],
      "rows": [
        [
          "H-20",
          "2.6620",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2.9762",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3.2603",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3.5215",
          "3.3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Il punto di incrocio è a f'c = 31,36 MPa. In tutto l’intervallo usato nell’edilizia residenziale (H-20, H-25, H-30), l’armatura minima non dipende dal calcestruzzo: viene da 1.4/fy e da nient’altro. Passare da H-20 a H-30 non riduce il minimo nemmeno di un centimetro quadrato."
    },
    {
      "k": "h",
      "t": "Passaggio 9: φ non è automaticamente 0,9"
    },
    {
      "k": "p",
      "t": "Il coefficiente di riduzione della resistenza si insegna come 0,90 per la flessione e poi lo si tratta come una costante. Non lo è. Dipende dalla deformazione dell’acciaio teso allo stato ultimo, e il modulo lo dice nel passaggio 9: εt ≥ 5‰ → controllata dalla trazione → φ = 0,90. Metti più acciaio nella sezione e εt scende, trascinandosi dietro φ."
    },
    {
      "k": "table",
      "caption": "La stessa trave, caricata ogni volta di più. εt e φ vengono dai passaggi 8 e 9.",
      "head": [
        "Mu [kN·m]",
        "Armatura",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Duttilità"
      ],
      "rows": flexureExampleRows("Verificata", "Non verificata")
    },
    {
      "k": "p",
      "t": "La sezione con 2 Ø32 non è verificata: la sua deformazione a trazione è inferiore al minimo richiesto. Un φ ridotto non soddisfa la verifica di duttilità. Riprogetta la sezione o la sua armatura."
    },
    {
      "k": "quote",
      "t": "La sezione con 2 Ø32 non è verificata: la sua deformazione a trazione è inferiore al minimo richiesto. Un φ ridotto non soddisfa la verifica di duttilità. Riprogetta la sezione o la sua armatura."
    },
    {
      "k": "h",
      "t": "Perché si mette l’acciaio compresso"
    },
    {
      "k": "p",
      "t": "Al limite di duttilità può servire un’armatura in compressione. Non aspettare che l’acciaio teso scenda sotto la sua deformazione di snervamento; verifica la sezione riprogettata alle altezze utili reali delle barre."
    },
    {
      "k": "p",
      "t": "Quindi l’acciaio compresso serve a restituire duttilità alla sezione e a recuperare il coefficiente. La capacità ne segue, come conseguenza."
    },
    {
      "k": "note",
      "t": "Al limite di duttilità può servire un’armatura in compressione. Non aspettare che l’acciaio teso scenda sotto la sua deformazione di snervamento; verifica la sezione riprogettata alle altezze utili reali delle barre."
    },
    {
      "k": "h",
      "t": "Provalo su una trave reale"
    },
    {
      "k": "p",
      "t": "Qui sotto c’è il modello: una trave semplicemente appoggiata di 5 m, 20×40, H-25, con 12 kN/m di carichi permanenti e 8 kN/m di carichi variabili, più il peso proprio. Si apre nel flusso di progetto di PRO, con la CIRSOC 201 come normativa di progetto in vigore."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "I comandi di progetto di Stabileo PRO con la trave 20×40 selezionata.",
      "caption": "Questa schermata è precedente alla correzione dell’appoggio. L’esempio dal vivo qui sotto mostra il risultato attuale."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "La trave in Stabileo, nel flusso di progetto di PRO. Se il progetto è disattivato, premi “Attiva il progetto per questa visita” nell’avviso. Tre pulsanti, in quest’ordine: “Calcola le sollecitazioni”, “Calcola l’acciaio necessario” e “Dimensiona…”. Solo il terzo sceglie le barre, e finché non ci sono barre non c’è nulla da verificare: la tabella dice “nessuna armatura”. La luce di 5 m è modellata con due elementi; entrambi verificano con D/C = 0,91. Governa la flessione positiva in campata (My+). Cambia il carico ed eseguilo di nuovo. Il progetto normativo in PRO è ancora in sviluppo; il modulo del calcestruzzo è la parte implementata e collaudata."
    },
    {
      "k": "h",
      "t": "In breve"
    },
    {
      "k": "ol",
      "items": [
        "Prima di dimensionare, controlla se il momento sta sopra o sotto il punto di incrocio con il minimo. Sotto, l’armatura è già decisa.",
        "Da H-20 a H-30, il minimo non dipende dal calcestruzzo. Viene da 1.4/fy.",
        "φ dipende da εt: leggi sempre i due insieme.",
        "Se compare acciaio compresso, è perché la sezione ha perso duttilità, non perché manchi di capacità."
      ]
    },
    {
      "k": "note",
      "t": "Ricalcola l’altezza utile per ogni diametro di barra selezionato. La tabella delle capacità è controllata con il motore attuale; la sola capacità non è una verifica completa."
    }
  ]
};

export default body;
