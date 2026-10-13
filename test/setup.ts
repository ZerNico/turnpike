// Runs before any test file is loaded (see bunfig.toml), so config.ts and the
// database module pick these up instead of requiring a real .env.
process.env.DISCORD_TOKEN ??= "test-token";
process.env.DATABASE_PATH = ":memory:";
