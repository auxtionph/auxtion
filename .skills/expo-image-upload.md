---
name: expo-image-upload
description: "Use this skill whenever implementing photo/image upload in Auxtion. Covers expo-image-picker → Cloudinary upload → storing URL in DB. Read before building any image upload feature."
---

# Image Upload — Auxtion (Expo + Cloudinary)

## Stack

- **Picker:** `expo-image-picker`
- **Storage:** Cloudinary (unsigned upload preset)
- **DB:** Store returned URL string in `photos String[]` on ShopItem

---

## Setup

### 1. Install

```bash
cd apps/mobile
npx expo install expo-image-picker
```

### 2. Cloudinary config (add to Railway env + local)

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_UPLOAD_PRESET=auxtion_unsigned   # create unsigned preset in Cloudinary dashboard
```

Expose to mobile via API endpoint — never put Cloudinary credentials directly in the app bundle.

### 3. Permissions in `app.json`

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow Auxtion to access your photos to add item photos.",
          "cameraPermission": "Allow Auxtion to use your camera to take item photos."
        }
      ]
    ]
  }
}
```

---

## Upload Flow

```
User picks image (expo-image-picker)
  → Get base64 or URI
  → POST to Cloudinary upload endpoint (unsigned)
  → Cloudinary returns { secure_url }
  → Store secure_url in photos[] array
  → PATCH /shop-items/:id with { photos: [...existingPhotos, newUrl] }
```

---

## Implementation

### Image picker hook

```typescript
// apps/mobile/src/hooks/useImagePicker.ts
import * as ImagePicker from 'expo-image-picker';

export const useImagePicker = () => {
  const pickImage = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add item photos.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],      // square crop for item photos
      quality: 0.8,
      base64: false,        // use URI for FormData upload
    });

    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  const takePhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take photos.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  return { pickImage, takePhoto };
};
```

### Cloudinary upload utility

```typescript
// apps/mobile/src/services/upload/cloudinary.ts
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const uploadToCloudinary = async (uri: string): Promise<string> => {
  const formData = new FormData();

  // React Native FormData file append
  formData.append('file', {
    uri,
    type: 'image/jpeg',
    name: `item-${Date.now()}.jpg`,
  } as any);

  formData.append('upload_preset', UPLOAD_PRESET!);
  formData.append('folder', 'auxtion/items');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  const data = await response.json();
  return data.secure_url as string;
};
```

### Usage in Add Item modal

```typescript
const [uploadingPhoto, setUploadingPhoto] = useState(false);
const [photos, setPhotos] = useState<string[]>([]);
const { pickImage, takePhoto } = useImagePicker();

const handleAddPhoto = async (source: 'library' | 'camera') => {
  const uri = source === 'library' ? await pickImage() : await takePhoto();
  if (!uri) return;

  setUploadingPhoto(true);
  try {
    const url = await uploadToCloudinary(uri);
    setPhotos(prev => [...prev, url]);
  } catch {
    Alert.alert('Upload failed', 'Could not upload photo. Try again.');
  } finally {
    setUploadingPhoto(false);
  }
};

// Photo source picker
const showPhotoOptions = () => {
  Alert.alert('Add Photo', 'Choose source', [
    { text: 'Camera', onPress: () => handleAddPhoto('camera') },
    { text: 'Photo Library', onPress: () => handleAddPhoto('library') },
    { text: 'Cancel', style: 'cancel' },
  ]);
};
```

### Photo grid UI component

```typescript
// Inline in modal
<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
  {photos.map((url, i) => (
    <View key={i} style={{ position: 'relative' }}>
      <Image
        source={{ uri: url }}
        style={{ width: 80, height: 80, borderRadius: 10 }}
        resizeMode="cover"
      />
      <TouchableOpacity
        style={{
          position: 'absolute', top: -6, right: -6,
          backgroundColor: '#DC2626', borderRadius: 999,
          width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
        }}
        onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
      >
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✕</Text>
      </TouchableOpacity>
    </View>
  ))}

  {photos.length < 5 && (
    <TouchableOpacity
      style={{
        width: 80, height: 80, borderRadius: 10,
        backgroundColor: '#1F2937', borderWidth: 1,
        borderColor: '#374151', borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center',
      }}
      onPress={showPhotoOptions}
      disabled={uploadingPhoto}
    >
      {uploadingPhoto ? (
        <ActivityIndicator color="#6B7280" size="small" />
      ) : (
        <>
          <Text style={{ color: '#6B7280', fontSize: 20 }}>+</Text>
          <Text style={{ color: '#4B5563', fontSize: 9, marginTop: 2 }}>Photo</Text>
        </>
      )}
    </TouchableOpacity>
  )}
</View>
```

---

## Backend — ShopItem already supports photos

`photos String[]` already exists on the ShopItem model. No schema change needed.

The `createItem` DTO already accepts `photos: string[]`. Just pass the Cloudinary URLs.

---

## Env Vars

Add to `apps/mobile/.env` (and Expo dashboard for EAS builds):
```
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=auxtion_unsigned
```

`EXPO_PUBLIC_` prefix makes vars available in Expo client-side code.

---

## Limits & Best Practices

- Max 5 photos per item
- Compress to `quality: 0.8` before upload — good balance of size/quality
- Square crop `aspect: [1, 1]` — consistent grid display
- Show upload progress per photo — don't block the whole form
- Store URLs immediately after upload — don't wait for form submit
- On error: remove failed photo from array, show retry option