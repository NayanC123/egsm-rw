// plugins/withGradleProjectName.js
// Gradle 9+ forbids rootProject.name from starting or ending with a dot ('.').
// This Expo config plugin ensures Gradle's internal rootProject.name is 'egsm'
// while keeping the public app branding and phone home screen title as 'egsm.'.

const { withSettingsGradle } = require('@expo/config-plugins');

const withGradleProjectName = (config) => {
  return withSettingsGradle(config, (settingsConfig) => {
    settingsConfig.modResults.contents = settingsConfig.modResults.contents.replace(
      /rootProject\.name\s*=\s*['"]([^'"]+)['"]/,
      (match, name) => {
        // Strip leading/trailing dots so Gradle doesn't fail
        const sanitized = name.replace(/^\.+|\.+$/g, '') || 'egsm';
        return `rootProject.name = '${sanitized}'`;
      }
    );
    return settingsConfig;
  });
};

module.exports = withGradleProjectName;
