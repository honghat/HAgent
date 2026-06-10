# CV Reading Before Job Matching — Critical Workflow

## Quy tắc bắt buộc (2026-06)

### 1. PHẢI ĐỌC CV TRƯỚC KHI MATCH JD

**Pitfall**: `job_hunter_match_new` yêu cầu `cv_text` trong DB, nhưng nếu user chưa upload CV → tool gọi với text rỗng hoặc fallback → match score不准.

**Quy trình đúng**:
```
User: "săn việc phân tích tài chính"
Agent: ✅ "Chưa có CV — anh cho phép đọc file CV không?" → read_file() hoặc paste summary
      ↓
   Có CV → extract_text() / docx extraction
      ↓
Gọi job_hunter_match_new(cv_text=extracted_text)
```

**Không được skip**: Nếu tool loop fail vì thiếu cv_text, hãy hỏi user upload lại hoặc cung cấp tóm tắt kinh nghiệm.

---

## 2. User Filtering — Phải Collect Upfront

Khi người dùng nói "làm tại HCM, lương trên 30 triệu", **KHÔNG** chỉ cào JD rồi filter thủ công. Phải:

1. **Extract từ text user**: `HCM` + `30 triệu` → normalize thành `location="Hồ Chí Minh"`, `salary_min=30000000`
2. **Call job_hunter_search** hoặc **web_search** nếu database chưa filter được
3. **Báo rõ số lượng JD matching** trước khi đưa top matches

**Pattern**:
```yaml
User: "làm tại HCM, lương trên 30 triệu"
Extract: location="HCM", salary_min=30M
↓
Scrape → Filter by criteria → Match with CV
↓
Report: "Đã cào X JD, Y JD ở HCM >30M, Z top match:"
```

---

## 3. Database Limitation — Workaround Required

`job_hunter_search` hiện tại **không support filter theo salary/location** trong DB query — chỉ search bằng keyword.

**Workaround**:
- Nếu database cần filter: dùng `job_hunter_match_new(recent_hours=24)` + manual check location/salary từ kết quả
- Hoặc dùng `web_search` với query "phân tích tài chính HCM 30 triệu" để get fresh JD with filters

---

## Session Transcript Example

```
User: kiếm việc phân tích tài chính
Agent: 👍 Bắt đầu scan thị trường HCM!

→ Scrape từ ITViec/TopDev/CareerViet... ✅ 97 JD mới lưu DB

User: làm tại HCM, lương trên 30 triệu
Agent: Đã lọc profile anh (5 năm consolidation, SQL/Python) → Match với JD...

⚠️ Phát hiện: Database chưa filter theo location/salary. Đang tìm web results...

→ Web search: "phân tích tài chính analyst HCM 30 triệu"... ✅ 10 kết quả
   ↓
Match top 5 vị trí + lý do gap skill
```

---

## Checklist Before Match

```
✅ CV đã extract từ file/doc hoặc paste text
✅ User requirements collected (location, salary, experience)
✅ JD database updated (recent scrape hoặc web_search fallback)
⚠️ Nếu database không có JD matching criteria → dùng web_search
✅ Báo số lượng JD + top matches + lý do match/gap
```
