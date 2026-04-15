/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

/**
 * @class Node.DataModel
 * @classdesc
 * Base class for all database connectors in the Cloud Connector.
 * Provides a unified interface for database operations across different database systems
 * (PostgreSQL, MySQL, MS SQL Server, Oracle, ODBC).
 * Manages connection pooling, transactions, and metadata operations.
 *
 * Key features:
 * - **Connection pooling**: Efficient connection management with configurable pool limits
 * - **Transaction support**: Full ACID transaction support with begin/commit/rollback
 * - **Metadata operations**: Schema introspection for tables, columns, keys, and relationships
 * - **Parameter binding**: Safe parameter binding with SQL injection prevention
 * - **Multi-database support**: Unified API across different database systems
 * - **API key security**: All operations require valid API key authentication
 *
 * @property {Node.CloudServer} parent - Parent CloudServer instance
 * @property {Object} connections - Active connections mapped by connection ID
 * @property {Object} pool - Database connection pool
 * @property {String} name - Name of this datamodel instance
 * @property {String} class - Database driver class name
 * @property {String} APIKey - API key for authentication
 * @property {Object} connectionOptions - Database connection parameters
 * @property {String} moduleName - Node module name for the database driver
 *
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - Datamodel configuration
 * @param {String} config.name - Name of the datamodel
 * @param {String} config.class - Database driver class
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - Connection parameters
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


/**
 * Command types supported by the DataModel for database operations
 * @enum {String}
 */
Node.DataModel.commandTypes = {
  /** Open a new database connection */
  open: "open",
  /** Close an existing database connection */
  close: "close",
  /** Execute a SQL query or statement */
  execute: "execute",
  /** Begin a new transaction */
  begin: "begin",
  /** Commit the current transaction */
  commit: "commit",
  /** Rollback the current transaction */
  rollback: "rollback",
  /** List all tables in the database */
  listTables: "listTables",
  /** List primary keys for a table */
  listTablePrimaryKeys: "listTablePrimaryKeys",
  /** List columns for a table */
  listTableColumns: "listTableColumns",
  /** List foreign keys for a table */
  listTableForeignKeys: "listTableForeignKeys",
  /** Keep-alive ping command */
  ping: "ping"
};


/**
 * Routes incoming messages to appropriate command handlers.
 * Central message dispatcher for all database operations.
 * @param {Object} msg - Message object containing command and parameters
 * @param {String} msg.cmd - Command type from Node.DataModel.commandTypes
 * @param {Object} msg.args - Command arguments
 * @returns {Promise<Object>} Command execution result
 * @throws {Error} If command is not supported
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
 * Loads the database driver module if not already loaded.
 * Uses global cache to avoid reloading modules.
 * @returns {Boolean} True if module loaded successfully, false otherwise
 */
Node.DataModel.prototype.loadModule = function ()
{
  try {
    if (!global[this.moduleName])
      global[this.moduleName] = require(this.moduleName);
    return true;
  }
  catch {
    return false;
  }
};


/**
 * Initializes the database connection pool if not already created.
 * Delegates to driver-specific _initPool implementation.
 */
Node.DataModel.prototype.getPool = async function ()
{
  if (this.pool)
    return;
  //
  this.pool = await this._initPool();
};


/**
 * Closes the connection pool and releases all resources.
 * Delegates to driver-specific _closePool implementation.
 */
