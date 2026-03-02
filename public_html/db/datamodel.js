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
 * Binds parameters to a SQL statement by replacing parameter placeholders with actual values.
 * Handles proper escaping and type conversion based on parameter data types.
 * @param {String} sql - SQL statement with parameter placeholders
 * @param {Array} params - Array of parameter values or parameter objects with dataType
 * @returns {String} SQL statement with parameters bound
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
      //
      // Handle different parameter types
      if (par?.dataType) {
      // Use existing toSql method for typed parameters
        par = this.toSql(par.value, par.dataType, par.maxLen, par.scale);
      }
      else if (par === null || par === undefined) {
        // Handle null/undefined values
        par = "NULL";
      }
      else if (typeof par === "string") {
        // Use improved quoteString for string values
        par = Node.DataModel.quoteString(par);
      }
      else if (typeof par === "number") {
        // Validate numeric values to prevent injection
        if (!isFinite(par))
          throw new Error(`Invalid numeric parameter at index ${parIndex}: ${par}`);
        par = String(par);
      }
      else if (typeof par === "boolean") {
        // Convert boolean to SQL boolean representation
        par = par ? "1" : "0";
      }
      else if (par instanceof Date) {
        // Convert Date to ISO string format
        par = Node.DataModel.quoteString(par.toISOString());
      }
      else {
        // For other types, convert to string and escape
        par = Node.DataModel.quoteString(String(par));
      }
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
 * Escapes and quotes a string value for safe use in SQL statements.
 * Doubles single quotes and wraps the string in single quotes.
 * Also handles null bytes and other potentially dangerous characters.
 * @param {String} s - String value to escape and quote
 * @returns {String} SQL-safe quoted string literal
 */
Node.DataModel.quoteString = function (s)
{
  // Handle null/undefined
  if (s === null || s === undefined)
    return "NULL";
  //
  // Ensure it's a string
  s = String(s);
  //
  // Remove null bytes which can truncate SQL strings
  s = s.replace(/[\0]/g, "");
  //
  // Replace all single quotes with doubled single quotes (standard SQL escaping)
  s = s.replace(/'/g, "''");
  //
  return `'${s}'`;
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
