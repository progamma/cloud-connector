# Cloud Connector

## Indice

- [Descrizione](#descrizione)
- [Caratteristiche Principali](#caratteristiche-principali)
- [Requisiti di Sistema](#requisiti-di-sistema)
- [Installazione](#installazione)
  - [Download e Setup](#download-e-setup)
  - [Configurazione Variabili d'Ambiente](#configurazione-variabili-dambiente)
  - [Installazione Dipendenze](#installazione-dipendenze)
- [Configurazione](#configurazione)
  - [Struttura config.json](#struttura-configjson)
  - [Sicurezza Password](#sicurezza-password)
  - [Configurazione Server Remoti](#configurazione-server-remoti)
  - [Configurazione Database](#configurazione-database)
  - [Configurazione File System](#configurazione-file-system)
  - [Configurazione Plugin](#configurazione-plugin)
- [Installazione come Servizio](#installazione-come-servizio)
- [Sicurezza](#sicurezza)
  - [Utente Database](#utente-database)
  - [Utente Processi](#utente-processi)
- [Architettura](#architettura)
  - [Struttura del Progetto](#struttura-del-progetto)
  - [Flusso di Comunicazione](#flusso-di-comunicazione)
- [Controllo Remoto](#controllo-remoto)
- [Troubleshooting](#troubleshooting)
- [Performance e Best Practices](#performance-e-best-practices)
- [Esempi di Configurazione](#esempi-di-configurazione)
- [Documentazione Aggiuntiva](#documentazione-aggiuntiva)

## Descrizione

Il Cloud Connector è uno strumento che permette di connettersi a uno o più database remoti da applicazioni sviluppate con Instant Developer Cloud.

Normalmente sono le applicazioni che si connettono al database ed è necessario aprire almeno una porta verso il mondo esterno sul database server. Con il Cloud Connector installato sul server dove risiede il database, o in un server della stessa rete locale, è il database stesso ad aprire una connessione verso l'applicazione. Questo fa sì che non occorra aprire specifiche porte verso l'esterno aumentando di molto la sicurezza.

## Caratteristiche Principali

- **Connessione inversa**: Nessuna porta in ingresso da aprire sul firewall
- **Multi-database**: Supporto per MySQL, PostgreSQL, SQL Server, Oracle, ODBC
- **File System Sharing**: Condivisione sicura di directory locali
- **Plugin System**: Architettura estensibile (es. Active Directory)
- **Crittografia**: Password criptate con chiave personalizzabile
- **Socket.IO**: Comunicazione real-time bidirezionale

## Requisiti di Sistema

- **Node.js**: v22.21.1 o superiore
- **Versione**: 26.0.0
- **Compatibilità**: Instant Developer Cloud, IndeRT
- **Sistemi Operativi**: Windows, Linux, macOS

## Installazione

### Download e Setup

1. **Installare Node.js** v22.21.1 o superiore dal sito [nodejs.org](https://nodejs.org)

2. **Scaricare il Cloud Connector**:
   ```bash
   wget https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip
   # oppure scarica manualmente dal link
   ```

3. **Estrarre l'archivio** nella directory desiderata

4. **Preparare la configurazione**:
   ```bash
   cd cloud-connector/public_html
   cp config_example.json config.json
   ```

### Configurazione Variabili d'Ambiente

Prima di avviare il Cloud Connector, è necessario configurare la variabile d'ambiente per la chiave di crittografia.

**CC_KEY è una variabile d'ambiente** che deve essere configurata nel sistema operativo prima di avviare il Cloud Connector. La sintassi `%CC_KEY%` nel config.json indica al sistema di leggere il valore dalla variabile d'ambiente chiamata `CC_KEY`.

#### Windows (Command Prompt):
```batch
set CC_KEY=la-tua-chiave-segreta-di-almeno-32-caratteri
```

#### Windows (PowerShell):
```powershell
$env:CC_KEY="la-tua-chiave-segreta-di-almeno-32-caratteri"
```

#### Linux/Mac:
```bash
export CC_KEY="la-tua-chiave-segreta-di-almeno-32-caratteri"
```

#### Per rendere la variabile permanente:
- **Windows**: Pannello di controllo → Sistema → Impostazioni avanzate di sistema → Variabili d'ambiente
- **Linux/Mac**: Aggiungere l'export in `~/.bashrc`, `~/.bash_profile` o `/etc/environment`

**IMPORTANTE**:
- La chiave deve essere lunga **almeno 32 caratteri**
- Impostare la variabile **PRIMA** del primo avvio (le password vengono criptate al primo avvio)
- È possibile usare un nome diverso modificando `passwordPrivateKey` nel config.json

### Installazione Dipendenze

1. **Installare le dipendenze principali**:
   ```bash
   cd public_html
   npm install
   ```

2. **Per il plugin Active Directory** (opzionale):
   ```bash
   cd plugins/activedirectory
   npm install
   ```

3. **Avviare il Cloud Connector**:
   ```bash
   node cloudServer.js
   ```

## Configurazione

### Struttura config.json

Il file `config.json` nella directory `public_html` contiene tutte le configurazioni del Cloud Connector:

```json
{
  "name": "my-connector",
  "passwordPrivateKey": "%CC_KEY%",
  "connectionOptions": {
    // Opzionale: per ambienti di sviluppo con certificati SSL non validi
    // "rejectUnauthorized": false  // ATTENZIONE: solo per sviluppo!
  },
  "remoteServers": [],
  "remoteUserNames": [],
  "datamodels": [],
  "fileSystems": [],
  "plugins": []
}
```

### Sicurezza Password

- **passwordPrivateKey**: Recupera la chiave di crittografia dalla variabile d'ambiente
- La chiave deve essere lunga **almeno 32 caratteri** per una sicurezza adeguata
- Se non definita, viene usato un valore di default (sconsigliato)
- Per approfondimenti: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#key-generation)

### Configurazione Server Remoti

#### remoteServers
Server Instant Developer Cloud a cui il connector si collegherà:
```json
"remoteServers": [
  "prod1-pro-gamma.instantdevelopercloud.com",
  "prod2-pro-gamma.instantdevelopercloud.com"
]
```

#### remoteUserNames
Utenti IDE autorizzati alla connessione. Possono essere specificati in diversi formati:
```json
"remoteUserNames": [
  "https://ide1-pro-gamma.instantdevelopercloud.com@paolo-rossi",  // Formato completo: server IDE + username
  "paolo-bianchi",                                                   // Solo username
  "https://ide1-pro-gamma.instantdevelopercloud.com"               // Solo server IDE (tutti gli utenti)
]
```

#### remoteConfigurationKey
Per abilitare il controllo remoto (riavvio, modifica config, aggiornamenti):
```json
"remoteConfigurationKey": "your-secret-key"
```

### Configurazione Database

Il Cloud Connector supporta diversi tipi di database:
- **MySQL** (mysql2 3.15.2)
- **PostgreSQL** (pg 8.16.3)
- **SQL Server** (mssql 12.0.0)
- **Oracle** (oracledb 6.10.0)
- **ODBC** (odbc 2.4.9)

#### MySQL
```json
{
  "name": "mysql-db",
  "class": "MySQL",
  "APIKey": "550e8400-e29b-41d4-a716-446655440001",
  "connectionOptions": {
    "host": "localhost",
    "database": "mydb",
    "user": "dbuser",
    "password": "dbpass",
    "connectionLimit": 100,
    "connectTimeout": 30000,
    "dateStrings": true
  }
}
```

**Nota**: MySQL 8 richiede autenticazione `legacy` invece di `caching_sha2_password`.

#### PostgreSQL
```json
{
  "name": "postgres-db",
  "class": "Postgres",
  "APIKey": "550e8400-e29b-41d4-a716-446655440002",
  "connectionOptions": {
    "host": "localhost",
    "database": "mydb",
    "user": "dbuser",
    "password": "dbpass",
    "ssl": true,  // Abilita connessione crittografata SSL/TLS (consigliato per produzione)
    "connectionTimeoutMillis": 30000,
    "max": 100
  }
}
```

#### SQL Server
```json
{
  "name": "sqlserver-db",
  "class": "SQLServer",
  "APIKey": "550e8400-e29b-41d4-a716-446655440003",
  "connectionOptions": {
    "server": "127.0.0.1\\SQLEXPRESS",
    "database": "mydb",
    "user": "dbuser",
    "password": "dbpass",
    "connectionTimeout": 30000,
    "pool": {
      "max": 100
    },
    "options": {
      "useUTC": false
      // "trustServerCertificate": true  // Solo per sviluppo con certificati non validi
    }
  }
}
```

**Nota**: `trustServerCertificate: true` bypassa la validazione SSL. Usare solo in sviluppo!

#### Oracle
```json
{
  "name": "oracle-db",
  "class": "Oracle",
  "APIKey": "550e8400-e29b-41d4-a716-446655440004",
  "connectionOptions": {
    "user": "dbuser",
    "password": "dbpass",
    "connectString": "localhost:1521/ORCL",
    "poolMax": 100
  }
}
```

##### Supporto server Oracle legacy (< 12.1)

Il driver `oracledb` usa di default la modalità **Thin** (puro JavaScript), che supporta solo Oracle Database 12.1 e successivi. Tentando di connettersi a server più vecchi (10.2, 11.1, 11.2) si ottiene l'errore `NJS-138`.

Per supportare server legacy il Cloud Connector può attivare la modalità **Thick**, che richiede una copia locale di **Oracle Instant Client** sul server dove gira il connector. Per abilitarla impostare la variabile d'ambiente `ORACLE_INSTANT_CLIENT_DIR` con il path della directory dell'Instant Client, **prima** di avviare il connector:

###### Windows (Command Prompt):
```batch
set ORACLE_INSTANT_CLIENT_DIR=C:\oracle\instantclient_23_5
```

###### Windows (PowerShell):
```powershell
$env:ORACLE_INSTANT_CLIENT_DIR="C:\oracle\instantclient_23_5"
```

###### Linux/Mac:
```bash
export ORACLE_INSTANT_CLIENT_DIR="/opt/oracle/instantclient_23_5"
```

**Note**:
- Scaricare Instant Client da [oracle.com/database/technologies/instant-client.html](https://www.oracle.com/database/technologies/instant-client.html). Si raccomanda la versione **19c o superiore**, che supporta server da 11.2 a 23c.
- L'architettura dell'Instant Client deve corrispondere a quella di Node.js (32/64 bit, x64/ARM64).
- **Windows**: richiede Microsoft Visual C++ Redistributable.
- **macOS (ARM64)**: dopo aver scompattato l'archivio, rimuovere la quarantena con `xattr -d com.apple.quarantine instantclient_*/*`.
- L'attivazione è a livello di processo: tutte le connessioni Oracle del connector useranno Thick mode (resta retrocompatibile con i server moderni).

#### ODBC
```json
{
  "name": "odbc-db",
  "class": "ODBC",
  "APIKey": "550e8400-e29b-41d4-a716-446655440005",
  "connectionOptions": {
    "connectionString": "DSN=MyDSN;UID=user;PWD=pass",
    "maxSize": 100,
    "connectionTimeout": 30
  }
}
```

**IMPORTANTE**: Le APIKey devono essere GUID validi, non usare `00000000-0000-0000-0000-000000000000`.

### Configurazione File System

Condivisione sicura di directory locali:

```json
"fileSystems": [
  {
    "name": "documents",
    "path": "C:\\Data\\Documents",
    "permissions": "r",  // "r" per sola lettura, "rw" per lettura/scrittura
    "whiteListedOrigins": ["https://trusted-domain.com"],
    "APIKey": "550e8400-e29b-41d4-a716-446655440006"
  }
]
```

- **permissions**: `"r"` (sola lettura) o `"rw"` (lettura/scrittura)
- **whiteListedOrigins**: Domini autorizzati per richieste HTTP (vuoto = nessuna richiesta HTTP)

### Configurazione Plugin

#### Active Directory
```json
"plugins": [
  {
    "name": "myAD",
    "class": "ActiveDirectory",
    "APIKey": "550e8400-e29b-41d4-a716-446655440007",
    "config": {
      "url": "ldap://dc.example.com",
      "baseDN": "dc=example,dc=com",
      "username": "admin@example.com",
      "password": "adminpass"
    }
  }
]
```

## Installazione come Servizio

Per mantenere il Cloud Connector sempre attivo, si consiglia l'uso di [PM2](https://github.com/Unitech/pm2):

### Installazione PM2
```bash
npm install -g pm2
```

### Avvio con PM2
```bash
pm2 start public_html/cloudServer.js --name cloud-connector
pm2 save
pm2 startup
```

### Comandi PM2 utili
```bash
pm2 list              # Lista processi
pm2 logs              # Visualizza log
pm2 restart cloud-connector
pm2 stop cloud-connector
pm2 delete cloud-connector
```

### Script di Deployment
```bash
#!/bin/bash
# deploy.sh

# Aggiorna codice
git pull origin master

# Aggiorna dipendenze
cd public_html
npm update

# Riavvia con PM2
pm2 restart cloud-connector --update-env

# Salva configurazione
pm2 save
```

## Sicurezza

### Utente Database

Best practices per l'utente di accesso al database:
- Concedere solo i permessi strettamente necessari (SELECT, INSERT, UPDATE, DELETE)
- Evitare privilegi globali, concederli solo su tabelle specifiche se necessario
- Non concedere privilegi amministrativi (GRANT, CREATE USER, ALTER SYSTEM)
- Creare ruoli specifici per il Cloud Connector
- Usare connessioni sicure (SSL/TLS)
- Credenziali diverse per sviluppo, test e produzione

### Utente Processi

Configurazione sicura per l'utente che esegue il servizio:

**Sistema Operativo:**
- Creare un utente dedicato per Node.js/PM2
- Permessi di lettura/esecuzione nella directory del progetto
- Permessi di scrittura solo per log e directory temporanee

**Node.js:**
- Permesso di eseguire Node.js
- Accesso in lettura a node_modules

**PM2:**
- Accesso ai comandi PM2 necessari
- Scrittura nella home directory per configurazioni PM2

## Architettura

### Struttura del Progetto

```
cloud-connector/
├── public_html/              # Directory principale dell'applicazione
│   ├── cloudServer.js        # Entry point principale
│   ├── server.js             # Client Socket.IO
│   ├── utils.js              # Utility e crittografia
│   ├── logger.js             # Sistema di logging
│   ├── config.json           # Configurazione attiva
│   ├── config_example.json   # Template configurazione
│   ├── db/                   # Connettori database
│   │   ├── datamodel.js      # Classe base
│   │   ├── mysql.js
│   │   ├── postgres.js
│   │   ├── oracle.js
│   │   ├── sqlserver.js
│   │   └── odbc.js
│   ├── fs/                   # File system
│   │   ├── nodedriver.js     # Driver principale
│   │   ├── fs.js
│   │   ├── file.js
│   │   ├── directory.js
│   │   └── url.js
│   └── plugins/              # Sistema plugin
│       ├── plugin.js         # Classe base
│       └── activedirectory/  # Plugin AD
├── README.md
├── CLAUDE.md                 # Documentazione sviluppatori
└── .gitignore
```

### Flusso di Comunicazione

1. **Connessione inversa**: Il connector si connette ai server remoti (no porte in ingresso)
2. **Socket.IO**: Comunicazione bidirezionale real-time
3. **Message-based**: Comandi tramite messaggi JSON
4. **API Key**: Autenticazione per ogni risorsa

## Controllo Remoto

Per abilitare la configurazione remota, impostare `remoteConfigurationKey` nel config.json:
- Riavvio remoto
- Modifica configurazione
- Aggiornamento software

## Troubleshooting

### Problemi Comuni

#### Errore connessione database
- Verificare credenziali nel config.json
- Controllare raggiungibilità database
- Per MySQL 8: usare autenticazione `legacy`

#### Oracle: errore `NJS-138` (server < 12.1)
- Il driver `oracledb` in modalità Thin non supporta server Oracle precedenti alla 12.1
- Soluzione: installare Oracle Instant Client e impostare `ORACLE_INSTANT_CLIENT_DIR` (vedi [Supporto server Oracle legacy](#supporto-server-oracle-legacy--121))

#### APIKey non valida
- Messaggio: "The APIKey of dataModel is set to the default value"
- Soluzione: Generare GUID valido, non usare `00000000-0000-0000-0000-000000000000`

#### Certificati SSL non validi
- Solo per sviluppo: `"rejectUnauthorized": false` in connectionOptions
- **MAI in produzione!**

#### Password non criptate
- Impostare variabile `CC_KEY` PRIMA del primo avvio
- Minimo 32 caratteri

#### Plugin ActiveDirectory non funziona
- Eseguire `npm update` in `public_html/plugins/activedirectory`
- Verificare URL LDAP e credenziali

### Log e Debug
- **Log**: Console di sistema
- **Logger**: `logger.js` per logging strutturato
- **Livelli**: ERROR, WARNING, INFO, DEBUG

## Performance e Best Practices

### Connection Pooling
- **MySQL/PostgreSQL**: Default 10 connessioni
- **SQL Server**: Configurabile con `max` in options
- **Oracle**: Gestione automatica

### Sicurezza
1. **Sempre** usare passwordPrivateKey personalizzata
2. **Mai** esporre il connector su internet
3. **Limitare** permessi utente database
4. **Aggiornare** regolarmente dipendenze

### Monitoraggio
- PM2 per restart automatico
- Alert per disconnessioni
- Monitor CPU/memoria

## Esempi di Configurazione

### Configurazione Multi-Database Completa
```json
{
  "name": "production-connector",
  "passwordPrivateKey": "%CC_KEY%",
  "remoteServers": [
    "prod1.instantdevelopercloud.com",
    "prod2.instantdevelopercloud.com"
  ],
  "remoteUserNames": [
    "https://ide.instantdevelopercloud.com@team-member1",
    "https://ide.instantdevelopercloud.com@team-member2"
  ],
  "datamodels": [
    {
      "name": "main-db",
      "class": "MySQL",
      "APIKey": "550e8400-e29b-41d4-a716-446655440001",
      "connectionOptions": {
        "host": "localhost",
        "database": "production",
        "user": "app_user",
        "password": "encrypted_password",
        "connectionLimit": 20
      }
    },
    {
      "name": "analytics-db",
      "class": "Postgres",
      "APIKey": "550e8400-e29b-41d4-a716-446655440002",
      "connectionOptions": {
        "host": "10.0.0.5",
        "database": "analytics",
        "user": "readonly",
        "password": "encrypted_password",
        "ssl": {
          "rejectUnauthorized": true
        }
      }
    }
  ],
  "fileSystems": [
    {
      "name": "uploads",
      "path": "/var/uploads",
      "permissions": "rw",
      "whiteListedOrigins": ["https://app.example.com"],
      "APIKey": "550e8400-e29b-41d4-a716-446655440003"
    }
  ],
  "plugins": [
    {
      "name": "corporate-ad",
      "class": "ActiveDirectory",
      "APIKey": "550e8400-e29b-41d4-a716-446655440004",
      "config": {
        "url": "ldaps://dc.company.com",
        "baseDN": "dc=company,dc=com",
        "username": "service@company.com",
        "password": "encrypted_password"
      }
    }
  ]
}
```

## Documentazione Aggiuntiva

- [Guida ufficiale Instant Developer](https://storage.googleapis.com/inde-downloads/doc/02-Struttura%20del%20database.pdf#page=18)
- [Repository GitHub](https://github.com/progamma/cloud-connector)
- [CLAUDE.md](./CLAUDE.md) - Documentazione per sviluppatori

---

**Versione**: 26.0.0 | **Node.js**: 22.21.1+ | **Licenza**: Copyright Pro Gamma Spa