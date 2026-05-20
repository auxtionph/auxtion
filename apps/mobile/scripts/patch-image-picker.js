const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '../../../node_modules/expo-image-picker/ios/MediaHandler.swift',
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-image-picker] File not found, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// Already patched — both broken patterns are gone
if (!content.includes('asset?.contentType') && !content.includes('resource.contentType')) {
  console.log('[patch-image-picker] Already patched, skipping.');
  process.exit(0);
}

// Patch 1: asset?.contentType block
content = content.replace(
  /let utType: UTType\? = if #available\(iOS 26\.0, \*\) \{\s*asset\?\.contentType \?\? UTType\(filenameExtension: fileExtension\)\s*\} else \{\s*UTType\(filenameExtension: fileExtension\)\s*\}/gs,
  'let utType: UTType? = UTType(filenameExtension: fileExtension)',
);

// Patch 2: resource.contentType block
content = content.replace(
  /let utType: UTType\? = if #available\(iOS 26\.0, \*\) \{\s*resource\.contentType\s*\} else \{\s*UTType\(resource\.uniformTypeIdentifier\) \?\? UTType\(filenameExtension: fileExtension\)\s*\}/gs,
  'let utType: UTType? = UTType(resource.uniformTypeIdentifier) ?? UTType(filenameExtension: fileExtension)',
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('[patch-image-picker] Patched successfully.');