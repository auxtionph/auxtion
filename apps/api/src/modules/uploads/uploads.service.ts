import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export enum UploadPurpose {
  SHOP_ITEMS = 'shop-items',
  SELLER_APPLICATION = 'seller-application',
  PAYMENT_PROOF = 'payment-proof',
}

const PURPOSE_VALUES = Object.values(UploadPurpose) as string[];

@Injectable()
export class UploadsService {
  getSignature(
    userId: string,
    purpose: string,
  ): {
    signature: string;
    timestamp: number;
    cloudName: string;
    apiKey: string;
    folder: string;
    eager: string;
  } {
    if (!PURPOSE_VALUES.includes(purpose)) {
      throw new Error(`Invalid upload purpose: ${purpose}`);
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials not configured');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = `auxtion/${purpose}/${userId}`;
    const eager = 'c_limit,w_1600,q_auto,f_auto';
    const paramsToSign = `eager=${eager}&folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    return { signature, timestamp, cloudName, apiKey, folder, eager };
  }

  async deletePhoto(publicId: string): Promise<void> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return;

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        { method: 'POST', body: formData },
      );
      if (!res.ok) {
        console.warn(`[Cloudinary] delete ${publicId} failed:`, await res.text());
      }
    } catch (err) {
      console.warn(`[Cloudinary] delete error ${publicId}:`, err);
    }
  }
}
