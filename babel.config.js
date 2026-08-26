module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inlines Drizzle Kit's generated .sql migration files as string literals at build time
    // (see https://orm.drizzle.team/docs/get-started/expo-new) — Metro's own parser can't handle
    // raw SQL, so this rewrite has to happen before Metro tries to parse the file as JS.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
