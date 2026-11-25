import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Quali dati di utilizzo anonimi invia Stabileo",
  "description": "L’elenco completo dei dati di utilizzo anonimi che Stabileo invia, cosa non invia mai e come disattivarli.",
  "eyebrow": "Privacy",
  "lead": "Con un account, Stabileo condivide dati di utilizzo anonimi dal momento in cui lo crei; senza account, solo se lo scegli. Puoi cambiarlo in qualsiasi momento in Impostazioni o nel tuo profilo. Ci dice quali strumenti vengono usati e quali falliscono, così possiamo decidere cosa migliorare per primo. Questo è l’elenco completo di ciò che viene inviato.",
  "blocks": [
    {
      "k": "h",
      "t": "Cosa viene inviato"
    },
    {
      "k": "ul",
      "items": [
        "Quale strumento scegli (ad esempio asta, vincolo o carico) e quale diagramma mostri.",
        "Ogni calcolo: se è riuscito o fallito, quanto ha richiesto, se era 2D o 3D e la dimensione del modello per fasce (ad esempio, da 11 a 50 aste).",
        "Gli esempi che apri, le analisi avanzate e i metodi passo dopo passo che usi.",
        "Le esportazioni, con il loro formato.",
        "La modalità (Base o PRO), la versione dell’app e la lingua.",
        "Un id casuale per questa visita. Se rispondi all’avviso con “Ho capito”, anche uno per questo browser, memorizzato al suo interno per contare i browser distinti. Nessuno dei due è collegato al tuo account."
      ]
    },
    {
      "k": "h",
      "t": "Cosa non viene mai inviato"
    },
    {
      "k": "ul",
      "items": [
        "Geometria, carichi, sezioni o qualsiasi valore dei tuoi modelli.",
        "I nomi dei tuoi progetti o file.",
        "Il tuo nome, la tua e-mail o il tuo indirizzo IP insieme agli eventi."
      ]
    },
    {
      "k": "h",
      "t": "Per quanto tempo viene conservato"
    },
    {
      "k": "p",
      "t": "Gli eventi vengono conservati fino a tredici mesi e analizzati in forma aggregata."
    },
    {
      "k": "h",
      "t": "Come cambiarlo"
    },
    {
      "k": "p",
      "t": "In Impostazioni, alla voce Privacy, o nel tuo profilo se hai un account. Se smetti di condividere, gli eventi non ancora inviati vengono scartati."
    }
  ],
  "faqTitle": "Domande frequenti",
  "faq": []
};

export default body;
