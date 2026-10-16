name: Build Android APK

on:
  workflow_dispatch: # Lets you click "Run workflow" manually on GitHub
  push:
    branches: [ main ]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install

      - name: Generate native Android folder
        run: npx expo prebuild --platform android --clean

      - name: Build Release APK with Gradle
        working-directory: ./android
        run: ./gradlew assembleRelease

      - name: Upload Compiled APK
        uses: actions/upload-artifact@v4
        with:
          name: egsm-release-apk
          path: android/app/build/outputs/apk/release/app-release.apk
