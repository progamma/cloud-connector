---
name: release-notes
description: "Scrive le note di rilascio di una versione del Cloud Connector e le pubblica nel corpo della GitHub Release, ricavandole dai commit compresi fra il tag precedente e quello nuovo."
user-intent: "L'utente ha taggato una versione del connettore e vuole le note di rilascio."
---

# Note di rilascio del Cloud Connector

## A chi parlano

Non all'utente finale dell'applicazione: al **sistemista o allo sviluppatore
che installa, configura e aggiorna il connettore**. E' una differenza di
sostanza, non di tono. Qui si nominano senza esitazione le variabili
d'ambiente, le chiavi di `config.json`, i metodi dell'API e i moduli npm,
perche' sono gli oggetti che quella persona maneggia ogni giorno. Le note di
rilascio del prodotto Instant Developer Cloud seguono regole opposte e non
sono il modello da imitare.

Quello che va comunque tolto e' il **dettaglio interno**: il nome del file
sorgente, la classe, il numero di riga, come e' stato risolto. Chi legge
vuole sapere cosa cambia per lui, non dov'era il difetto.

## Lingua

Le note si scrivono **in inglese**. Il repository e' pubblico e si sta
portando all'inglese tutta la documentazione rivolta a chi lo usa, README
compreso; le note nascono gia' cosi'. Le issue aperte fino al 2026 sono in
italiano: sono materiale di lavoro, non un modello da seguire.

## Il vincolo che qui e' facile scordare

Questo repository e' **pubblico**; `progamma/IndeRT` e' **privato**.

I commit del connettore citano spessissimo le issue di IndeRT nella forma
`progamma/IndeRT#15750`, perche' il lavoro nasce di la'. **Quei riferimenti
non vanno nelle note**: manderebbero chi legge a un repository che non puo'
aprire. Le issue del cloud-connector stesso (`Fix #38`, `#107`) invece sono
pubbliche e citabili, ma nella maggior parte dei casi la nota si spiega da
sola e il numero non aggiunge niente.

## Il materiale: i commit, e i diff dove il titolo non basta

Il perimetro e' l'intervallo fra il tag precedente e quello della versione:

```bash
PREV=$(git tag --sort=-v:refname | sed -n 2p)   # il tag prima di quello nuovo
git log --no-merges --format='%h|%ad|%s' --date=short "$PREV..$VER"
```

Il perimetro e' **il tag, non master**: fra il rilascio e la scrittura delle
note su master puo' essere gia' entrato lavoro che di quella versione non
faceva parte. Se lo racconti nelle note prometti a chi aggiorna qualcosa che
nel pacchetto non c'e'.

**Il titolo del commit non basta.** In questo repository i messaggi vanno da
descrizioni ottime a parole sole. Nel giro della 26.3 un commit intitolato
`bachetti` conteneva tre difetti veri, fra cui due metodi dell'API che non
erano proprio utilizzabili — materiale da prima pagina, invisibile
dall'elenco dei titoli. Regola: **apri il diff di ogni commit il cui titolo
non dice cosa cambia per chi usa il connettore**, e in particolare di quelli
generici (`bachetti`, `Uniformato il codice`, `ESLint`, `JSDoc`).

Vale anche al contrario: `Refactor to ES6 classes; Url.download unique temp
file` ha in coda, dopo il punto e virgola, l'unica parte che interessa a chi
legge.

## Forma della nota

- **Un argomento per nota.** Se per unire due cose serve una virgola, sono
  due note.
- **Il difetto all'imperfetto** (`veniva`, `restava`, `non era utilizzabile`),
  la funzionalita' nuova al presente.
- **Niente «ora funziona».** Descrivi cosa andava storto e fermati: che sia
  stato corretto e' implicito nel fatto che sta nelle note. Aggiungi il
  comportamento nuovo solo quando non e' la conseguenza ovvia della
  correzione — un'opzione introdotta insieme al fix, un messaggio che ora
  dice una cosa che prima non diceva.
- **Di' quando si manifestava**, se non era sistematico: solo su una
  piattaforma, solo con certe versioni del database, solo avviando il
  servizio da un'altra directory.
- **Non promettere piu' di quanto e' stato fatto.** Se la correzione rende
  leggibile un errore ma non ne toglie la causa, la nota dice questo.

## Quello che va marcato

Un cambiamento che **rompe chi chiama** va segnalato in grassetto con
`**Attenzione**:` e detto per esteso, anche quando il commit lo tratta come
un allineamento qualsiasi. Nella 26.3 era il plugin Active Directory passato
a `ldapts`, che ha cambiato l'ordine dei parametri in `(identifier,
options)`: chi lo richiama da codice proprio deve mettere mano.

Rientrano nella categoria: firme cambiate, chiavi di `config.json`
rinominate o non piu' lette, variabili d'ambiente nuove che diventano
obbligatorie, moduli di terze parti sostituiti.

## Struttura

Raggruppa per **tipo di modifica**, non per area, per data ne' per autore.
Quattro sezioni, in questo ordine:

1. **Breaking changes** — solo cio' che rompe chi chiama (vedi sopra).
   Va per primo perche' e' l'unica cosa che obbliga a fare qualcosa, e
   perche' chi aggiorna deve trovarla senza leggere il resto. Se non c'e'
   niente, la sezione si omette: non lasciarla vuota.
2. **New and improved** — funzionalita' nuove e cambiamenti di
   comportamento voluti, diagnostica compresa.
3. **Fixes** — cio' che era rotto.
4. **Maintenance** — conversioni, lint, JSDoc, aggiornamenti dei moduli:
   due o tre righe in fondo, senza elencare i commit uno per uno.

Voci puntate, non paragrafi: la pagina si deve poter scorrere con l'occhio.
Dove il soggetto della voce e' un componente, aprila con il nome in
grassetto (`**Active Directory plugin**:`).

Il confine fra le sezioni 2 e 3 e' quello che costa piu' fatica, e la
domanda giusta e': **prima era rotto o funzionava?** Un messaggio d'errore
che diventa piu' preciso e' un miglioramento; un metodo che non era
richiamabile e' una correzione. Nel dubbio guarda il diff, non il titolo del
commit.

Apri con una riga che dice a quale versione del prodotto corrisponde il
rilascio, e chiudi con il link al confronto fra i due tag:

```
**Full Changelog**: https://github.com/progamma/cloud-connector/compare/<prev>...<ver>
```

## Dove finiscono

Nel **corpo della GitHub Release**, che e' quello che si vede: la home del
repository mostra il pannello Releases, non i tag.

```bash
gh release edit "$VER" --repo progamma/cloud-connector --notes-file <file.md>
```

Se la Release non esiste ancora la crea la skill `archive-release` su
IndeRT, insieme al tag e al bump di versione, con la forma fissa che hanno
tutte: nome `Stable X.Y`, tag `X.Y`, nessuna prerelease.

Le release fino alla 26.0 hanno il corpo vuoto: il riferimento di stile e'
la **26.3**, che e' la prima con le note.

## Procedura

1. Ricava la versione dall'argomento della skill o dal linguaggio naturale;
   se manca, chiedila in una riga di prosa.
2. Raccogli i commit dell'intervallo e apri i diff di quelli il cui titolo
   non dice cosa cambia.
3. Raggruppa per area e scrivi le note.
4. **Mostra la bozza all'utente e aspetta.** Le note sono pubbliche e
   restano: la pubblicazione non e' un dettaglio di esecuzione.
5. Pubblica con `gh release edit` e riporta il link.