Node.DataModel.prototype.closePool = async function ()
{
  if (!this.pool)
    return;
  //
  try {
    // Call driver-specific pool closure
    await this._closePool();
  }
  finally {
    delete this.pool;
  }
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
  let parIndex = 0;
  let i = 0;
  let result = "";
  while (i < sql.length) {
    // Check for single-line comment
    if (sql.slice(i, i + 2) === "--") {
      // Find end of line considering different line endings
      let endComment = sql.length;
      for (let j = i; j < sql.length; j++) {
        if (sql.charAt(j) === "\n" || sql.charAt(j) === "\r") {
          endComment = j;
          break;
        }
      }
      result += sql.slice(i, endComment);
      i = endComment;
      continue;
    }
    //
    // Check for multi-line comment
    if (sql.slice(i, i + 2) === "/*") {
      let endComment = sql.indexOf("*/", i + 2);
      if (endComment === -1) endComment = sql.length;
      else endComment += 2;
      result += sql.slice(i, endComment);
      i = endComment;
      continue;
    }
    //
    // Check for dollar-quoted string (PostgreSQL)
    if (sql.charAt(i) === "$") {
      let match = sql.slice(i).match(/^\$([^$]*)\$/);
      if (match) {
        let tag = match[0];
        let endTag = sql.indexOf(tag, i + tag.length);
        if (endTag !== -1) {
          endTag += tag.length;
          result += sql.slice(i, endTag);
          i = endTag;
          continue;
        }
      }
    }
    //
    // Check for standard quoted string
    if (sql.charAt(i) === "'") {
      result += "'";
      i++;
      // Process string content with proper escape handling
      while (i < sql.length) {
        if (sql.charAt(i) === "'") {
          // Check for escaped quote (two consecutive quotes)
          if (i + 1 < sql.length && sql.charAt(i + 1) === "'") {
            result += "''";
            i += 2;
          }
          else {
            // End of string
            result += "'";
            i++;
            break;
          }
        }
        else {
          result += sql.charAt(i);
          i++;
        }
      }
      continue;
    }
    //
    // Check for parameter placeholder
    let parName = this.getParameterName(parIndex);
    if (sql.slice(i, i + parName.length) === parName) {
      // Check if this is actually a parameter (not part of a word)
      let beforeOk = i === 0 || /[^a-zA-Z0-9_]/.test(sql.charAt(i - 1));
      let afterOk = i + parName.length >= sql.length || /[^a-zA-Z0-9_]/.test(sql.charAt(i + parName.length));
      if (beforeOk && afterOk) {
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
        result += par;
        i += parName.length;
        parIndex++;
        continue;
      }
    }
    //
    // Regular character
    result += sql.charAt(i);
    i++;
  }
  //
  return result;
};


/**
 * Returns the placeholder name for a query parameter at given index.
 * Default implementation returns "?" for positional parameters.
 * Override in subclasses for different parameter styles.
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., "?", "$1", ":p1")
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
 * Opens a new connection to the database and registers it with the connection pool.
 * @param {Object} msg - Message object containing connection parameters
 * @param {String} msg.cid - Connection ID for tracking this connection
 * @param {Node.Server} msg.server - Server instance associated with this connection
 * @throws {Error} Throws error if driver module not found or connection fails
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
 * Closes an active database connection and removes it from the connection pool.
 * @param {Object} msg - Message object containing disconnection parameters
 * @param {String} msg.cid - Connection ID identifying the connection to close
 * @throws {Error} Throws error if connection closing fails
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
  finally {
    delete this.connections[msg.cid];
  }
};


/**
 * Execute a SQL command on the database with optional parameters
 * @param {Object} msg - Message object containing execution parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Array of parameters for parameterized queries (optional)
 * @param {Object} [msg.options] - Additional execution options (optional)
 * @throws {Error} Throws error if connection is closed or execution fails
 * @returns {Promise<Object>} Promise resolving to result set with rows, affected count, and timing info
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
 * Converts database native values to JavaScript values.
 * Handles datetime conversions with timezone support via moment.js.
 * @param {*} v - Native database value to convert
 * @param {Object} options - Conversion options with srcDT, dstDT, moment, withoutTimeZone
 * @returns {*} JavaScript value converted according to target data type
 */
Node.DataModel.prototype.convertValue = function (value)
{
  if (value instanceof Buffer)
    return {type: "buffer", data: value.toString("base64")};
  return value;
};


