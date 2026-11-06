// The entry points named in manifest.yml.
//   handler: index.handler  → the resolvers the page calls (src/resolvers)
//   handler: index.migrate  → the hourly scheduled trigger that creates tables (src/db/migrate.js)
export { handler } from './resolvers/index.js';
export { migrate } from './db/migrate.js';
