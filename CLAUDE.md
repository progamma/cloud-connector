# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloud Connector is a Node.js-based middleware application that enables secure connections between Instant Developer Cloud applications and remote databases/file systems. It acts as a reverse proxy, allowing databases to initiate connections to cloud applications rather than exposing database ports to the internet.

## Critical Architecture Lessons

### Directory Structure and Code Placement
**IMPORTANT**: Always verify where code belongs before creating files:
- `public_html/` - Main application code (all server-side logic)
  - `cloudServer.js` - Main entry point and message routing
  - `server.js` - Socket.IO client for remote connections
- `public_html/db/` - Database connectors and data models
- `public_html/fs/` - File system operations and storage management
- `public_html/plugins/` - Extensible plugin system
- Configuration files in `public_html/` root (config.json, config_example.json)

### Execution Flow Verification
Before implementing any feature:
1. **Trace the execution path**: Verify which methods are called and when
2. **Use grep to confirm**: `grep -r "methodName" path/` to find all calls
3. **Check timing**: Ensure code runs at the right moment
4. **Verify dependencies**: Check that required services are initialized

### Pattern Recognition
Before writing new code:
1. **Search for similar functionality**: Look for existing patterns to follow
2. **Study the implementation**: Understand how similar features work
3. **Copy and adapt**: Don't reinvent - adapt existing patterns
4. **Maintain consistency**: Follow established conventions in the codebase

## Common Development Commands

```bash
npm install                  # Install dependencies
node public_html/cloudServer.js  # Start Cloud Connector server
pm2 start cloudServer.js     # Start with PM2 process manager (production)
npm test                     # Run test suite (if configured)
```

## Architecture Overview

### Core Technologies
- **Backend**: Node.js (pure Node.js daemon, no Express)
- **Database Support**: PostgreSQL, MySQL, MS SQL Server, Oracle, ODBC
- **Real-time**: Socket.IO client for WebSocket connections to remote servers
- **File Operations**: fs-extra, archiver, tar, yauzl-promise
- **Authentication**: API key-based security for all resources
- **Plugin System**: Extensible architecture (e.g., Active Directory plugin)

### Key Directories
- `public_html/` - All application code resides here
  - `cloudServer.js` - Main entry point (691 lines)
  - `server.js` - Socket.IO client (115 lines)
  - `utils.js` - Utility functions (223 lines)
  - `logger.js` - Logging functionality (60 lines)
  - `db/` - Database connectors
    - `datamodel.js` - Base class for all DB connections (610 lines)
    - Database-specific implementations (mysql.js, postgres.js, oracle.js, sqlserver.js, odbc.js)
  - `fs/` - File system operations
    - `nodedriver.js` - Main driver (891 lines - largest file)
    - `fs.js`, `file.js`, `directory.js`, `url.js`
  - `plugins/` - Plugin system
    - `plugin.js` - Base plugin class
    - `activedirectory/` - AD authentication plugin
- `test/` - Test directory (currently empty)

### Configuration
Main configuration is in `public_html/config.json` (active configuration, gitignored) with template in `public_html/config_example.json`. Contains remote server connections, database configurations, file system shares, and plugin settings.

## Coding Style Guidelines

### File Structure for Classes
Follow the pattern in existing classes. Key points:
- `var Node = Node || {};` namespace declaration (Note: uses `Node` namespace, not `App`)
- Constructor pattern: `Node.ClassName = function(parent, config) { ... }`
- Parent-child relationships for logging and communication
- Export: `if (module) module.exports = Node.ClassName;`

