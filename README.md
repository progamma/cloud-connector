# cloud-connector

Il Cloud Connector è uno strumento che permette di connettersi a uno o più database remoti da applicazioni sviluppate con Instant Developer Cloud.

Normalmente sono le applicazioni che si connettono al database ed è necessario aprire almeno una porta verso il mondo esterno sul database server.

Con il Cloud Connector installato sul server dove risiede il database, o in un server della stessa rete locale, è il database stesso ad aprire una connessione verso l'applicazione. Questo fa si che non occorra aprire specifiche porte verso l'esterno aumentando di molto la sicurezza.

## Installazione

Per installare il Cloud Connector occorre eseguire le operazioni di seguito descritte:
- Installare [node.js](https://nodejs.org) v 16.4.0 sul server del database o in un server dal quale è possibile connettersi al database che si desidera esporre.
- Scaricare il pacchetto di installazione del software di Cloud Connector dal link seguente:
[https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip](https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip)
- Decomprimere il contenuto del file zip dove si preferisce.
- Rinominare il file `public_html\config_example.json` in `config.json` e aprirlo con un editor di testo per impostare i parametri di configurazione.
- Spostarsi nella directory `public_html` ed eseguire il seguente comando per installare i node_modules:  
`$ npm update`
- Se si desidera installare il plug-in ActiveDirectory occorre spostarsi nella directory `public_html\plugins\activedirectory` ed eseguire nuovamente l’installazione dei relativi node_modules:  
`$ npm update`
- Eseguire il comando `node cloudServer.js` per far partire il connettore.

## Configurazione

La configurazione del Cloud Connector avviene mediante il file config.json che si trova nella directory `public_html`:
- La sezione principale indica il nome del connettore così come sarà visto dai server di produzione e dai server IDE.
- Nella sezione `remoteServers` vanno indicati i server di Instant Developer Cloud che devono essere contattati dal Cloud Connector, quelli dove risiedono gli applicativi che utilizzeranno il database.  
Per esempio:  
`"remoteServers": [prod1-pro-gamma.instantdevelopercloud.com,prod2-pro-gamma.instantdevelopercloud.com],`
- Nella sezione `remoteUserNames` devono essere indicati indicati gli utenti dell’IDE di Instant Developer Cloud a cui il Cloud Connector può collegarsi.  
Per esempio:  
`"remoteUserNames": ["https://ide1-pro-gamma.instantdevelopercloud.com@paolo-giannelli"],`  
- Nella `datamodels` devono essere impostate le informazioni di connessione ai database che si vuole esporre. È possibile elencare più database. Ogni tipo di database (Oracle, Postgres, SQLServer, MySQL) ha parametri di connessione specifici.  
Un esempio di configurazione SQL server è il seguente:
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
- Nella sezione `fileSystems` devono essere impostate le informazioni delle directory che si desidera condividere.  
Un esempio di condivisione è il seguente:
   ```js
   "fileSystems": [
    {
      "name": "pabloFileSystemTemp",
      "path": "C:\\Data\\Image",
      "permissions": "rw",
      "APIKey": "00000000-0000-0000-0000-000000000000"
    }
  ] 
  ```

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
Per maggiori informazioni sul Cloud Connector è possibile leggere questa [guida](https://storage.googleapis.com/inde-downloads/doc/Instant%20Developer%20Cloud%20Connector.pdf).
