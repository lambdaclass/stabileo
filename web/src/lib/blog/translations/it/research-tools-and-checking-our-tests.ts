import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ricerca, strumenti e verifica dei nostri test",
  "excerpt": "Cosa abbiamo pubblicato negli ultimi giorni: ricerca eseguibile, otto calcolatori e verifiche sui modelli di riferimento stessi. Cosa funziona, cosa era sbagliato e cosa richiede ancora revisione.",
  "blocks": [
    {
      "k": "p",
      "t": "Negli ultimi giorni abbiamo aggiunto Stabileo Research e Stabileo Tools, e rafforzato le verifiche che stanno dietro. Stabileo è un software gratuito e open source per l’ingegneria strutturale con IA, pubblicato da Ergodic Group. LambdaClass è il suo braccio di sviluppo."
    },
    {
      "k": "h",
      "t": "Ricerca che puoi eseguire"
    },
    {
      "k": "p",
      "t": "Stiamo portando nel browser articoli pubblicati di ingegneria strutturale e benchmark classici, con il visualizzatore di Stabileo. Ogni pagina dichiara cosa riproduce, come è stata verificata e i limiti del confronto. Stiamo completando le pagine che mostrano ancora confronti aperti."
    },
    {
      "k": "img",
      "base": "blog/research",
      "w": 1600,
      "h": 1000,
      "alt": "La pagina di Stabileo Research, “Ricerca in ingegneria strutturale”, con la nota “Ricerca, non uno strumento di progetto” e la prima voce eseguibile, il telaio di Lee (1968), mostrato con il suo percorso di carico tracciato.",
      "caption": "stabileo.com/research: ogni pagina dichiara cosa riproduce e come è stata verificata."
    },
    {
      "k": "p",
      "t": "Le pagine di articoli già attive riguardano la frattura phase-field di Shauer (2025); le reti di molle di Grossman e Boudaoud (2026); l’ottimizzazione topologica di Andreassen et al. (2011); la stabilità del telaio di Roorda di Ferrari e Sigmund (2025); il form finding di reti di cavi di Pastrana et al. (2026); gli archi a scatto di Zmyślony, Khan e Biggins (2026); e i gridshell di Fairclough et al. (2026)."
    },
    {
      "k": "p",
      "t": "I classici del motore sono MacNeal–Harder, il percorso a ostacoli dei gusci, l’elastica di Mattiasson, Riks/Crisfield, Newmark, CQC, il collasso plastico, la piastra di Navier, il telaio di Lee e l’arco di DaDeppo–Schmidt. Le pagine distinguono il calcolo dal vivo dalla riproduzione registrata e mostrano i limiti del loro confronto. Il confronto di Koiter di Ferrari è incompleto; Fairclough copre un solo esempio a cinque nodi; il salto di equilibrio dell’arco a scatto non è una simulazione transitoria."
    },
    {
      "k": "p",
      "t": "Pubblichiamo l’ambito e le prove e li rivediamo in modo aperto. I risultati della ricerca non sono risultati di progetto, e la concordanza con un benchmark non è certificazione."
    },
    {
      "k": "table",
      "caption": "Attivo oggi:",
      "head": [
        "Offerta",
        "Numero"
      ],
      "rows": [
        [
          "Pagine di articoli eseguibili",
          "7"
        ],
        [
          "Pagine di benchmark del motore",
          "10"
        ],
        [
          "Calcolatori",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Anche i test vanno verificati"
    },
    {
      "k": "p",
      "t": "Alcune pagine erano sbagliate perché i nostri modelli di prova erano sbagliati. Ogni pagina di benchmark del motore e il suo test nella CI del motore ora leggono lo stesso file del caso, quindi la correzione di un modello aggiorna entrambi. Alcuni confronti provvisori restano esplicitamente ignorati nella CI e non bloccano ancora le integrazioni; stiamo completando quei confronti."
    },
    {
      "k": "p",
      "t": "Abbiamo corretto i riferimenti di Mattiasson e il trattamento dell’estensione assiale (#845), un telaio a nodi rigidi confrontato con una formula di travatura reticolare solo assiale (#846) e modelli errati di vincolo e carico dei gusci (#810). Stiamo cambiando il modo in cui si costruiscono i benchmark perché questo tipo di errore non possa passare di nuovo. La prima parte è già dentro: ogni benchmark è una specifica con due riferimenti indipendenti che devono concordare, e controlli automatici del carico applicato, dell’equilibrio delle reazioni e della simmetria, compreso il mezzo modello rispetto al modello intero. Stiamo aggiungendo la convergenza su tre o più mesh, un test dell’errore di segno che dimostri che ogni benchmark può fallire e l’approvazione di un ingegnere sull’insieme di base."
    },
    {
      "k": "img",
      "base": "blog/research-mattiasson",
      "w": 1600,
      "h": 1000,
      "alt": "La pagina del benchmark dell’elastica a mensola di Mattiasson (1981), scheda Risultati: un grafico di u/L e v/L rispetto a PL²/EI con le curve di Stabileo e cerchi per i riferimenti analitici, e una tabella dei valori con i loro errori relativi. A sinistra, “5 verifiche su 5 superate” e “Ricerca, non uno strumento di progetto”.",
      "caption": "La pagina di Mattiasson corretta: la risposta del motore rispetto a due riferimenti analitici indipendenti."
    },
    {
      "k": "p",
      "t": "Stiamo anche introducendo le unità di misura nel sistema dei tipi (#864), così gli scambi tra kN/N o m/mm vengono intercettati in fase di compilazione. La prima parte, per il percorso di materiali e sezioni dei telai 2D, è arrivata il 3 novembre."
    },
    {
      "k": "h",
      "t": "Secondo giro: ogni pagina rivista di nuovo"
    },
    {
      "k": "p",
      "t": "Ogni pagina di ricerca pubblicata ha poi superato una seconda revisione, da parte di tre modelli AI in sequenza (Kimi, poi Codex, poi Claude), e ogni rilievo che abbiamo potuto verificare è stato corretto. Quindici pagine sono state riviste insieme e pubblicate il 4 novembre (#1068): sei paper (Shauer, Pastrana, Ferrari, Zmyślony, Grossman e Fairclough) e nove benchmark del motore (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, l’esempio di collasso plastico secondo Horne, SRSS/CQC e Mattiasson, che ha avuto un terzo giro). Nessuna tolleranza è stata allentata e nessun test è stato rimosso. La revisione da parte di ingegneri in attività deve ancora arrivare."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder confrontava valori assoluti, quindi un risultato con il segno sbagliato sarebbe passato. I riferimenti ora portano il loro segno, e un test rifiuta una risposta invertita in ogni caso.",
        "Riks/Crisfield poteva segnalare un punto limite senza una caduta del carico. Un limite ora richiede una caduta tra passi convergenti; la pagina dice che l’analisi supera il punto limite superiore invece di “traccia lo snap-through”, e le sue tolleranze sono passate dal 5 % a valori tra 5e-3 e 1e-5.",
        "Navier spiegava l’errore del MITC4 invece di misurarlo. Ora è confrontato con una serie di Reissner–Mindlin indipendente, e l’errore del MITC4 con vincolo rigido scende da −1.951 % a 4×4 a −0.036 % a 32×32, al secondo ordine.",
        "Le pagine dicono con che cosa sono confrontate. Newmark è verificato rispetto a soluzioni esatte in forma chiusa, non al “codice dell’autore”; SRSS/CQC è un’illustrazione del metodo, non una riproduzione dell’edificio del paper; i limiti del collasso plastico sono derivazioni a mano nostre, non una citazione; il riferimento di 1.83 kN del telaio di Lee è la lettura di una figura pubblicata, quindi si dichiarano solo differenze in percentuale intera."
      ]
    },
    {
      "k": "h",
      "t": "Su telefoni e tablet"
    },
    {
      "k": "p",
      "t": "Misurate sul sito pubblicato, le pagine di ricerca non andavano in overflow su un telefono, ma l’esperimento stava sotto tutto l’articolo, il visualizzatore era stretto (356×189 px per una piastra quadrata), e ogni pagina aveva da 25 a 40 controlli sotto i 32 px e da 14 a 20 testi sotto i 12 px. Ora l’esperimento viene subito dopo il titolo, il visualizzatore è dimensionato sul modello, i controlli sono di almeno 44 px e il testo di almeno 12 px (#831)."
    },
    {
      "k": "img",
      "base": "blog/research-phone",
      "w": 1600,
      "h": 1000,
      "alt": "Due schermate di telefono di Stabileo Research affiancate, larghe 390 px. A sinistra, la pagina della rete di cavi secondo Pastrana et al. (2026), “Four cables, one equilibrium”, con il visualizzatore subito sotto il titolo; a destra, il benchmark della piastra di Navier, il cui visualizzatore occupa tutta la larghezza dello schermo e mostra lo spostamento verso il basso della piastra.",
      "caption": "La ricerca su un telefono: l’esperimento dopo il titolo, e un visualizzatore largo quanto lo schermo."
    },
    {
      "k": "p",
      "t": "Una verifica permanente renderizza la galleria e ogni pagina eseguibile a 360, 390, 844×390 e 810 px, in spagnolo, inglese e portoghese, e fallisce in caso di overflow orizzontale, controlli piccoli, testo piccolo, o un visualizzatore assente, troppo piccolo o troppo in basso. Le sue prime esecuzioni hanno trovato bug reali, e si sono corretti i layout, non la verifica: il visualizzatore di Mattiasson era alto 187 px in orizzontale su telefono e ora è di 280 px, e un grafico di convergenza stampava le sue etichette a 9 px. Un test di reflow ha scoperto che le schede di Shauer andavano in overflow in portoghese e turco a 360 px."
    },
    {
      "k": "h",
      "t": "Otto calcolatori, con un accesso all’editor"
    },
    {
      "k": "p",
      "t": "Stabileo Tools ha ora calcolatori gratuiti per travi appoggiate, mensole, instabilità elastica dei pilastri, travi continue, portali a una campata, travature reticolari piane, linee d’influenza con carichi mobili e frequenze flessionali delle travi. Usano il motore di produzione, mostrano confronti classici indipendenti e dichiarano le loro ipotesi. Ciascuno apre il proprio modello nell’editor completo. Sono strumenti di analisi, non verifiche normative di progetto complete."
    },
    {
      "k": "img",
      "base": "blog/tools",
      "w": 1600,
      "h": 1000,
      "alt": "La pagina di Stabileo Tools, “Calcolatori di ingegneria gratuiti”, che si apre con il calcolatore della trave appoggiata: una trave sotto un carico distribuito con la sua deformata e un pulsante Apri.",
      "caption": "stabileo.com/tools: otto calcolatori sul motore di produzione."
    },
    {
      "k": "h",
      "t": "Contenere i risultati errati"
    },
    {
      "k": "p",
      "t": "Stiamo contenendo ogni problema noto di risultato errato: i rifiuti o gli avvisi nel motore portano l’ID del problema noto, invece di restituire un numero non verificato (#807, integrato il 5 novembre). Ogni rifiuto è testato, compresi i modelli dinamici non supportati con offset di aste o gusci."
    },
    {
      "k": "p",
      "t": "I test metamorfici hanno messo in luce bug di invarianza: modelli equivalenti potevano essere rifiutati dopo una rotazione, uno specchio o un cambio di scala delle unità. Ora eseguiamo la suite metamorfica a ogni modifica per intercettare queste regressioni. Stiamo aggiungendo un’esecuzione notturna di modelli casuali che raggruppa i rilievi per causa radice e apre una segnalazione per ogni causa radice."
    },
    {
      "k": "h",
      "t": "Da allora: dall’1 al 3 novembre"
    },
    {
      "k": "ul",
      "items": [
        "La modalità di analisi di PRO è terminata. I risultati che erano sbagliati senza alcun avviso sono corretti: il generatore di carichi non carica più la gronda di una tettoia come un solaio, e il peso sismico di un livello ora include i solai e le pareti disegnati come gusci, che prima ometteva (#1076).",
        "Le esportazioni funzionano su edifici reali. I grandi fogli Excel si scrivono riga per riga, e la relazione di un edificio di sei piani richiede circa dieci secondi invece di quattro minuti. “Verifica una relazione esportata” ora confronta i numeri stampati, non solo le impronte (#1076).",
        "PRO ha guadagnato una guida in linea che si può disattivare, uno stato di salvataggio nell’intestazione, una relazione dopo l’analisi, i risultati delle piastre e un visualizzatore in sola lettura per i modelli condivisi con “Duplica e modifica” (#1077, #1078).",
        "Un moltiplicatore di instabilità oltre il suo limite superiore certificato in modo indipendente viene ora rifiutato, in 2D e 3D (#817, versione dei risultati 6). Riesegui la certificazione prima di fare affidamento su un certificato di instabilità precedente.",
        "I link di condivisione con numeri non finiti, o con aste, vincoli o carichi che puntano a qualcosa che manca, vengono rifiutati invece di essere aperti (#1058).",
        "La suite di invarianza ora verifica sei analisi prioritarie per rotazione, specchio e sovrapposizione, e quattro di esse per scala uniforme della rigidezza (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Verifiche che rispondono in venti minuti"
    },
    {
      "k": "p",
      "t": "Prima di arrivare in main, ogni modifica a Stabileo supera le verifiche che può interessare, e una modifica al motore le supera tutte: test del motore, test unitari web, build di produzione, test end-to-end in un browser, gli snapshot dei risultati e il controllo di determinismo. Una correzione di sicurezza è veloce quanto quelle verifiche, quindi il 4 novembre abbiamo lavorato sulla loro velocità. Abbiamo misurato prima. In un’esecuzione pulita della coda di merge di 44–47 minuti, i test del motore e quelli unitari finivano 8–15 minuti prima della fine, quindi aggiungerne altri in parallelo non avrebbe guadagnato nulla. Il tempo andava alla costruzione dei bundle di ricerca uno dopo l’altro e allo shard end-to-end più lento. Quando quelli sono diventati più brevi, lo shard più lento era lento per via della preparazione: in un’esecuzione ha speso 7.2 dei suoi 16 minuti nei test e sei minuti e mezzo a scaricare pacchetti del browser da un mirror lento."
    },
    {
      "k": "ul",
      "items": [
        "Costruire una volta, testare ciò che è stato costruito. I test della build di produzione eseguivano altre cinque build proprie, quattro delle quali dello stesso albero che la CI aveva appena costruito; quelle quattro ora leggono quella build (#1411). Ogni build porta un’impronta di tutto ciò da cui è stata costruita, e un test fallisce, mai salta, se l’impronta non corrisponde all’albero su cui gira.",
        "Cache per ingresso. Ogni bundle di ricerca è messo in cache con una chiave dei propri ingressi, compreso il motore che ogni bundle collega, quindi una modifica a un paper ricostruisce solo quel paper e una modifica al motore li ricostruisce tutti. Una pull request riutilizza i bundle che la coda di merge ha già costruito dagli stessi ingressi, dopo aver controllato ogni file rispetto al suo checksum, e può leggere quella cache ma non scriverla mai (#1395). Anche i pacchetti del browser vengono da una cache, invece che dal mirror (#1413).",
        "Eseguire solo ciò che una modifica può influenzare. Una modifica alla documentazione non costruisce nulla, in uno o due minuti invece di un’esecuzione intera. Una modifica al solo sito salta i job del motore ma mantiene ogni shard end-to-end, perché 59 delle 281 specifiche leggono testo sullo schermo (#1381). Nella coda, ogni voce è delimitata dal proprio diff rispetto alla voce che la precede, il che è corretto perché una voce viene integrata solo se tutte quelle che la precedono sono passate; quando il diff manca o non è chiaro, esegue tutto (#1400).",
        "Bilanciare il percorso più lento. I test end-to-end girano in 14 shard invece di 10, bilanciati su tempi misurati (#1382). La vecchia tabella dei tempi prevedeva 41.5 minuti di test dove un’esecuzione ne richiedeva 69.8."
      ]
    },
    {
      "k": "table",
      "caption": "Tempo totale delle esecuzioni CI riuscite che hanno eseguito ogni job, dalla creazione all’ultimo job, misurato con l’API di GitHub Actions. Prima: 4 novembre, dalle 08:00 UTC (pull request) o dalle 13:48 UTC (coda di merge) alle 21:10 UTC; dopo: dalle 21:15 UTC alle 03:00 UTC del 5 novembre.",
      "head": [
        "Esecuzioni",
        "Numero",
        "Mediana",
        "Intervallo"
      ],
      "rows": [
        [
          "Coda di merge, prima",
          "20",
          "42 min",
          "da 25 a 56 min"
        ],
        [
          "Coda di merge, dopo",
          "10",
          "20 min",
          "da 15 a 26 min"
        ],
        [
          "Pull request (primo tentativo), prima",
          "69",
          "59 min",
          "da 35 a 127 min"
        ],
        [
          "Pull request (primo tentativo), dopo",
          "19",
          "27 min",
          "da 16 a 45 min"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Una verifica rossa che non è colpa della modifica"
    },
    {
      "k": "p",
      "t": "Un errore causato dalla rete o da una macchina persa è rumore, ma è anche una verifica rossa che qualcuno deve guardare, e l’abitudine di rieseguire le verifiche rosse è il modo in cui un errore vero passa inosservato. Quindi i job falliti di una pull request vengono rieseguiti una volta, automaticamente, solo quando ogni job fallito porta evidenza positiva di un guasto dell’infrastruttura: un timeout in un passo di download, una macchina CI persa a metà job, un errore di rete che chiude l’ultimo tentativo di un download (#1380). Qualsiasi cosa che somigli a un fallimento di test in qualunque punto del log blocca la riesecuzione, così come qualsiasi cosa che il classificatore non riconosce. Questo lo mantiene prudente: riesegue al massimo una volta e mai dopo un passo di test fallito. Non è una garanzia: un errore intermittente che il classificatore interpreta male come infrastruttura potrebbe passare alla riesecuzione, ed è per questo che qualsiasi cosa non riconosca blocca la riesecuzione."
    },
    {
      "k": "p",
      "t": "Altre due correzioni hanno eliminato falsi allarmi. Un’esecuzione di pull request annullata perché una più recente sullo stesso commit l’aveva sostituita mostrava una verifica obbligatoria rossa; ora salta quella verifica, ma solo dopo aver confermato che l’esecuzione più recente esiste e non è fallita, perché una verifica obbligatoria saltata conta come superata (#1397). E un download bloccato poteva lasciare un processo che teneva il lock del gestore di pacchetti, così il nuovo tentativo falliva sul lock e non sul download; ora un tentativo conta come bloccato solo dopo minuti senza output, viene fermato insieme a tutto ciò che ha avviato, e il nuovo tentativo attende il lock (#1408)."
    },
    {
      "k": "h",
      "t": "Cosa viene dopo"
    },
    {
      "k": "p",
      "t": "Stiamo completando i confronti aperti e rendendo più veloci il sito e il solutore. Prossimi nella roadmap ci sono un pacchetto Python (pip install stabileo) e un manuale di verifica pubblico generato dai benchmark."
    }
  ]
};

export default body;
