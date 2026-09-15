/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const Installer = require("./installer");


new Installer(process.argv.slice(2)).run().then(code => process.exit(code), e => {
  console.error(e.stack);
  process.exit(1);
});
