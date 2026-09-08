const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveNativeIdentity } = require('../../sdc-app-chaman/scripts/native-identity.cjs');
const root = path.resolve(__dirname, '../..');

test('Android commands use the new identity; iOS commands keep the existing identity', () => {
  for (const command of ['add', 'copy', 'sync', 'update', 'build', 'run', 'open']) {
    assert.equal(resolveNativeIdentity([command, 'android']).appId, 'ar.chamanagro.app');
    assert.deepEqual(resolveNativeIdentity([command, 'ios']), {appId: 'com.chamanagro.app', appName: 'Chamán'});
  }
});
test('default/read-only commands retain the Apple identity', () => {
  assert.equal(resolveNativeIdentity([]).appId, 'com.chamanagro.app');
  assert.equal(resolveNativeIdentity(['doctor']).appId, 'com.chamanagro.app');
});
test('ambiguous mutating commands fail instead of copying the wrong app ID', () => {
  for (const command of ['add', 'copy', 'sync', 'update', 'build', 'run']) {
    assert.throws(() => resolveNativeIdentity([command]), /Indicar la plataforma/);
  }
  assert.throws(() => resolveNativeIdentity(['sync', 'ios', 'android']), /separado/);
});
test('Android resources, application ID and provider authorities remain consistent', () => {
  const gradle = fs.readFileSync(path.join(root, 'sdc-app-chaman/android/app/build.gradle'), 'utf8');
  const strings = fs.readFileSync(path.join(root, 'sdc-app-chaman/android/app/src/main/res/values/strings.xml'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'sdc-app-chaman/android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(gradle, /applicationId = "ar\.chamanagro\.app"/);
  assert.match(strings, /name="package_name">ar\.chamanagro\.app</);
  assert.match(strings, /name="custom_url_scheme">ar\.chamanagro\.app</);
  assert.match(manifest, /android:authorities="\$\{applicationId\}\.fileprovider"/);
  // The Java namespace is independent from the distributable application ID.
  assert.match(gradle, /namespace = "com\.chamanagro\.app"/);
});
test('Apple project still has the approved bundle ID and build 6', () => {
  const project = fs.readFileSync(path.join(root, 'sdc-app-chaman/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  assert.equal((project.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.chamanagro\.app;/g) || []).length, 2);
  assert.equal((project.match(/CURRENT_PROJECT_VERSION = 6;/g) || []).length, 2);
  assert.doesNotMatch(project, /ar\.chamanagro\.app/);
});
