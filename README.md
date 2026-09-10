# Cloud Connector

## Table of Contents

- [Description](#description)
- [Key Features](#key-features)
- [System Requirements](#system-requirements)
- [Installation](#installation)
  - [Download and Setup](#download-and-setup)
  - [Configuring Environment Variables](#configuring-environment-variables)
  - [Installing Dependencies](#installing-dependencies)
- [Configuration](#configuration)
  - [config.json Structure](#configjson-structure)
  - [Password Security](#password-security)
  - [Remote Servers Configuration](#remote-servers-configuration)
  - [Database Configuration](#database-configuration)
  - [File System Configuration](#file-system-configuration)
  - [Plugin Configuration](#plugin-configuration)
- [Installing as a Service](#installing-as-a-service)
- [Security](#security)
  - [Database User](#database-user)
  - [Process User](#process-user)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Communication Flow](#communication-flow)
- [Remote Control](#remote-control)
- [Troubleshooting](#troubleshooting)
- [Performance and Best Practices](#performance-and-best-practices)
- [Configuration Examples](#configuration-examples)
- [Additional Documentation](#additional-documentation)

## Description

The Cloud Connector is a tool that lets applications built with Instant Developer Cloud connect to one or more remote databases.

Normally it is the application that connects to the database, which means the database server has to expose at least one port to the outside world. With the Cloud Connector installed on the server hosting the database, or on a server in the same local network, it is the database that opens a connection to the application. No specific port needs to be opened to the outside, which greatly increases security.

## Key Features

- **Reverse connection**: No inbound port to open on the firewall
- **Multi-database**: Support for MySQL, PostgreSQL, SQL Server, Oracle, ODBC
- **File System Sharing**: Secure sharing of local directories
- **Plugin System**: Extensible architecture (e.g. Active Directory)
- **Encryption**: Passwords encrypted with a customizable key
- **Socket.IO**: Real-time bidirectional communication

## System Requirements

- **Node.js**: v22.21.1 or later
- **Version**: 26.0.0
- **Compatibility**: Instant Developer Cloud, IndeRT
- **Operating systems**: Windows, Linux, macOS

## Installation

### Download and Setup

1. **Install Node.js** v22.21.1 or later from [nodejs.org](https://nodejs.org)

2. **Download the Cloud Connector**:
   ```bash
   wget https://github.com/progamma/cloud-connector/archive/refs/heads/master.zip
   # or download it manually from the link
   ```

3. **Extract the archive** into the directory of your choice

4. **Prepare the configuration**:
   ```bash
   cd cloud-connector/public_html
   cp config_example.json config.json
   ```

### Configuring Environment Variables

Before starting the Cloud Connector you must set the environment variable holding the encryption key.

**CC_KEY is an environment variable** and must be set in the operating system before the Cloud Connector starts. The `%CC_KEY%` syntax in config.json tells the connector to read the value from the environment variable named `CC_KEY`.

The key is not a passphrase: it is the AES-256 key itself, **64 hexadecimal characters**, the 32 bytes the algorithm takes, written as hexadecimal. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then set the variable to what it printed. The key below is an example: use your own.

#### Windows (Command Prompt):
```batch
set CC_KEY=8f14e45fceea167a5a36dedd4bea2543f14e45fceea167a5a36dedd4bea25438
```

#### Windows (PowerShell):
```powershell
$env:CC_KEY="8f14e45fceea167a5a36dedd4bea2543f14e45fceea167a5a36dedd4bea25438"
```

#### Linux/Mac:
```bash
export CC_KEY="8f14e45fceea167a5a36dedd4bea2543f14e45fceea167a5a36dedd4bea25438"
```

#### Making the variable permanent:
- **Windows**: Control Panel → System → Advanced system settings → Environment Variables
- **Linux/Mac**: Add the export to `~/.bashrc`, `~/.bash_profile` or `/etc/environment`

**IMPORTANT**:
- The key must be **exactly 64 hexadecimal characters** (`0-9`, `a-f`). Anything else is refused, and the connector says so at startup
- Set the variable **BEFORE** the first start (passwords are encrypted on first start)
- A different name can be used by changing `passwordPrivateKey` in config.json

### Installing Dependencies

1. **Install the main dependencies**:
   ```bash
   cd public_html
   npm install
   ```

2. **For the Active Directory plugin** (optional):
   ```bash
   cd plugins/activedirectory
   npm install
   ```

3. **Start the Cloud Connector**:
   ```bash
   node cloudServer.js
   ```

## Configuration

### config.json Structure

The `config.json` file in the `public_html` directory holds the entire Cloud Connector configuration:

```json
{
  "name": "my-connector",
  "passwordPrivateKey": "%CC_KEY%",
  "connectionOptions": {
    // Optional: for development environments with invalid SSL certificates
    // "rejectUnauthorized": false  // WARNING: development only!
  },
  "remoteServers": [],
  "remoteUserNames": [],
  "datamodels": [],
  "fileSystems": [],
  "plugins": []
}
```

### Password Security

- **passwordPrivateKey**: Reads the encryption key from the environment variable
- The key must be **exactly 64 hexadecimal characters**, the 32 bytes AES-256 takes. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- A key of any other length, or one with a character that is not hexadecimal, is refused: the connector keeps running, and says at startup that the passwords are staying in clear text
- If it is not defined, a default value is used (not recommended)
- Further reading: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#key-generation)

### Remote Servers Configuration

#### remoteServers
The Instant Developer Cloud servers the connector will connect to:
```json
"remoteServers": [
  "prod1-pro-gamma.instantdevelopercloud.com",
  "prod2-pro-gamma.instantdevelopercloud.com"
]
```

#### remoteUserNames
IDE users allowed to connect. They can be given in different formats:
```json
"remoteUserNames": [
  "https://ide1-pro-gamma.instantdevelopercloud.com@paolo-rossi",  // Full form: IDE server + username
  "paolo-bianchi",                                                   // Username only
  "https://ide1-pro-gamma.instantdevelopercloud.com"               // IDE server only (all its users)
]
```

#### remoteConfigurationKey
Enables remote control (restart, configuration changes, updates):
```json
"remoteConfigurationKey": "your-secret-key"
```

### Database Configuration

The Cloud Connector supports several database types:
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
    "ssl": true,  // Enables an encrypted SSL/TLS connection (recommended in production)
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
      // "trustServerCertificate": true  // Development only, with invalid certificates
    }
  }
}
```

**Note**: `trustServerCertificate: true` bypasses SSL validation. Use it in development only!

##### Legacy SQL Server support (TLS)

`mssql` / `tedious` negotiates the connection using Node's TLS settings, which since v12 require **TLS 1.2 as a minimum**. SQL Server **<= 2014 (12.0.4439.1)** — and some **SQL Server 2016** installations without recent CUs — only speak TLS 1.0/1.1. The handshake fails with cryptic messages such as `Cannot call write after a stream was destroyed`.

The Cloud Connector intercepts the errors typical of this scenario and rethrows them with an actionable hint. To fix the problem at its root, apply the patch recommended by Microsoft on the SQL Server ([KB 3135244](https://support.microsoft.com/en-us/help/3135244)). As a temporary workaround, lower the minimum TLS version on the connector side by adding this to `connectionOptions.options`:

```json
"cryptoCredentialsDetails": { "minVersion": "TLSv1" }
```

**Not recommended in production**: leaving TLS 1.0 open exposes you to known vulnerabilities. Prefer upgrading the SQL Server.

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

##### Legacy Oracle server support (< 12.1)

The `oracledb` driver defaults to **Thin** mode (pure JavaScript), which only supports Oracle Database 12.1 and later. Connecting to older servers (10.2, 11.1, 11.2) fails with error `NJS-138`.

To support legacy servers the Cloud Connector can switch to **Thick** mode, which requires a local copy of **Oracle Instant Client** on the server running the connector. To enable it, set the `ORACLE_INSTANT_CLIENT_DIR` environment variable to the path of the Instant Client directory **before** starting the connector:

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

**Notes**:
- Download Instant Client from [oracle.com/database/technologies/instant-client.html](https://www.oracle.com/database/technologies/instant-client.html). Version **19c or later** is recommended, as it supports servers from 11.2 to 23c.
- The Instant Client architecture must match the one Node.js was built for (32/64 bit, x64/ARM64).
- **Windows**: requires the Microsoft Visual C++ Redistributable.
- **macOS (ARM64)**: after unpacking the archive, remove the quarantine flag with `xattr -d com.apple.quarantine instantclient_*/*`.
- Thick mode is enabled process-wide: all the connector's Oracle connections will use it (it stays backwards compatible with modern servers).

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

**IMPORTANT**: API keys must be valid GUIDs. Do not use `00000000-0000-0000-0000-000000000000`.

### File System Configuration

Secure sharing of local directories:

```json
"fileSystems": [
  {
    "name": "documents",
    "path": "C:\\Data\\Documents",
    "permissions": "r",  // "r" for read-only, "rw" for read/write
    "whiteListedOrigins": ["https://trusted-domain.com"],
    "APIKey": "550e8400-e29b-41d4-a716-446655440006"
  }
]
```

- **permissions**: `"r"` (read-only) or `"rw"` (read/write)
- **whiteListedOrigins**: Domains allowed for HTTP requests (empty = no HTTP requests allowed)

### Plugin Configuration

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

## Installing as a Service

To keep the Cloud Connector always running, [PM2](https://github.com/Unitech/pm2) is recommended:

### Installing PM2
```bash
npm install -g pm2
```

### Starting with PM2
```bash
pm2 start public_html/cloudServer.js --name cloud-connector
pm2 save
pm2 startup
```

### Useful PM2 Commands
```bash
pm2 list              # List processes
pm2 logs              # Show logs
pm2 restart cloud-connector
pm2 stop cloud-connector
pm2 delete cloud-connector
```

### Deployment Script
```bash
#!/bin/bash
# deploy.sh

# Update the code
git pull origin master

# Update the dependencies
cd public_html
npm update

# Restart through PM2
pm2 restart cloud-connector --update-env

# Save the configuration
pm2 save
```

## Security

### Database User

Best practices for the database account:
- Grant only the strictly necessary permissions (SELECT, INSERT, UPDATE, DELETE)
- Avoid global privileges; grant them on specific tables only when needed
- Do not grant administrative privileges (GRANT, CREATE USER, ALTER SYSTEM)
- Create dedicated roles for the Cloud Connector
- Use secure connections (SSL/TLS)
- Use different credentials for development, test and production

### Process User

Secure setup for the account running the service:

**Operating system:**
- Create a dedicated user for Node.js/PM2
- Read/execute permissions on the project directory
- Write permissions only on logs and temporary directories

**Node.js:**
- Permission to run Node.js
- Read access to node_modules

**PM2:**
- Access to the PM2 commands needed
- Write access to the home directory for the PM2 configuration

## Architecture

### Project Structure

```
cloud-connector/
├── public_html/              # Main application directory
│   ├── cloudServer.js        # Main entry point
│   ├── server.js             # Socket.IO client
│   ├── utils.js              # Utilities and encryption
│   ├── logger.js             # Logging subsystem
│   ├── config.json           # Active configuration
│   ├── config_example.json   # Configuration template
│   ├── db/                   # Database connectors
│   │   ├── datamodel.js      # Base class
│   │   ├── mysql.js
│   │   ├── postgres.js
│   │   ├── oracle.js
│   │   ├── sqlserver.js
│   │   └── odbc.js
│   ├── fs/                   # File system
│   │   ├── nodedriver.js     # Main driver
│   │   ├── fs.js
│   │   ├── file.js
│   │   ├── directory.js
│   │   └── url.js
│   └── plugins/              # Plugin subsystem
│       ├── plugin.js         # Base class
│       └── activedirectory/  # AD plugin
├── README.md
├── CLAUDE.md                 # Developer documentation
└── .gitignore
```

### Communication Flow

1. **Reverse connection**: The connector connects to the remote servers (no inbound port)
2. **Socket.IO**: Real-time bidirectional communication
3. **Message-based**: Commands travel as JSON messages
4. **API Key**: Authentication for every resource

## Remote Control

To enable remote configuration, set `remoteConfigurationKey` in config.json:
- Remote restart
- Configuration changes
- Software update

## Troubleshooting

### Common Problems

#### Database connection error
- Check the credentials in config.json
- Check that the database is reachable

#### Oracle: error `NJS-138` (server < 12.1)
- In Thin mode the `oracledb` driver does not support Oracle servers older than 12.1
- Fix: install Oracle Instant Client and set `ORACLE_INSTANT_CLIENT_DIR` (see [Legacy Oracle server support](#legacy-oracle-server-support--121))

#### SQL Server: error `Cannot call write after a stream was destroyed`
- Usually a TLS mismatch with an old SQL Server (<= 2014 12.0.4439.1, some 2016 installations)
- Recommended fix: apply [Microsoft KB 3135244](https://support.microsoft.com/en-us/help/3135244) to enable TLS 1.2 on the SQL Server
- Temporary workaround: see [Legacy SQL Server support](#legacy-sql-server-support-tls)

#### Invalid API key
- Message: "The APIKey of dataModel is set to the default value"
- Fix: generate a valid GUID, do not use `00000000-0000-0000-0000-000000000000`

#### Invalid SSL certificates
- Development only: `"rejectUnauthorized": false` in connectionOptions
- **NEVER in production!**

#### Passwords are not encrypted
- Message: "THE PASSWORDS IN config.json ARE NOT BEING ENCRYPTED"
- The key is not 64 hexadecimal characters: generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set `CC_KEY` to it
- Set the `CC_KEY` variable BEFORE the first start
- Passwords already written in clear text are encrypted at the first start with a valid key

#### The ActiveDirectory plugin does not work
- Run `npm update` in `public_html/plugins/activedirectory`
- Check the LDAP URL and the credentials

### Logs and Debugging
- **Log**: System console
- **Logger**: `logger.js` for structured logging
- **Levels**: ERROR, WARNING, INFO, DEBUG

## Performance and Best Practices

### Connection Pooling
- **MySQL/PostgreSQL**: 10 connections by default
- **SQL Server**: Configurable through `max` in options
- **Oracle**: Handled automatically

### Security
1. **Always** use a custom passwordPrivateKey
2. **Never** expose the connector on the internet
3. **Restrict** the database user permissions
4. **Update** the dependencies regularly

### Monitoring
- PM2 for automatic restart
- Alerts on disconnections
- CPU/memory monitoring

## Configuration Examples

### Full Multi-Database Configuration
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

## Additional Documentation

- [Official Instant Developer guide](https://storage.googleapis.com/inde-downloads/doc/02-Struttura%20del%20database.pdf#page=18)
- [GitHub repository](https://github.com/progamma/cloud-connector)
- [CLAUDE.md](./CLAUDE.md) - Developer documentation

---

**Version**: 26.0.0 | **Node.js**: 22.21.1+ | **License**: Copyright Pro Gamma Spa
