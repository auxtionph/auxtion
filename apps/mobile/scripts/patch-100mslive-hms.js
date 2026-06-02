const fs = require('fs');
const path = require('path');

const hmsDir = path.join(
  __dirname,
  '../../../node_modules/@100mslive/react-native-hms/android/src/main/java/com/reactnativehmssdk',
);

const files = {
  manager: path.join(hmsDir, 'HMSManager.kt'),
  viewManager: path.join(hmsDir, 'HMSSDKViewManager.kt'),
  hlsPlayerManager: path.join(hmsDir, 'HMSHLSPlayerManager.kt'),
};

for (const filePath of Object.values(files)) {
  if (!fs.existsSync(filePath)) {
    console.log('[patch-100mslive-hms] File not found, skipping.');
    process.exit(0);
  }
}

let manager = fs.readFileSync(files.manager, 'utf8');
manager = manager
  .replace(/reactAppContext\?\.currentActivity/g, 'reactAppContext?.getCurrentActivity()')
  .replace(/reactApplicationContext\?\.currentActivity/g, 'reactApplicationContext?.getCurrentActivity()')
  .replace(/(?<![A-Za-z0-9_.])currentActivity\?/g, 'getCurrentActivity()?')
  .replace(/val activity = currentActivity/g, 'val activity = getCurrentActivity()')
  .replace(
    /activity\.setPictureInPictureParams\(([^)\r\n]+)\)/g,
    'activity.javaClass.getMethod("setPictureInPictureParams", android.app.PictureInPictureParams::class.java).invoke(activity, $1)',
  )
  .replace(
    /activity\.pictureInPictureParams = ([^\r\n]+)/g,
    'activity.javaClass.getMethod("setPictureInPictureParams", android.app.PictureInPictureParams::class.java).invoke(activity, $1)',
  );
fs.writeFileSync(files.manager, manager, 'utf8');

let viewManager = fs.readFileSync(files.viewManager, 'utf8');
viewManager = viewManager
  .replace(/(\.build\(\))(?!\.toMutableMap\(\))/g, '$1.toMutableMap()')
  .replace(/(MapBuilder\s*\.\s*of\(\s*"captureFrame"[\s\S]*?\))(?!\.toMutableMap\(\))/m, '$1.toMutableMap()');
fs.writeFileSync(files.viewManager, viewManager, 'utf8');

let hlsPlayerManager = fs.readFileSync(files.hlsPlayerManager, 'utf8');
hlsPlayerManager = hlsPlayerManager.replace(/(\.build\(\))(?!\.toMutableMap\(\))/g, '$1.toMutableMap()');
fs.writeFileSync(files.hlsPlayerManager, hlsPlayerManager, 'utf8');

console.log('[patch-100mslive-hms] Patched successfully.');
