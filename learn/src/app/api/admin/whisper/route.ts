import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    const rootDir = '/Users/nguyenhat/NewHat';

    if (action === 'start') {
      // Kiểm tra xem đã chạy chưa
      try {
        const { stdout } = await execAsync('lsof -ti:9000');
        if (stdout.trim()) return NextResponse.json({ message: 'Whisper đang chạy rồi.' });
      } catch (e) {}

      // Khởi chạy dùng script có sẵn
      exec(`bash ${path.join(rootDir, 'whisper_on.sh')}`);
      
      return NextResponse.json({ message: 'Đang khởi động Whisper... Vui lòng đợi vài giây.' });
    } 
    
    if (action === 'stop') {
      try {
        await execAsync(`bash ${path.join(rootDir, 'whisper_off.sh')}`);
        return NextResponse.json({ message: 'Đã tắt Whisper thành công.' });
      } catch (e: any) {
        return NextResponse.json({ error: 'Lỗi khi tắt Whisper: ' + e.message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { stdout } = await execAsync('lsof -ti:9000');
    return NextResponse.json({ running: !!stdout.trim() });
  } catch (e) {
    return NextResponse.json({ running: false });
  }
}
