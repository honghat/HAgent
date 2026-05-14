import fs from 'node:fs';
import path from 'node:path';
import { registerTool } from './registry.js';
import { PROJECT_ROOT } from '../../config.js';

export async function viewImage({ path: imagePath }) {
  const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(PROJECT_ROOT, imagePath);
  
  if (!fs.existsSync(fullPath)) {
    return `Lỗi: Không tìm thấy file tại ${fullPath}`;
  }

  const ext = path.extname(fullPath).toLowerCase().slice(1);
  const mimeType = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'application/octet-stream'));
  
  try {
    const data = fs.readFileSync(fullPath);
    const base64 = data.toString('base64');
    
    // Return a special object that decideAndExecuteTools can recognize
    return {
      _isVisionResult: true,
      mimeType,
      data: base64,
      path: imagePath
    };
  } catch (err) {
    return `Lỗi đọc file: ${err.message}`;
  }
}

registerTool({
  name: 'view_image',
  description: 'Xem và phân tích nội dung hình ảnh.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Đường dẫn tới file hình ảnh' }
    },
    required: ['path']
  },
  handler: viewImage,
  label: 'Đang đọc hình ảnh...'
});
