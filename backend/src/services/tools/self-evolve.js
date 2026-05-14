import { registerTool } from './registry.js';
import { updateEvolvedInstructions } from '../self-evolution/manager.js';

export async function selfEvolve({ reason, updatedInstructions }) {
  console.log(`[Self-Evolve] Agent evolving. Reason: ${reason}`);
  
  const result = updateEvolvedInstructions(updatedInstructions);
  
  if (result.success) {
    return `✅ Hệ thống đã tự cập nhật hướng dẫn mới dựa trên: ${reason}`;
  } else {
    return `❌ Lỗi cập nhật hướng dẫn: ${result.error}`;
  }
}

registerTool({
  name: 'self_evolve',
  description: 'Tự soi xét kết quả và cập nhật hướng dẫn hệ thống (DNA) của chính mình để làm việc hiệu quả hơn trong tương lai.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Lý do cần cập nhật hướng dẫn (phân tích từ sai lầm hoặc thành công)' },
      updatedInstructions: { type: 'string', description: 'Nội dung hướng dẫn hệ thống đầy đủ sau khi đã tối ưu' }
    },
    required: ['reason', 'updatedInstructions']
  },
  handler: selfEvolve,
  label: 'Đang thực hiện tự tiến hóa...'
});
