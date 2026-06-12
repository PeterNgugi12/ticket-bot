const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

class CloudinaryService {
  constructor() {
    this.folder = process.env.CLOUDINARY_FOLDER || 'tix-culture/events';
  }

  async uploadImage(buffer, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: this.folder,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [
          { width: 1200, height: 630, crop: 'fill' },
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ],
        ...options,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  async uploadEventImage(buffer, eventId, title) {
    const options = {
      public_id: `${eventId}_${Date.now()}`,
      folder: `${this.folder}/${eventId}`,
      context: {
        alt: `Event poster for ${title}`,
        caption: title,
      },
    };

    return await this.uploadImage(buffer, options);
  }

  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  async deleteEventImages(eventId) {
    try {
      const result = await cloudinary.api.delete_resources_by_prefix(
        `${this.folder}/${eventId}`
      );
      return result;
    } catch (error) {
      console.error('Error deleting event images:', error);
      throw error;
    }
  }

  getOptimizedUrl(publicId, options = {}) {
    return cloudinary.url(publicId, {
      secure: true,
      width: options.width || 800,
      height: options.height || 600,
      crop: 'fill',
      quality: 'auto',
      fetch_format: 'auto',
      ...options,
    });
  }

  getThumbnailUrl(publicId) {
    return this.getOptimizedUrl(publicId, { width: 300, height: 300 });
  }

  getSocialMediaUrl(publicId) {
    return this.getOptimizedUrl(publicId, { width: 1200, height: 630 });
  }

  async uploadBase64(base64String, options = {}) {
    const buffer = Buffer.from(base64String.split(',')[1], 'base64');
    return await this.uploadImage(buffer, options);
  }
}

module.exports = new CloudinaryService();