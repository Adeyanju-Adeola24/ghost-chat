const config = {
  appId: 'com.ghostchat.app',
  appName: 'Ghost Chat',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    Clipboard: { enabled: true }
  }
};

module.exports = config;
