# React Default Collapse Pattern

## Problem
Một expandable section (ví dụ "Thay đổi file") mặc định xổ ra hết nội dung khi component mount → gây rối UI, user phải scroll qua.

## Pattern: 2-state toggle

Dùng **2 state riêng biệt** thay vì 1:
- `fcExpanded` — ghi nhận user đã click vào header
- `collapsed` — mặc định `true`, chỉ hiện ít item

```jsx
const [fcExpanded, setFcExpanded] = useState(false)
const [collapsed, setCollapsed] = useState(true)
const showCount = 3
const display = (fcExpanded && !collapsed) ? fileChanges : fileChanges.slice(0, showCount)
```

Khi user click header:
```jsx
onClick={() => {
  setFcExpanded((e) => !e)
  setCollapsed(false)  // mở rộng hoàn toàn
}}
```

## Logic
| Trạng thái | `fcExpanded` | `collapsed` | Hiển thị |
|---|---|---|---|
| Mới mount | `false` | `true` | Chỉ 3 item + dấu `…` |
| Click lần 1 | `true` | `false` | Tất cả item |
| Click lần 2 (thu gọn) | `false` | `false` | Chỉ 3 item + dấu `…` |
| Click lần 3+ | `true` | `false` | Tất cả item |

Điều này cho phép:
1. Mặc định thu gọn (không xổ hết)
2. Sau khi user đã mở rộng, collapse chỉ thu gọn UI chứ không reset về `collapsed=true`
3. User không cần click 2 lần để xem hết

## Ưu điểm so với 1-state toggle
- 1 state (`expanded`) → mặc định `true` xổ hết; mặc định `false` thì user phải click mới thấy có gì
- 2 state → mặc định gọn, click cái xổ hết, click lại thu gọn. Tự nhiên hơn.
