const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'wqytmco9',
  api_key: process.env.CLOUDINARY_API_KEY || '957362682397795',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'CM0Y0DEP3eEhUL4rkCOBGEvkbHw',
  secure: true,
});

/**
 * Upload buffer ke Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder tujuan (mis. 'products', 'logos', 'banners')
 * @param {string} publicId - Opsional, ID unik (default auto)
 * @returns {Promise<{url: string, publicId: string, width: number, height: number, format: string}>}
 */
async function uploadToCloudinary(buffer, folder = 'nusadhipa', publicId = null) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId || undefined,
        resource_type: 'image',
        // Optimasi otomatis: quality & format terbaik
        quality: 'auto',
        fetch_format: 'auto',
        // Max dimensi (kalau file besar)
        transformation: [
          { width: 1600, height: 1600, crop: 'limit' },
          { quality: 'auto:good' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Hapus gambar dari Cloudinary.
 */
async function deleteFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    console.warn('Gagal hapus Cloudinary:', publicId, e.message);
  }
}

module.exports = { cloudinary, uploadToCloudinary, deleteFromCloudinary };