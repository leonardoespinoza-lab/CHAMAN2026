const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'sdc-app-chaman');
const expectedVersion = '1.6.0';
const expectedAppId = 'com.chamanagro.app';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) {
    throw new Error(`${label}: falta ${JSON.stringify(fragment)}`);
  }
}

function rejectText(text, fragment, label) {
  if (text.includes(fragment)) {
    throw new Error(`${label}: todavía contiene ${JSON.stringify(fragment)}`);
  }
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(APP, 'package.json'), 'utf8'),
);

if (packageJson.version !== expectedVersion) {
  throw new Error(
    `package.json: versión ${packageJson.version}; se esperaba ${expectedVersion}`,
  );
}

for (const dependency of [
  '@capacitor/android',
  '@capacitor/core',
  '@capacitor/ios',
]) {
  if (!String(packageJson.dependencies[dependency] || '').startsWith('8.')) {
    throw new Error(`${dependency}: debe permanecer en Capacitor 8`);
  }
}

if (!String(packageJson.devDependencies['@capacitor/cli'] || '').startsWith('8.')) {
  throw new Error('@capacitor/cli: debe permanecer en Capacitor 8');
}

for (const removedDependency of [
  '@awesome-cordova-plugins/document-picker',
  '@capacitor-community/http',
  '@capgo/capacitor-social-login',
]) {
  if (
    packageJson.dependencies[removedDependency] ||
    packageJson.devDependencies[removedDependency]
  ) {
    throw new Error(`${removedDependency}: dependencia obsoleta todavía presente`);
  }
}

const packageLock = read('sdc-app-chaman/package-lock.json');
for (const removedDependency of [
  '@awesome-cordova-plugins/document-picker',
  '@capacitor-community/http',
  '@capgo/capacitor-social-login',
]) {
  rejectText(packageLock, `node_modules/${removedDependency}`, 'package-lock móvil');
}

const capacitorConfig = read('sdc-app-chaman/capacitor.config.ts');
requireText(capacitorConfig, `appId: '${expectedAppId}'`, 'Capacitor config');

const prodEnvironment = read(
  'sdc-app-chaman/src/app/environments/environment.prod.ts',
);
requireText(prodEnvironment, 'Capacitor.isNativePlatform()', 'Entorno móvil');
requireText(
  prodEnvironment,
  'https://chaman-api-production.up.railway.app/sdc-quimica',
  'Entorno móvil',
);
requireText(
  prodEnvironment,
  'wss://chaman-websocket-production.up.railway.app/sdc-websocket',
  'Entorno móvil',
);

const runtimeBootstrap = read(
  'sdc-app-chaman/public/runtime-config.bootstrap',
);
requireText(runtimeBootstrap, '__CHAMAN_CONFIG__', 'Runtime config móvil');

const androidVariables = read('sdc-app-chaman/android/variables.gradle');
requireText(androidVariables, 'minSdkVersion = 24', 'Android variables');
requireText(androidVariables, 'compileSdkVersion = 36', 'Android variables');
requireText(androidVariables, 'targetSdkVersion = 36', 'Android variables');

const androidBuild = read('sdc-app-chaman/android/app/build.gradle');
requireText(androidBuild, `applicationId = "${expectedAppId}"`, 'Android build');
requireText(androidBuild, 'versionCode = 22', 'Android build');
requireText(
  androidBuild,
  `versionName = "${expectedVersion}"`,
  'Android build',
);
for (const secretLiteral of [
  "storePassword '",
  'storePassword "',
  "keyPassword '",
  'keyPassword "',
]) {
  rejectText(androidBuild, secretLiteral, 'Firma Android');
}
requireText(
  androidBuild,
  "System.getenv('CHAMAN_ANDROID_KEYSTORE_FILE')",
  'Firma Android',
);

const androidManifest = read(
  'sdc-app-chaman/android/app/src/main/AndroidManifest.xml',
);
for (const permission of [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
]) {
  requireText(androidManifest, permission, 'Android manifest');
}
requireText(
  androidManifest,
  'android.hardware.location.gps" android:required="false"',
  'Android manifest',
);
requireText(androidManifest, '|density"', 'Android manifest');

const androidCapacitorSettings = read(
  'sdc-app-chaman/android/capacitor.settings.gradle',
);
rejectText(androidCapacitorSettings, 'capacitor-community-http', 'Plugins Android');
rejectText(androidCapacitorSettings, 'capgo-capacitor-social-login', 'Plugins Android');

const iosInfo = read('sdc-app-chaman/ios/App/App/Info.plist');
for (const usageDescription of [
  'NSCameraUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
]) {
  requireText(iosInfo, usageDescription, 'iOS Info.plist');
}
rejectText(iosInfo, 'GIDClientID', 'iOS Info.plist');
rejectText(iosInfo, 'NSLocationAlwaysAndWhenInUseUsageDescription', 'iOS Info.plist');

const iosPodfile = read('sdc-app-chaman/ios/App/Podfile');
rejectText(iosPodfile, 'CapacitorCommunityHttp', 'Podfile iOS');
rejectText(iosPodfile, 'CapgoCapacitorSocialLogin', 'Podfile iOS');

const xcodeProject = read(
  'sdc-app-chaman/ios/App/App.xcodeproj/project.pbxproj',
);
requireText(
  xcodeProject,
  `PRODUCT_BUNDLE_IDENTIFIER = ${expectedAppId};`,
  'Proyecto iOS',
);
requireText(xcodeProject, `MARKETING_VERSION = ${expectedVersion};`, 'Proyecto iOS');
requireText(xcodeProject, 'CURRENT_PROJECT_VERSION = 3;', 'Proyecto iOS');
requireText(xcodeProject, 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'Proyecto iOS');
requireText(xcodeProject, 'IPHONEOS_DEPLOYMENT_TARGET = 15.6;', 'Proyecto iOS');
requireText(xcodeProject, 'PrivacyInfo.xcprivacy in Resources', 'Proyecto iOS');

const privacyManifest = read(
  'sdc-app-chaman/ios/App/App/PrivacyInfo.xcprivacy',
);
requireText(
  privacyManifest,
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'Privacy manifest iOS',
);
requireText(privacyManifest, 'C617.1', 'Privacy manifest iOS');
for (const collectedType of [
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypePreciseLocation',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeAudioData',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeUserID',
]) {
  requireText(privacyManifest, collectedType, 'Privacy manifest iOS');
}
requireText(
  privacyManifest,
  'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  'Privacy manifest iOS',
);
rejectText(privacyManifest, '<key>NSPrivacyTracking</key>\n\t<true/>', 'Privacy manifest iOS');

console.log(
  `Configuración móvil ${expectedVersion} coherente para ${expectedAppId}.`,
);
