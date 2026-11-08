// The entry points named in manifest.yml.
//   handler: index.handler  → the resolvers the page calls (src/resolvers)
//   handler: index.migrate  → the hourly scheduled trigger that creates tables (src/db/migrate.js)
//   handler: index.catchUp  → the Porchlight agent's catch-up action in Rovo Chat (src/rovo/catch-up.js)
export { handler } from './resolvers/index.js';
export { migrate } from './db/migrate.js';
export { catchUp } from './rovo/catch-up.js';
