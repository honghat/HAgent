import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    const rootDir = '/Users/nguyenhat/HAgent/learn';
    const luxDir = path.join(rootDir, 'LuxTTS');
    const pythonPath = process.env.HATAI_PYTHON || path.join(rootDir, '.venv/bin/python');

    if (action === 'start') {
      // Kiểm tra xem đã chạy chưa
      try {
        const { stdout } = await execAsync('lsof -ti:8880');
        if (stdout.trim()) return NextResponse.json({ message: 'LuxTTS đang chạy rồi.' });
      } catch (e) {}

      // Khởi chạy
      const logFile = '/tmp/luxtts.log';
      const cmd = `cd ${luxDir} && nohup ${pythonPath} server.py > ${logFile} 2>&1 &`;
      exec(cmd); // Chạy background, không đợi
      
      return NextResponse.json({ message: 'Đang khởi động LuxTTS... Vui lòng đợi vài giây.' });
    } 
    
    if (action === 'stop') {
      try {
        // Tìm PID đang chiếm port 8880
        const { stdout } = await execAsync('lsof -ti:8880');
        const pid = stdout.trim();
        if (pid) {
          await execAsync(`kill -9 ${pid}`);
          return NextResponse.json({ message: 'Đã tắt LuxTTS thành công.' });
        }
        return NextResponse.json({ message: 'LuxTTS hiện không chạy.' });
      } catch (e) {
        return NextResponse.json({ message: 'Không tìm thấy tiến trình LuxTTS đang chạy.' });
      }
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { stdout } = await execAsync('lsof -ti:8880');
    return NextResponse.json({ running: !!stdout.trim() });
  } catch (e) {
    return NextResponse.json({ running: false });
  }
}