### Variable Declarations
- Use `let` for all new variable declarations (no `var` or `const`)
- Namespace `Node` at file top must use `var`
- This project uses only `Node` namespace (no `App` or `Client` - it's a pure backend service)

### Functions and Methods
- Use prototype-based inheritance instead of ES6 classes
- Use arrow functions instead of function declarations (eliminates need for `pthis`)
- In arrow functions, omit parentheses for single parameters: `item => { ... }`
- Use async/await syntax for asynchronous programming
- Opening brace: new line for prototype methods, same line for local functions

### Code Formatting
- No empty lines in method bodies - use empty comment lines (`//`) to separate blocks
- Omit braces for single-line blocks
- Use optional chaining (`?.`) where applicable
- Use object property shorthand (`{ok}` instead of `{ok: ok}`)
- Use template literals for string concatenation
- Use double quotes (`"`) for simple strings, never single quotes
- Insert `//` before a non-empty comment if preceded by code (unless after block start)
- Use ternary operator for concise conditional assignments
- Never put `//` after break; always put empty line between break and next case

### Module System
- Use CommonJS `module.exports` instead of ES6 imports/exports
- Include copyright header in all files
- Maintain proper dependency injection patterns

### Style Example
```javascript
Node.MyClass.prototype.myMethod = function ()
{
  let result = this.someValue?.property;
  //
  if (result)
    return result;
  //
  let processData = () => {
    let data = this.getData();
    //
    // Map items to their names (ternary for default)
    return data ? data.map(item => item.name) : [];
  };
  //
  // Set status based on condition
  this.status = this.isActive ? "active" : "inactive";
  //
  return processData();
};
```


## Development Guidelines

### Code Implementation
- Always create a plan before writing code
- Always review the plan with the user before writing code
- Always use IDE diagnostics to validate code after implementation
- Test integration points thoroughly

### Code Maintenance Best Practices
- When fixing a method name or API usage error, always search for all occurrences across the entire module/package
- Use grep to systematically check all related files before considering the fix complete
- This prevents partial fixes that leave some files with the old incorrect usage
- Document breaking changes clearly

### Message-Based Communication
This project uses Socket.IO messages instead of REST APIs:
- Message handling in `cloudServer.js` - `onServerMessage()` method
- Command routing based on message `type` and `name` fields
- Response format: JSON messages sent back through WebSocket
- All resources require API keys for access

### Security Considerations
- Sanitize all user inputs
- Use parameterized queries for database operations
- Implement rate limiting on API endpoints
- Follow OAuth 2.0 best practices
- Keep sensitive data encrypted at rest

### Testing Strategy
- Write unit tests for new functionality
- Include integration tests for API endpoints
- Mock external services in tests
- Maintain test coverage above 80%

## Working with Cloud Connector Components

### Database Connectors
Each database type extends the base `DataModel` class:
- Commands: `open`, `close`, `execute`, `begin`, `commit`, `rollback`
- Metadata: `listTables`, `listTableColumns`, `listTablePrimaryKeys`, `listTableForeignKeys`
- Connection pooling with configurable limits
- API key validation for all operations

### File System Operations
File system sharing through `fs/` module:
- Shared directory management with permissions (read/read-write)
- File operations: read, write, copy, move, delete
- Directory operations: create, list, remove
- Archive operations: zip, tar
- HTTP URL fetching capabilities

### Plugin System
Extensible architecture:
- Base plugin class in `plugins/plugin.js`
- Instance management and serialization
- Method invocation system
- Example: Active Directory authentication plugin

## Performance Optimization

### Database Operations
- Use connection pooling
- Implement query caching where appropriate
- Index frequently queried columns
- Monitor slow queries and optimize

### Caching Strategy
- Use Redis for session and temporary data
- Implement cache invalidation strategies
- Set appropriate TTL values
- Monitor cache hit rates

### Async Processing
- Use message queues for long-running tasks
- Implement worker processes for background jobs
- Monitor queue depths and processing times
- Handle failed jobs with retry logic

## Monitoring and Logging

### Logging Standards
- Use structured logging (JSON format)
- Include correlation IDs for request tracking
- Log at appropriate levels (ERROR, WARN, INFO, DEBUG)
- Avoid logging sensitive information

### Metrics Collection
- Track API response times
- Monitor error rates by endpoint
- Collect business metrics
- Set up alerting for critical issues

## Development Notes

### Architecture Patterns
- **No REST API**: Uses WebSocket message passing via Socket.IO
- **No client-side code**: Pure backend Node.js daemon
- **Reverse proxy model**: Prevents exposing database ports to internet
- **Multi-tenant**: Supports multiple databases, file systems, and plugins simultaneously
- **Configuration-driven**: All resources defined in `config.json`

### Command Pattern
Components define command types as constants:
```javascript
Node.DataModel.commandTypes = {
  open: "open",
  execute: "execute",
  listTables: "listTables"
  // ...
}
```

### Parent-Child Communication
All components receive a `parent` reference for logging:
- CloudServer → Server, DataModel, FS, Plugin
- DataModel/FS/Plugin → Individual connections/operations

### Environment Variables
- `%CC_KEY%` - Password encryption key for configuration