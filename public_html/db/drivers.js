/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

// Static registry of supported database drivers. Adding a new connector
// requires updating this map (and dropping the file in ./db/).
const dbDrivers = {
  MySQL: require("./mysql"),
  Postgres: require("./postgres"),
  SQLServer: require("./sqlserver"),
  Oracle: require("./oracle"),
  ODBC: require("./odbc")
};


// Export module for node
module.exports = dbDrivers;
