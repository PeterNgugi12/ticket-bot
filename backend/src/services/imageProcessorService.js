const Jimp = require('jimp');
const sharp = require('sharp');

class ImageProcessorService {
  async enhanceImageForQR(imageBuffer) {
    try {
      // Convert to buffer if needed
      let buffer = imageBuffer;
      if (Buffer.isBuffer(imageBuffer) === false) {
        buffer = Buffer.from(imageBuffer);
      }
      
      // Process image with sharp for better QR detection
      const processed = await sharp(buffer)
        .grayscale() // Convert to grayscale
        .normalize() // Normalize contrast
        .sharpen()   // Sharpen edges
        .threshold(128) // Binary threshold
        .toBuffer();
      
      return processed;
    } catch (error) {
      console.error('Image enhancement failed:', error);
      return imageBuffer; // Return original on error
    }
  }

  async resizeImage(imageBuffer, maxWidth = 1024, maxHeight = 1024) {
    try {
      const image = await Jimp.read(imageBuffer);
      
      let width = image.bitmap.width;
      let height = image.bitmap.height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
        image.resize(width, height);
      }
      
      return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.error('Image resize failed:', error);
      return imageBuffer;
    }
  }

  async convertToPNG(imageBuffer) {
    try {
      const image = await Jimp.read(imageBuffer);
      return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.error('PNG conversion failed:', error);
      return imageBuffer;
    }
  }

  async validateImageQuality(imageBuffer) {
    try {
      const image = await Jimp.read(imageBuffer);
      const { width, height } = image.bitmap;
      
      // Check minimum dimensions
      if (width < 200 || height < 200) {
        return { valid: false, reason: 'Image too small. Minimum 200x200 pixels required.' };
      }
      
      // Check aspect ratio (should be roughly square for QR)
      const ratio = Math.max(width, height) / Math.min(width, height);
      if (ratio > 2) {
        return { valid: false, reason: 'Image aspect ratio too extreme. QR code should be roughly square.' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Invalid image format' };
    }
  }

  async extractQRRegion(imageBuffer) {
    try {
      const image = await Jimp.read(imageBuffer);
      
      // Find QR code region (simplified - in production use more sophisticated detection)
      // For now, just return the center region where QR likely is
      const { width, height } = image.bitmap;
      const cropSize = Math.min(width, height) * 0.8;
      const x = (width - cropSize) / 2;
      const y = (height - cropSize) / 2;
      
      const cropped = image.clone().crop(x, y, cropSize, cropSize);
      return await cropped.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.error('QR region extraction failed:', error);
      return imageBuffer;
    }
  }

  async addWatermark(imageBuffer, text = 'TIX CULTURE') {
    try {
      const image = await Jimp.read(imageBuffer);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
      
      const { width, height } = image.bitmap;
      image.print(font, 10, height - 30, text);
      
      return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.error('Watermark addition failed:', error);
      return imageBuffer;
    }
  }
}

module.exports = new ImageProcessorService();