/**
 * Begins a database transaction on the specified connection.
 * @param {Object} msg - Message object containing transaction parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @throws {Error} Throws error if connection is closed or transaction fails
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
 * Commits the current database transaction on the specified connection.
 * @param {Object} msg - Message object containing transaction parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @throws {Error} Throws error if connection is closed or commit fails
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
  finally {
    delete conn.transaction;
  }
};


/**
 * Rolls back the current database transaction on the specified connection.
 * @param {Object} msg - Message object containing transaction parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @throws {Error} Throws error if connection is closed or rollback fails
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
  finally {
    delete conn.transaction;
  }
};


/**
 * Retrieve list of all tables in the database
 * @param {Object} msg - Message object containing request parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @param {Object} msg.options - Query options for filtering tables
 * @param {String} [msg.options.schema] - Schema name to filter tables (optional)
 * @param {String} [msg.options.pattern] - Pattern for table name matching (optional)
 * @throws {Error} Throws error if connection is closed or query fails
 * @returns {Promise<Array>} Promise resolving to array of table objects with metadata
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
 * Retrieve list of primary key columns for a specific table
 * @param {Object} msg - Message object containing request parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @param {Object} msg.options - Query options containing table information
 * @param {String} msg.options.table - Table name to get primary keys for
 * @param {String} [msg.options.schema] - Schema name containing the table (optional)
 * @throws {Error} Throws error if connection is closed or query fails
 * @returns {Promise<Array>} Promise resolving to array of primary key column definitions
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
 * Retrieve detailed column information for a specific table
 * @param {Object} msg - Message object containing request parameters
 * @param {string} msg.cid - Connection ID identifying the database connection
 * @param {Object} msg.options - Query options containing table information
 * @param {string} msg.options.table - Table name to get column information for
 * @param {string} [msg.options.schema] - Schema name containing the table (optional)
 * @throws {Error} Throws error if connection is closed or query fails
 * @returns {Promise<Array>} Promise resolving to array of column objects with name, type, nullable, default, etc.
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
 * Retrieve list of foreign key constraints for a specific table
 * @param {Object} msg - Message object containing request parameters
 * @param {String} msg.cid - Connection ID identifying the database connection
 * @param {Object} msg.options - Query options containing table information
 * @param {String} msg.options.table - Table name to get foreign key constraints for
 * @param {String} [msg.options.schema] - Schema name containing the table (optional)
 * @throws {Error} Throws error if connection is closed or query fails
 * @returns {Promise<Array>} Promise resolving to array of foreign key constraint definitions with source/target info
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
 * Health check endpoint for verifying connection status
 * @param {Object} msg - Message object for ping request
 * @param {String} msg.cid - Connection ID to verify (optional)
 */
Node.DataModel.prototype.ping = function (msg)
{
};


/**
 * Event handler called when a server connection is lost.
 * Automatically closes all database connections associated with the disconnected server.
 * @param {Node.Server} server - Server instance that has disconnected
 */
Node.DataModel.prototype.onServerDisconnected = async function (server)
{
  // Close all pending connections to that server
  await this.disconnect(server);
};


/**
 * Closes all database connections, optionally filtering by server.
 * @param {Node.Server} [server] - Optional server instance to filter connections (if provided, only closes connections to this server)
 * @throws {Error} Throws error with connection details if closing fails
 */
Node.DataModel.prototype.disconnect = async function (server)
{
  // Close all pending connections
  for (let cid in this.connections) {
    if (server && this.connections[cid].server !== server)
      continue;
    //
    try {
      await this.closeConnection({cid});
    }
    catch (e) {
      throw new Error(`Error closing connection of datamodel ${this.name}': ${e}`);
    }
  }
  //
  // If no server specified (closing all connections), also close the pool
  if (!server) {
    try {
      await this.closePool();
    }
    catch (e) {
      // Log error but don't throw to ensure cleanup continues
      this.parent?.log("ERROR", `Error closing pool for datamodel '${this.name}': ${e}`);
    }
  }
};


// Export module for node
module.exports = Node.DataModel;
