# cloud-connector

A connector for remote databases.

Cloud Connector is a tool that lets you connect to one or more remote databases from applications developed with Instant Developer.

Normally are the applications that connect to the database and you need to open the doors on the database server.

Installing a Cloud Connector on the database server is the database itself to open a connection to the application not having such open doors on the database server.

## Installation and configuration

- Install [node.js](https://nodejs.org) v 12.17.0 on the machine where you can connect to database that you want expose.
- Unzip the content of zip file where you prefer.
- Rename the file `public_html\config_example.json` as `config.json` and open it.
- Enter information about the application servers to connect to the database and you want to expose.
  - In the section `remoteServers` are listened the urls of application servers to which you want connect (example https://myserver:8080).
  - In the section `remoteUserNames` are listened the username of Instant Developer IDE to which you want connect (example johnsmith).
  - In the section `datamodels` are listened the databases that you want expose. You can list multiple databases. Each type of database (Oracle, Postgres, SQLServer, MySQL) has specific connection parameters.
  - In the section `fileSystems` are listened the directory paths that you want expose.
  - In the section `plugins` are listened the classes that you can create inside the `public_html\plugins` folder and use as plugins. 
  Cloud Connector has a built-in plugin: ActiveDirectory. If you want to use it you have to add an object to this section similar to:
  
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
    
- Move to `public_html` folder and run this command to install node_modules:

  `$ npm update`

- If you want to install ActiveDirectory plugin move to `public_html\plugins\activedirectory` and run again:

  `$ npm update`

- Run `node cloudServer.js` to start the connector.

## Notes
Currently Cloud Connector doesn't support the `caching_sha2_password` authentication method on MySQL 8. It's recommended to use the legacy authentication method instead.

## Installation as a service

For install cloud connector as a service you can use [pm2](https://github.com/Unitech/pm2).
PM2 is a production process manager for Node.js applications with a built-in load balancer. It allows you to keep applications alive forever, to reload them without downtime and to facilitate common system admin tasks.

For run your cloud connector with pm2 you must run this command:

`$ pm2 start cloudServer.js`

For save process infomation to run at restart run this command:

`$ pm2 save`

For run pm2 as service you must follow information of this two article:
- for linux [https://gist.github.com/leommoore/5998406](https://gist.github.com/leommoore/5998406).
- for windows [https://github.com/Unitech/PM2/issues/1079](https://github.com/Unitech/PM2/issues/1079).

## Remote Configuration
To allow remote reconfiguration (restart, change of config.js, update of source codes) the `remoteConfigurationKey` attribute must be set in the config.json.
