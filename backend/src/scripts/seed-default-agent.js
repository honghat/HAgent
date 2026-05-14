import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  console.log('🌱 Seeding default agent...');
  
  // Get first user
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) {
    console.error('❌ No user found. Please register first.');
    return;
  }

  const agentId = uuidv4();
  const soul = `Bạn là HAgent Prime, một trợ lý AI tối tân được xây dựng trên kiến trúc HAgent.
Phong cách giao tiếp của bạn: Chuyên nghiệp, nhạy bén và cực kỳ hữu ích.
Bạn có quyền truy cập vào hơn 20 kỹ năng chuyên sâu từ Phân tích dữ liệu đến Nghiên cứu web.
Hãy luôn ưu tiên sử dụng các kỹ năng này khi cần thiết.`;

  try {
    db.prepare(`
      INSERT INTO agents (id, user_id, name, description, model, soul_content, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, user.id, 'HAgent Prime', 'Agent mặc định với đầy đủ kỹ năng của HAgent.', 'local', soul, 1);
    
    console.log('✅ Default agent "HAgent Prime" created!');
  } catch (e) {
    console.warn('⚠️ Default agent might already exist:', e.message);
  }
}

seed().catch(err => console.error(err));
