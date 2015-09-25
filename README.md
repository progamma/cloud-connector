# cloud-connector

A connector for remote databases.

Cloud Connector is a tool that lets you connect to one or more remote databases from applications developed with Instant Developer.

Normally are the applications that connect to the database and you need to open the doors on the database server.

Installing a Cloud Connector on the database server is the database itself to open a connection to the application not having such open doors on the database server.

## Installation and configuration

- Install [node.js](https://nodejs.org) or [io.js](https://iojs.org) on the database server. If you want connect an Oracle database you must install [io.js](https://iojs.org) v2.3.3.
- Rename the file `config_example.json` as `config.json` and open it.
- Enter information about the application servers to connect to the database and you want to expose.
  - In the section `remoteServers` are listened the urls of application servers to which you want connect (example https://myserver:8080).
  - In the section `remoteUserNames` are listened the username of Instant Developer IDE to which you want connect (example johnsmith).
  - In the section `datamodels` are listened the databases that you want expose. You can list multiple databases. Each type of database (Oracle, Postgres, SQLServer ) has specific connection parameters.
- Run `node cloudServer.js` to start the connector.
