export default function GuideTab() {
  return (
    <div className="fade-in">
      <div className="card" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--surface2)', padding: '24px' }}>
        <h2 className="section-title" style={{ color: 'var(--accent)', fontSize: 20, marginBottom: '20px' }}>📘 Hướng dẫn học Tiếng Anh với NewHat AI</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section>
            <h3 style={{ color: 'var(--accent)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🗂️</span> Lộ trình & Danh mục (Curriculum)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • <strong>Nhóm theo Bài:</strong> Các bài học được tổ chức thành từng <strong>Unit (Bài 1, Bài 2...)</strong>. Mỗi bài bao gồm đầy đủ 6 kỹ năng: Nghe, Nói, Đọc, Viết, Từ vựng và Ngữ pháp bám sát cùng một chủ đề.<br/>
              • <strong>Chuẩn CEFR:</strong> Nội dung được AI biên soạn theo khung tham chiếu Châu Âu từ <strong>A1 đến C1</strong>, đảm bảo từ vựng và ngữ pháp phù hợp với trình độ của bạn.<br/>
              • <strong>Tiến độ:</strong> Hệ thống sẽ tự động đánh dấu các kỹ năng bạn đã hoàn thành trong mỗi bài học.
            </p>
          </section>

          <section>
            <h3 style={{ color: 'var(--green)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚀</span> Tạo bài tự động (Auto Generation)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • <strong>Tạo Bài tiếp theo:</strong> AI sẽ tự động phân tích các bài bạn đã học và tạo tiếp một Unit mới với đầy đủ 6 kỹ năng.<br/>
              • <strong>Tạo 10 bài:</strong> Dành cho người muốn chuẩn bị lộ trình học dài hạn, AI sẽ tạo liên tiếp 10 Unit theo giáo trình.<br/>
              • <strong>Học ngẫu nhiên:</strong> Các bài học lẻ hoặc tự tạo theo chủ đề riêng sẽ được gom vào nhóm <strong>Học ngẫu nhiên</strong>.
            </p>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <section>
              <h3 style={{ color: 'var(--green)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎧</span> Nghe & 🎤 Nói
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                • <strong>Nghe:</strong> Điều chỉnh tốc độ (0.5x - 1.5x) và chọn giọng đọc đa dạng (Nam/Nữ, Anh/Mỹ).<br/>
                • <strong>Nói:</strong> Ghi âm để AI chấm điểm phát âm và gợi ý cách diễn đạt tự nhiên hơn.
              </p>
            </section>

            <section>
              <h3 style={{ color: 'var(--orange)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📖</span> Đọc & ✍️ Viết
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                • <strong>Đọc:</strong> Bôi đen từ mới để tra nghĩa tức thì. Trả lời câu hỏi trắc nghiệm để kiểm tra mức độ hiểu bài.<br/>
                • <strong>Viết:</strong> Luyện viết theo chủ đề và nhận phản hồi chi tiết từ AI về lỗi chính tả, ngữ pháp.
              </p>
            </section>

            <section>
              <h3 style={{ color: 'var(--blue)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📚</span> Từ vựng & 📐 Ngữ pháp
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                • <strong>Từ vựng:</strong> Học qua Flashcards thông minh đi kèm ví dụ thực tế trong bài học.<br/>
                • <strong>Ngữ pháp:</strong> Bài giảng cô đọng đi kèm bài tập thực hành áp dụng ngay vào ngữ cảnh thực tế.
              </p>
            </section>
          </div>

          <div style={{ marginTop: 10, padding: '12px 16px', background: 'rgba(88,166,255,0.08)', borderRadius: 12, border: '1px dashed var(--accent)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            💡 <strong>Mẹo nhỏ:</strong> Bạn nên chọn <strong>Chế độ luyện tập (Mode)</strong> phù hợp (Coder, Business, Giao tiếp...) ở thanh công cụ phía trên để AI tạo nội dung sát với nhu cầu thực tế của mình nhất.
          </div>
        </div>
      </div>
    </div>
  );
}
