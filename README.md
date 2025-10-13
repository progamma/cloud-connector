# cloud-connector

Il Cloud Connector è uno strumento che permette di connettersi a uno o più database remoti da applicazioni sviluppate con Instant Developer Cloud.

Normalmente sono le applicazioni che si connettono al database ed è necessario aprire almeno una porta verso il mondo esterno sul database server.

Con il Cloud Connector installato sul server dove risiede il database, o in un server della stessa rete locale, è il database stesso ad aprire una connessione verso l'applicazione. Questo fa si che non occorra aprire specifiche porte verso l'esterno aumentando di molto la sicurezza.

## Installazione

Per installare il Cloud Connector occorre eseguire le operazioni di seguito descritte:
- Installare [node.js](https://nodejs.org) v 18.20.4 sul server del database o in un server dal quale è possibile connettersi al database che si desidera esporre.
- Scaricare il pacchetto di installazione del software di Cloud Connector dal link seguente:
[https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip](https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip)
- Decomprimere il contenuto del file zip dove si preferisce.
- Rinominare il file `public_html\config_example.json` in `config.json` e aprirlo con un editor di testo per impostare i parametri di configurazione.
- Spostarsi nella directory `public_html` ed eseguire il seguente comando per installare i node_modules:  
`$ npm update`
- Se si desidera installare il plug-in ActiveDirectory occorre spostarsi nella directory `public_html\plugins\activedirectory` ed eseguire nuovamente l’installazione dei relativi node_modules:  
`$ npm update`
- Eseguire il comando `node cloudServer.js` per far partire il connettore.

## Sicurezza
Per garantire una elevata gestione della sicurezza occorre prestare attenzione alla configurazione dei permessi concessi all'utente di accesso al database e di quelli concessi all'utente che avvia il servizio Cloud connector.  

### Utente di database
Per l'utente di database si consiglia di concedere solamente i privilegi di lettura, inserimento, aggiornamento e cancellazione dei dati sulle tabelle.  
Di seguito una serie di buone pratiche per le autorizzazioni dell'utente di accesso al database:  
- Concedi solo i permessi strettamente necessari per svolgere le funzioni richieste.
- Nel caso di privilegi specifici più elevati concedili solo sulle tabelle dove occorrono ed evita di assegnare privilegi globali.
- Non concedere privilegi amministrativi come GRANT, CREATE USER, o ALTER SYSTEM a meno che non sia assolutamente necessario.
- Crea ruoli con set specifici di privilegi per il Cloud Conncetor e assegnali agli utenti per accedere al database.
- Assicurati che le connessioni al database siano sicure (es. SSL/TLS).
- Usa credenziali e permessi diversi per ambienti di sviluppo, test e produzione.
- Ricorda che la sicurezza è un processo continuo e richiede monitoraggio e aggiustamenti regolari.

### Utente per i processi
Per concedere i privilegi necessari a un utente che deve eseguire un processo con PM2 su Node.js, dobbiamo considerare sia i permessi a livello di sistema operativo che quelli specifici per PM2 e Node.js.  
Ecco una guida su come gestire questi privilegi:
- Permessi a livello di sistema operativo.
  - Crea un utente dedicato per l'esecuzione dei processi Node.js/PM2.
  - Concedi a questo utente i permessi di lettura ed esecuzione nella directory del progetto.
  - Assicurati che l'utente possa scrivere nei log e nelle directory temporanee necessarie.
- Permessi per Node.js.
  - L'utente deve avere il permesso di eseguire Node.js.
  - Accesso in lettura alle dipendenze del progetto (node_modules).
- Permessi per PM2.
  - Installa PM2 globalmente o assicurati che l'utente possa accedere all'installazione di PM2.
  - L'utente deve poter eseguire i comandi PM2 (start, stop, restart, list, etc.).
  - Accesso in scrittura alla directory home dell'utente per i file di configurazione PM2.
- Permessi specifici per l'applicazione.
  - Accesso in lettura ai file di configurazione dell'applicazione.
  - Permessi di scrittura per i log dell'applicazione.

## Configurazione

La configurazione del Cloud Connector avviene mediante il file config.json che si trova nella directory `public_html`:
- La sezione principale indica il nome del connettore così come sarà visto dai server di produzione e dai server IDE.   

In questa sezione è riportata anche l'impostazione della chiave privata di criptaggio delle password utilizzate nei singoli `datamodels` che è recuperata da una variabile di ambiente del server nel quale è installato il Cloud Connector.  
L'impostazione di default nel file di esempio della configurazione (config_example.json) è questa `"passwordPrivateKey": "%CC_KEY%",`   
La variabile `%CC_KEY%` deve essere impostata da comando di sistema operativo; può anche essere utilizzato un nome diverso da quello indicato.  
È importante scegliere una chiave privata robusta e non predicibile, generata in modo sicuro. Per approfondimenti: [https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#key-generation](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#key-generation).   
   
Se non viene definita questa variabile di ambiente il Cloud Connector utilizza un suo valore di default. Tuttavia si raccomanda di impostare sempre un valore personalizzato per la proprietà `passwordPrivateKey`, in quanto l'utilizzo del valore di default rende i dati cifrati più vulnerabili a potenziali attacchi.   
   
Le password vengono criptate al primo avvio del Cloud Connector quindi occorre settare la variabile di ambiente `%CC_KEY%` prima di avviarlo.
- È possibile aggiungere una sezione `connectionOptions` al file di configurazione del Cloud Connector per indicare al sistema che deve accettare connessioni anche da server con certificati non validi o autofirmati.  
Attenzione questa impostazione va utilizzata solamente in ambiente di sviluppo in quanto rende insicura l'installazione del Cloud Connector.  
Per abilitare questa impostazione occorre aggiungere questa sezione al dile config.json:  
`"connectionOptions": {
  "rejectUnauthorized": false
},`
- Nella sezione `remoteServers` vanno indicati i server di Instant Developer Cloud che devono essere contattati dal Cloud Connector, quelli dove risiedono gli applicativi che utilizzeranno il database.  
Per esempio:  
`"remoteServers": [prod1-pro-gamma.instantdevelopercloud.com,prod2-pro-gamma.instantdevelopercloud.com],`
- Nella sezione `remoteUserNames` devono essere indicati indicati gli utenti dell’IDE di Instant Developer Cloud a cui il Cloud Connector può collegarsi.  
Per esempio:  
`"remoteUserNames": ["https://ide1-pro-gamma.instantdevelopercloud.com@paolo-giannelli"],` 
- Nella sezione `datamodels` devono essere impostate le informazioni di connessione ai database che si vuole esporre. È possibile elencare più database. Ogni tipo di database ha parametri di connessione specifici. È possibile collegare i seguenti tipi di database:
  - Oracle
  - Postgres
  - SQLServer
  - MySQL
  - ODBC  
- Un esempio di configurazione SQL server è il seguente:
  ```js
  "datamodels": [  
    {  
      "name": "nwind-db",  
      "class": "SQLServer",  
      "APIKey": "00000000-0000-0000-0000-000000000000",  
      "connectionOptions": {  
      "server": "127.0.0.1\\SQLEXPRESS",  
      "database": "nome-database",  
      "user": "utente",  
      "password": "password",  
      "options": {  
        "useUTC": false  
      }  
    }  
  }],
  ```
- Un esempio di configurazione ODBC è il seguente:
  ```js
  "datamodels": [ 
  {
      "name": "nwind-db",
      "class": "ODBC",
      "APIKey": "00000000-0000-0000-0000-000000000000",
      "connectionOptions": {
        "connectionString": "DSN=NorthwindDB;UID=utente-northwinddb;PWD=password-northwinddb",
        "maxSize": 100,
        "connectionTimeout": 30
      }
    }],
  ```
- Nella sezione `fileSystems` devono essere impostate le informazioni delle directory che si desidera condividere.  
Un esempio di condivisione è il seguente:
   ```js
   "fileSystems": [
    {
      "name": "myFS1",
      "path": "C:\\Data\\Image",
      "permissions": "rw",
      "whiteListedOrigins": [],
      "APIKey": "00000000-0000-0000-0000-000000000000"
    }
  ] 
  ```
Questa configurazione indica che la directory indicata in `"path"` e condivisa in lettura e scrittura.  
Il parametro `"whiteListedOrigins"` serve ad indicare una lista di domini verso i quali il Cloud Connector può effettuare richieste http; la lista vuota proibisce le richieste.
 - Nella sezione `plugins` devono essere elencate le classi che sono installate all'interno della directory `public_html\plugins` ed utilizzate come plugin.   
Cloud Connector ha un plug-in già integrato: ActiveDirectory.  
Per usarlo occorre aggiungere alla sezione un oggetto simile al seguente:  
    ```js
    {
      "name": "myAD",
      "class": "ActiveDirectory",
      "APIKey": "00000000-0000-0000-0000-000000000000",
      "config": {
        "url": "ldapServerUrl",
        "baseDN": "dc=example,dc=com",
        "username": "username",
        "password": "password"
      }
    }
    ```

## Note
Attualmente Cloud Connector non supporta il `caching_sha2_password` come metodo di autenticazione su MySQL 8. Si consiglia invece di utilizzare il metodo di autenticazione `legacy`.  

Nel file config.json tutte le `APIKey` sono impostate per default al valore `00000000-0000-0000-0000-000000000000` ed è importante modificarle con un guid effettivo in quanto il Cloud Connector se trova il valore impostato a tutti zero trasmette una stringa vuota e quindi la connessione non funziona nemmeno se nel database su di un porgetto nell'ide di Instant Developer Cloud impostato il valore `00000000-0000-0000-0000-000000000000` nella proprietà APIKey.  
In questo caso nEl log del Cloud Connector viene inserito il messaggio `The APIKey of dataModel '${this.name}' is set to the default value and will be ignored`.

## Installazione come servizio

Per installare il connettore cloud come servizio è possibile utilizzare [pm2](https://github.com/Unitech/pm2).
PM2 è un gestore del processo di produzione per le applicazioni Node.js con un bilanciatore del carico integrato. Consente di mantenere in vita le applicazioni per sempre, di ricaricarle senza tempi di inattività e di facilitare le comuni attività di amministrazione del sistema.

Per eseguire il Cloud Connector con pm2 occorre utilizzare questo comando:

`$ pm2 start cloudServer.js`

Per salvare le informazioni sul processo da eseguire al riavvio, eseguire questo comando:

`$ pm2 save`

Per eseguire pm2 come servizio la procedura è diversa a seconda del tipo di server:
- per Linux [https://gist.github.com/leommoore/5998406](https://gist.github.com/leommoore/5998406).
- per Windows [https://github.com/Unitech/PM2/issues/1079](https://github.com/Unitech/PM2/issues/1079).

## Controllo remoto
 Per consentire la configurazione da remoto (riavvio, modifica di config.js, aggiornamento del software) occorre impostare il parametro `remoteConfigurationKey` nel config.json.  
   
## Guida 
Per maggiori informazioni sul Cloud Connector è possibile leggere questa [guida](https://storage.googleapis.com/inde-downloads/doc/02-Struttura%20del%20database.pdf#page=18).
