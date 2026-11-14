// Every table the app owns is exported from here. drizzle.config.ts reads this file to
// generate migrations, and the database client uses it for typed queries.
export * from './system'
