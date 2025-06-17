/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global module, global, Buffer, Promise */

var Node = Node || {};

/**
 * @class Definition of DataModel object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.DataModel = function (parent, config)
{
  this.parent = parent;
  this.connections = {};
  //
  for (let k in config)
    this[k] = config[k];
  //
  if (this.APIKey === "00000000-0000-0000-0000-000000000000") {
    this.parent.log("WARNING", `The APIKey of dataModel '${this.name}' is set to the default value and will be ignored`);
    this.APIKey = "";
  }
  else if (this.APIKey?.length < 36)
    this.parent.log("WARNING", `The APIKey of dataModel '${this.name}' is shorter than 36 characters. This may weaken security. It is recommended to use a key of at least 36 characters for better robustness.`);
};


Node.DataModel.commandTypes = {
  open: "open",
  close: "close",
  execute: "execute",
  begin: "begin",
  commit: "commit",
  rollback: "rollback",
  listTables: "listTables",
  listTablePrimaryKeys: "listTablePrimaryKeys",
  listTableColumns: "listTableColumns",
  listTableForeignKeys: "listTableForeignKeys",
  ping: "ping"
};


/**
 * Received a message
 * @param {Object} msg
 */
Node.DataModel.prototype.onMessage = async function (msg)
{
  switch (msg.cmd) {
    case Node.DataModel.commandTypes.open:
      await this.openConnection(msg);
      break;
    case Node.DataModel.commandTypes.close:
      await this.closeConnection(msg);
      break;
    case Node.DataModel.commandTypes.execute:
      return await this.execute(msg);
    case Node.DataModel.commandTypes.begin:
      await this.beginTransaction(msg);
      break;
    case Node.DataModel.commandTypes.commit:
      await this.commitTransaction(msg);
      break;
    case Node.DataModel.commandTypes.rollback:
      await this.rollbackTransaction(msg);
      break;
    case Node.DataModel.commandTypes.listTables:
      return await this.listTables(msg);
    case Node.DataModel.commandTypes.listTablePrimaryKeys:
      return await this.listTablePrimaryKeys(msg);
    case Node.DataModel.commandTypes.listTableColumns:
      return await this.listTableColumns(msg);
    case Node.DataModel.commandTypes.listTableForeignKeys:
      return await this.listTableForeignKeys(msg);
    case Node.DataModel.commandTypes.ping:
      this.ping(msg);
      break;
    default:
      throw new Error(`Command '${msg.cmd}' not supported`);
  }
};


/**
 * Load module
 */
Node.DataModel.prototype.loadModule = function ()
{
  try {
    if (!global[this.moduleName])
      global[this.moduleName] = require(this.moduleName);
    return true;
  }
  catch (ex) {
    return false;
  }
};


/**
 * Init the application pool
 */
Node.DataModel.prototype.getPool = async function ()
{
  if (this.pool)
    return;
  //
  this.pool = await this._initPool();
};


/**
 * Bind parameters of a SQL statement
 * @param {String} sql statement to bind
 * @param {Array} params
 */
Node.DataModel.prototype.bindParameters = function (sql, params)
{
  if (!params)
    return sql;
  //
  let inQuote = false;
  let parIndex = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql.charAt(i) === "'") {
      inQuote = !inQuote;
      continue;
    }
    //
    if (inQuote)
      continue;
    //
    let parName = this.getParameterName(parIndex);
    if (sql.slice(i, i + parName.length) === parName) {
      let par = params[parIndex];
      if (par?.dataType)
        par = this.toSql(par.value, par.dataType, par.maxLen, par.scale);
      else if (typeof par === "string")
        par = Node.DataModel.quoteString(par);
      //
      sql = sql.slice(0, i) + par + sql.slice(i + parName.length);
      i += (par + "").length - 1;
      parIndex++;
    }
  }
  return sql;
};


/*
 * Get the name of a parameter
 * @param {Number} index
 */
Node.DataModel.prototype.getParameterName = function (index)
{
  return "?";
};


/**
 * Quote a string
 * @param {String} s string to quote
 */
Node.DataModel.quoteString = function (s)
{
  let ris = s;
  let i = 0;
  while (i < ris.length) {
    if (ris.charAt(i) === "'") {
      let tmp = ris.slice(0, i) + "'";
      tmp = tmp + ris.slice(i);
      ris = tmp;
      i++;
    }
    i++;
  }
  return "'" + ris + "'";
};


/**
 * Open the connection to the database
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.openConnection = async function (msg)
{
  // Load module
  if (!this.loadModule())
    throw new Error(`${this.class} driver not found.\nInstall "${this.moduleName}" module and try again`);
  //
  await this.getPool();
  //
  this.connections[msg.cid] = await this._openConnection();
  this.connections[msg.cid].server = msg.server;
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.closeConnection = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return;
  //
  try {
    await this._closeConnection(conn);
  }
  catch (e) {
    throw e;
  }
  finally {
    delete this.connections[msg.cid];
  }
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.execute = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  // Deserialize some parameters
  msg.pars?.forEach((p, i) => {
    if (p && typeof p === "object" && p.type === "buffer" && p.data)
      msg.pars[i] = Buffer.from(p.data, "base64");
  });
  //
  let startTime = new Date();
  let rs = await this._execute(conn, msg);
  rs.times = {qry: (new Date()).getTime() - startTime.getTime()};
  return rs;
};


/**
 * Convert a value
 * @param {Object} value
 */
Node.DataModel.prototype.convertValue = function (value)
{
  if (value instanceof Buffer)
    return {type: "buffer", data: value.toString("base64")};
  return value;
};


/**
 * Begin a transaction
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.beginTransaction = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  conn.transaction = await this._beginTransaction(conn) || true;
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.commitTransaction = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  try {
    await this._commitTransaction(conn);
  }
  catch (e) {
    throw e;
  }
  finally {
    delete conn.transaction;
  }
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.rollbackTransaction = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  try {
    await this._rollbackTransaction(conn);
  }
  catch (e) {
    throw e;
  }
  finally {
    delete conn.transaction;
  }
};


/**
 * Read list of tables
 * @param {Object} options - options for the query
 */
Node.DataModel.prototype.listTables = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  return await this._listTables(conn, msg.options);
};


/**
 * Read list of primary keys of a table
 * @param {Object} options - options for the query
 */
Node.DataModel.prototype.listTablePrimaryKeys = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  return await this._listTablePrimaryKeys(conn, msg.options);
};


/**
 * Read list of columns of a table
 * @param {Object} options - options for the query
 */
Node.DataModel.prototype.listTableColumns = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  return await this._listTableColumns(conn, msg.options);
};


/**
 * Read list of foreign keys of a table
 * @param {Object} options - options for the query
 */
Node.DataModel.prototype.listTableForeignKeys = async function (msg)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    throw new Error("Connection closed");
  //
  return await this._listTableForeignKeys(conn, msg.options);
};



/**
 * Do nothing
 * @param {Object} msg - message received
 */
Node.DataModel.prototype.ping = function (msg)
{
};


/**
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.DataModel.prototype.onServerDisconnected = async function (server)
{
  // Close all pending connections to that server
  await this.disconnect(server);
};


/**
 * Close all connections
 * @param {Node.Server} server - server disconnected
 */
Node.DataModel.prototype.disconnect = async function (server)
{
  // Close all pending connections
  for (let cid in this.connections) {
    if (server && this.connections[cid].server !== server)
      return;
    //
    try {
      await this.closeConnection({cid});
    }
    catch (e) {
      throw new Error(`Error closing connection of datamodel ${this.name}': ${e}`);
    }
  }
};


// Export module for node
module.exports = Node.DataModel;
