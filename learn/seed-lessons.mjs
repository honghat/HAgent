import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LESSONS = [
  // ========== HTML/CSS ==========
  {
    track: 'html-css',
    topic: 'HTML5 Semantic Tags',
    content: `# HTML5 Semantic Tags

## 🎯 Mục tiêu
Hiểu và sử dụng đúng các thẻ HTML5 ngữ nghĩa để cấu trúc trang web rõ ràng, tốt cho SEO và accessibility.

## 📖 Giải thích
Thẻ semantic (ngữ nghĩa) là các thẻ HTML mô tả đúng mục đích nội dung bên trong, thay cho \`<div>\` chung chung. Các thẻ chính gồm \`<header>\`, \`<nav>\`, \`<main>\`, \`<article>\`, \`<section>\`, \`<aside>\`, \`<footer>\`. Trình duyệt, công cụ đọc màn hình và Google đều hiểu cấu trúc này tốt hơn, giúp trang web có thứ hạng SEO cao hơn và thân thiện với người khiếm thị.

## 💻 Ví dụ code
\`\`\`html
<!-- Cấu trúc trang blog chuẩn -->
<header>
  <nav>Menu điều hướng</nav>
</header>
<main>
  <article>
    <h1>Tiêu đề bài viết</h1>
    <section>Nội dung phần 1</section>
    <section>Nội dung phần 2</section>
  </article>
  <aside>Bài viết liên quan</aside>
</main>
<footer>© 2026 NewHat</footer>
\`\`\`

## 🧠 Quiz (3 câu)
1. Thẻ nào dùng cho nội dung chính của trang?
A) <div id="main"> B) <main> C) <content>
ĐÁPÁN:B

2. Thẻ nào phù hợp cho một bài viết blog độc lập?
A) <section> B) <div> C) <article>
ĐÁPÁN:C

3. Lợi ích lớn nhất của semantic HTML là gì?
A) Tải trang nhanh hơn B) Tốt cho SEO và accessibility C) Giảm dung lượng CSS
ĐÁPÁN:B

## 💡 Thực hành
Viết lại trang giới thiệu bản thân dùng toàn bộ thẻ semantic, không dùng \`<div>\`.
`
  },
  {
    track: 'html-css',
    topic: 'CSS Flexbox',
    content: `# CSS Flexbox

## 🎯 Mục tiêu
Căn chỉnh và phân bố các phần tử theo hàng/cột chỉ với vài dòng CSS, không cần float hay position.

## 📖 Giải thích
Flexbox là mô hình bố cục 1 chiều (hàng HOẶC cột). Khai báo \`display: flex\` trên phần tử cha (flex container) biến các con trực tiếp thành flex items. Các thuộc tính chính: \`flex-direction\` (row/column), \`justify-content\` (căn theo trục chính), \`align-items\` (căn theo trục phụ), \`gap\` (khoảng cách). Flexbox xử lý căn giữa dễ dàng - điều trước đây là cơn ác mộng với CSS cũ.

## 💻 Ví dụ code
\`\`\`css
.container {
  display: flex;
  justify-content: center;  /* Căn giữa ngang */
  align-items: center;      /* Căn giữa dọc */
  gap: 16px;                /* Khoảng cách giữa items */
  height: 100vh;
}
.item {
  flex: 1;  /* Chia đều không gian còn lại */
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Flexbox là mô hình bố cục mấy chiều?
A) 1 chiều B) 2 chiều C) 3 chiều
ĐÁPÁN:A

2. Thuộc tính nào căn giữa theo trục chính?
A) align-items B) justify-content C) text-align
ĐÁPÁN:B

3. \`flex: 1\` có tác dụng gì?
A) Đặt kích thước cố định B) Chia đều không gian còn lại C) Ẩn phần tử
ĐÁPÁN:B

## 💡 Thực hành
Tạo navbar có logo bên trái, menu ở giữa, nút đăng nhập bên phải bằng Flexbox.
`
  },
  {
    track: 'html-css',
    topic: 'CSS Grid Layout',
    content: `# CSS Grid Layout

## 🎯 Mục tiêu
Xây dựng bố cục 2 chiều (hàng + cột) phức tạp bằng CSS Grid - công cụ mạnh nhất để làm layout web hiện đại.

## 📖 Giải thích
CSS Grid cho phép khai báo lưới hàng + cột trên container. Dùng \`grid-template-columns\` để định nghĩa cột (vd \`1fr 2fr 1fr\` = 3 cột, cột giữa rộng gấp đôi), \`grid-template-rows\` cho hàng. Đơn vị \`fr\` (fraction) chia tỉ lệ, \`repeat(3, 1fr)\` lặp 3 cột đều. Grid khác Flexbox: Grid làm 2 chiều cùng lúc, Flexbox chỉ 1 chiều.

## 💻 Ví dụ code
\`\`\`css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr); /* 3 cột đều */
  grid-template-rows: 100px auto;        /* Hàng 1 cố định, hàng 2 tự co */
  gap: 16px;
}
.featured {
  grid-column: span 2;  /* Item này chiếm 2 cột */
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Đơn vị \`fr\` trong Grid có nghĩa là gì?
A) Pixel cố định B) Phần tỉ lệ không gian còn lại C) Phần trăm container
ĐÁPÁN:B

2. Khi nào nên dùng Grid thay vì Flexbox?
A) Bố cục 2 chiều phức tạp B) Menu ngang đơn giản C) Luôn dùng Flexbox tốt hơn
ĐÁPÁN:A

3. \`grid-column: span 2\` nghĩa là gì?
A) Item chiếm 2 cột B) Cột thứ 2 C) Nhân đôi kích thước
ĐÁPÁN:A

## 💡 Thực hành
Thiết kế layout báo online: header, sidebar, 3 cột bài viết, footer bằng Grid.
`
  },

  // ========== JAVASCRIPT ==========
  {
    track: 'javascript',
    topic: 'let, const vs var',
    content: `# let, const vs var

## 🎯 Mục tiêu
Phân biệt 3 cách khai báo biến và biết khi nào dùng cái nào để tránh bug.

## 📖 Giải thích
\`var\` (ES5) có function-scope và hoisting, dễ gây bug khi tên biến trùng. \`let\` (ES6) có block-scope, chỉ tồn tại trong \`{}\` - an toàn hơn. \`const\` cũng block-scope nhưng KHÔNG thể gán lại giá trị. Quy tắc: mặc định dùng \`const\`, đổi giá trị thì dùng \`let\`, TRÁNH dùng \`var\`. Lưu ý: \`const\` với object/array vẫn thay đổi được nội dung bên trong, chỉ không gán lại.

## 💻 Ví dụ code
\`\`\`javascript
// ❌ var - dễ lỗi
if (true) { var x = 1; }
console.log(x); // 1 - "leak" ra ngoài block!

// ✅ let - block-scope
if (true) { let y = 1; }
// console.log(y); // Error - đúng như mong đợi

// ✅ const - không gán lại
const user = { name: 'An' };
user.name = 'Bình'; // OK - đổi property được
// user = {}; // Error - không gán lại được
\`\`\`

## 🧠 Quiz (3 câu)
1. Khai báo nào nên dùng mặc định?
A) var B) let C) const
ĐÁPÁN:C

2. \`const arr = [1,2]; arr.push(3);\` kết quả là gì?
A) Lỗi không thay đổi được B) arr = [1,2,3] C) Lỗi runtime
ĐÁPÁN:B

3. Phạm vi (scope) của \`let\` là gì?
A) Function B) Block {} C) Global
ĐÁPÁN:B

## 💡 Thực hành
Viết hàm tính tổng mảng dùng \`const\` cho mảng đầu vào và \`let\` cho biến tổng.
`
  },
  {
    track: 'javascript',
    topic: 'Arrow Functions',
    content: `# Arrow Functions

## 🎯 Mục tiêu
Viết hàm ngắn gọn, dễ đọc hơn function truyền thống, và hiểu khác biệt về \`this\`.

## 📖 Giải thích
Arrow function (\`=>\`) là cú pháp rút gọn cho function. Nếu body chỉ 1 dòng, có thể bỏ \`{}\` và \`return\` - gọi là implicit return. Nếu chỉ 1 tham số, có thể bỏ \`()\`. Khác biệt QUAN TRỌNG: arrow function KHÔNG có \`this\` riêng - nó kế thừa \`this\` từ context cha. Điều này rất hữu ích trong callback, đặc biệt khi dùng với React.

## 💻 Ví dụ code
\`\`\`javascript
// Function thường
const add1 = function(a, b) { return a + b; };

// Arrow function - ngắn gọn
const add2 = (a, b) => a + b;

// 1 tham số - bỏ ngoặc
const double = x => x * 2;

// Dùng trong map/filter
const nums = [1, 2, 3];
const squared = nums.map(n => n * n); // [1, 4, 9]
const evens = nums.filter(n => n % 2 === 0); // [2]
\`\`\`

## 🧠 Quiz (3 câu)
1. \`const f = x => x * 2\` với x=5 trả về gì?
A) 5 B) 10 C) 25
ĐÁPÁN:B

2. Arrow function có \`this\` riêng không?
A) Có, như function thường B) Không, kế thừa từ context cha C) Tùy trình duyệt
ĐÁPÁN:B

3. Khi nào bắt buộc phải dùng \`{}\` trong arrow function?
A) Khi có nhiều dòng code B) Luôn phải có C) Khi trả về number
ĐÁPÁN:A

## 💡 Thực hành
Chuyển đổi 5 function thường thành arrow function và dùng \`.map()\` nhân đôi mỗi phần tử mảng.
`
  },
  {
    track: 'javascript',
    topic: 'Destructuring Assignment',
    content: `# Destructuring Assignment

## 🎯 Mục tiêu
Trích xuất giá trị từ object/array thành các biến riêng lẻ chỉ với 1 dòng code.

## 📖 Giải thích
Destructuring là cú pháp "tháo gỡ" giá trị từ array hoặc object. Với object, dùng \`{}\` và tên property. Với array, dùng \`[]\` theo thứ tự. Có thể đặt giá trị mặc định (\`=\`), đổi tên biến (\`:\`), hoặc gom phần còn lại bằng rest (\`...\`). Rất hay dùng khi nhận props trong React, lấy dữ liệu từ API, hoặc import module.

## 💻 Ví dụ code
\`\`\`javascript
// Object destructuring
const user = { name: 'An', age: 25, city: 'HN' };
const { name, age } = user;
// name = 'An', age = 25

// Đổi tên biến + default value
const { city: diaChi, country = 'VN' } = user;
// diaChi = 'HN', country = 'VN'

// Array destructuring
const [first, second, ...rest] = [1, 2, 3, 4, 5];
// first=1, second=2, rest=[3,4,5]

// Trong function params (rất phổ biến trong React)
function Card({ title, desc }) {
  return \`<h1>\${title}</h1><p>\${desc}</p>\`;
}
\`\`\`

## 🧠 Quiz (3 câu)
1. \`const {a, b} = {a:1, b:2, c:3}\` - giá trị của b là?
A) 2 B) undefined C) {b:2}
ĐÁPÁN:A

2. \`const [x, ...y] = [10, 20, 30]\` - y là gì?
A) 20 B) [20, 30] C) [10, 20, 30]
ĐÁPÁN:B

3. Cú pháp nào đặt giá trị mặc định khi destructure?
A) \`{a || 5}\` B) \`{a = 5}\` C) \`{a: 5}\`
ĐÁPÁN:B

## 💡 Thực hành
Viết hàm nhận object \`{name, email, role}\` và trả về chuỗi chào, dùng destructuring trong params.
`
  },
  {
    track: 'javascript',
    topic: 'Async/Await và Fetch API',
    content: `# Async/Await và Fetch API

## 🎯 Mục tiêu
Gọi API bất đồng bộ với cú pháp dễ đọc như code đồng bộ, xử lý lỗi đúng cách.

## 📖 Giải thích
\`fetch()\` trả về Promise - một "lời hứa" sẽ có kết quả sau. Thay vì dùng \`.then().then()\` lồng nhau, dùng \`async/await\` viết như code tuần tự bình thường. Hàm có \`async\` luôn trả về Promise. Từ khóa \`await\` DỪNG code chờ Promise xong mới chạy tiếp. Luôn bọc trong \`try/catch\` để bắt lỗi mạng hoặc lỗi parse JSON.

## 💻 Ví dụ code
\`\`\`javascript
async function layDanhSachUser() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Lỗi HTTP ' + res.status);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Lỗi:', err.message);
    return [];
  }
}

// POST với body JSON
async function taoUser(user) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  return res.json();
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Hàm có \`async\` luôn trả về kiểu gì?
A) undefined B) Promise C) Kiểu tùy ý
ĐÁPÁN:B

2. \`await\` có thể dùng ở đâu?
A) Bất cứ đâu B) Chỉ trong hàm async C) Chỉ trong if
ĐÁPÁN:B

3. Tại sao cần \`res.ok\` sau fetch?
A) Fetch không reject khi HTTP 4xx/5xx B) Để lấy data nhanh hơn C) Không cần thiết
ĐÁPÁN:A

## 💡 Thực hành
Viết hàm \`async\` lấy thời tiết từ API công khai và in ra nhiệt độ Hà Nội, có try/catch.
`
  },

  // ========== REACT ==========
  {
    track: 'react',
    topic: 'JSX và Components',
    content: `# JSX và Components

## 🎯 Mục tiêu
Viết UI bằng cú pháp JSX và tách thành các component tái sử dụng được.

## 📖 Giải thích
JSX là cú pháp mở rộng của JavaScript cho phép viết HTML-like trong JS. Component là hàm trả về JSX - đặt tên VIẾT HOA chữ đầu. Dữ liệu truyền vào component qua \`props\` (giống argument hàm). Một số khác biệt JSX vs HTML: \`className\` thay \`class\`, \`htmlFor\` thay \`for\`, mọi thẻ tự đóng phải có \`/\` (\`<img />\`), biểu thức JS bọc trong \`{}\`.

## 💻 Ví dụ code
\`\`\`jsx
// Component đơn giản
function Welcome({ name, role }) {
  return (
    <div className="card">
      <h1>Xin chào {name}</h1>
      <p>Vai trò: {role}</p>
    </div>
  );
}

// Component cha dùng component con
function App() {
  const users = [
    { name: 'An', role: 'Dev' },
    { name: 'Bình', role: 'Designer' },
  ];
  return (
    <>
      {users.map(u => <Welcome key={u.name} {...u} />)}
    </>
  );
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Tên component React phải bắt đầu bằng?
A) Chữ thường B) Chữ HOA C) Dấu gạch dưới
ĐÁPÁN:B

2. Trong JSX, class CSS được viết là?
A) class B) className C) css-class
ĐÁPÁN:B

3. Cách truyền dữ liệu từ component cha sang con?
A) Biến global B) Props C) Local storage
ĐÁPÁN:B

## 💡 Thực hành
Tạo component \`Card\` nhận props \`title\`, \`desc\`, \`image\` và render 3 Card với dữ liệu khác nhau.
`
  },
  {
    track: 'react',
    topic: 'useState Hook',
    content: `# useState Hook

## 🎯 Mục tiêu
Thêm trạng thái (state) cho component để UI tự động cập nhật khi dữ liệu thay đổi.

## 📖 Giải thích
\`useState\` cho phép component "nhớ" giá trị giữa các lần render. Trả về mảng 2 phần tử: giá trị hiện tại và hàm để cập nhật. Khi gọi hàm setter, React re-render component với giá trị mới. QUAN TRỌNG: state là immutable - với object/array phải tạo bản sao mới (\`{...state}\` hoặc \`[...state]\`), không sửa trực tiếp. Nhiều state độc lập → gọi \`useState\` nhiều lần.

## 💻 Ví dụ code
\`\`\`jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0); // giá trị khởi tạo = 0

  return (
    <div>
      <p>Đếm: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}

// Với object - phải tạo bản sao
function UserForm() {
  const [user, setUser] = useState({ name: '', email: '' });

  const handleChange = (field, value) => {
    setUser({ ...user, [field]: value }); // copy rồi đổi
  };
  // ...
}
\`\`\`

## 🧠 Quiz (3 câu)
1. \`const [x, setX] = useState(10)\` - setX làm gì?
A) Đọc giá trị x B) Cập nhật x và re-render C) Xóa x
ĐÁPÁN:B

2. Cách đúng cập nhật object state?
A) state.name = 'new' B) setState({...state, name: 'new'}) C) setState(name = 'new')
ĐÁPÁN:B

3. Khi state thay đổi, component sẽ?
A) Re-render tự động B) Chỉ log ra C) Không có gì xảy ra
ĐÁPÁN:A

## 💡 Thực hành
Tạo form đăng nhập với state \`{email, password}\`, in object khi click nút submit.
`
  },
  {
    track: 'react',
    topic: 'useEffect Hook',
    content: `# useEffect Hook

## 🎯 Mục tiêu
Chạy side effect (gọi API, đăng ký event, timer) khi component mount/update/unmount.

## 📖 Giải thích
\`useEffect(fn, deps)\` chạy \`fn\` SAU khi component render. Tham số thứ 2 là dependency array quyết định khi nào chạy lại:
- Không truyền: chạy sau MỌI render
- \`[]\`: chỉ chạy 1 lần khi mount (như componentDidMount)
- \`[a, b]\`: chạy khi a hoặc b thay đổi

Nếu fn trả về một function, đó là cleanup - chạy trước lần render tiếp theo hoặc khi unmount. Dùng cleanup để hủy timer, hủy subscription, tránh memory leak.

## 💻 Ví dụ code
\`\`\`jsx
import { useState, useEffect } from 'react';

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  // Gọi API khi userId đổi
  useEffect(() => {
    let cancelled = false;
    fetch(\`/api/users/\${userId}\`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setUser(data); });

    return () => { cancelled = true; }; // cleanup
  }, [userId]);

  if (!user) return <div>Đang tải...</div>;
  return <div>{user.name}</div>;
}
\`\`\`

## 🧠 Quiz (3 câu)
1. \`useEffect(fn, [])\` chạy khi nào?
A) Sau mỗi render B) Chỉ 1 lần khi mount C) Khi unmount
ĐÁPÁN:B

2. Return function trong useEffect dùng để?
A) Cleanup (hủy subscription, timer) B) Trả về giá trị mới C) Log debug
ĐÁPÁN:A

3. \`useEffect(fn, [count])\` chạy lại khi nào?
A) Mỗi render B) count thay đổi C) Mọi state đổi
ĐÁPÁN:B

## 💡 Thực hành
Tạo counter tự tăng mỗi giây bằng \`setInterval\` trong useEffect, nhớ cleanup bằng \`clearInterval\`.
`
  },

  // ========== NEXT.JS ==========
  {
    track: 'nextjs',
    topic: 'App Router Cấu Trúc File',
    content: `# App Router Cấu Trúc File

## 🎯 Mục tiêu
Hiểu cách Next.js App Router tạo routing tự động dựa trên cấu trúc thư mục.

## 📖 Giải thích
Trong App Router (từ Next.js 13+), mọi route nằm trong \`app/\`. Mỗi folder = 1 segment URL. File \`page.tsx\` là UI của route. File \`layout.tsx\` bọc quanh children, dùng chung cho tất cả route con. Route động dùng \`[param]\` (vd \`app/blog/[slug]/page.tsx\`). Các file đặc biệt: \`loading.tsx\` (Suspense fallback), \`error.tsx\` (error boundary), \`not-found.tsx\` (404). Chỉ \`page.tsx\` và \`route.ts\` tạo URL có thể truy cập.

## 💻 Ví dụ code
\`\`\`
app/
├── layout.tsx        → Layout gốc (bọc mọi trang)
├── page.tsx          → URL: /
├── about/
│   └── page.tsx      → URL: /about
├── blog/
│   ├── page.tsx      → URL: /blog
│   └── [slug]/
│       └── page.tsx  → URL: /blog/bai-1, /blog/bai-2...
└── api/
    └── users/
        └── route.ts  → API: /api/users
\`\`\`

\`\`\`tsx
// app/blog/[slug]/page.tsx
export default function BlogPost({ params }) {
  return <h1>Bài viết: {params.slug}</h1>;
}
\`\`\`

## 🧠 Quiz (3 câu)
1. File nào tạo URL có thể truy cập?
A) component.tsx B) page.tsx C) index.tsx
ĐÁPÁN:B

2. URL \`/blog/abc\` sẽ map tới file nào?
A) app/blog/abc.tsx B) app/blog/[slug]/page.tsx C) app/blog.tsx
ĐÁPÁN:B

3. File layout.tsx có tác dụng gì?
A) Tạo trang mới B) Bọc quanh các page con C) Định nghĩa CSS
ĐÁPÁN:B

## 💡 Thực hành
Tạo cấu trúc: /, /products, /products/[id] với 1 layout chung có header/footer.
`
  },
  {
    track: 'nextjs',
    topic: 'Server Components vs Client Components',
    content: `# Server Components vs Client Components

## 🎯 Mục tiêu
Phân biệt 2 loại component trong Next.js App Router và biết chọn đúng loại cho từng việc.

## 📖 Giải thích
MẶC ĐỊNH mọi component trong App Router là Server Component - chạy TRÊN SERVER, không gửi JS xuống client. Ưu điểm: truy cập DB/filesystem trực tiếp, bundle size nhỏ, SEO tốt. NHƯNG không dùng được \`useState\`, \`useEffect\`, event handler. Khi cần interaction (click, input, state) → thêm \`'use client'\` ở đầu file → thành Client Component. Quy tắc: giữ Server Component càng nhiều càng tốt, chỉ "leaf" cần tương tác mới thành Client.

## 💻 Ví dụ code
\`\`\`tsx
// Server Component (mặc định) - fetch trực tiếp
// app/posts/page.tsx
import { prisma } from '@/lib/prisma';

export default async function Posts() {
  const posts = await prisma.post.findMany(); // DB query trực tiếp
  return (
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
\`\`\`

\`\`\`tsx
// Client Component - cần interaction
'use client';
import { useState } from 'react';

export default function LikeButton() {
  const [liked, setLiked] = useState(false);
  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? '❤️' : '🤍'}
    </button>
  );
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Mặc định component trong App Router là loại gì?
A) Client B) Server C) Hybrid
ĐÁPÁN:B

2. Muốn dùng useState thì cần gì?
A) Thêm 'use state' B) Thêm 'use client' C) Không làm gì
ĐÁPÁN:B

3. Ưu điểm của Server Component?
A) Truy cập DB trực tiếp, bundle nhỏ B) Chạy nhanh hơn trên browser C) Dùng được mọi hook
ĐÁPÁN:A

## 💡 Thực hành
Tạo trang danh sách sản phẩm (Server) + nút "Yêu thích" (Client) trong cùng 1 page.
`
  },
  {
    track: 'nextjs',
    topic: 'API Routes với route.ts',
    content: `# API Routes với route.ts

## 🎯 Mục tiêu
Tạo REST API endpoint ngay trong project Next.js, xử lý GET/POST/PUT/DELETE.

## 📖 Giải thích
Tạo file \`route.ts\` (hoặc \`route.js\`) trong \`app/api/...\` để định nghĩa API endpoint. Export hàm có tên HTTP method (\`GET\`, \`POST\`, \`PUT\`, \`DELETE\`, \`PATCH\`). Mỗi hàm nhận \`Request\` và trả về \`Response\` (hoặc \`NextResponse\`). Dùng \`Response.json()\` để trả JSON kèm status code. Route handlers CHẠY TRÊN SERVER - có thể gọi DB, đọc file, giữ bí mật API key an toàn.

## 💻 Ví dụ code
\`\`\`typescript
// app/api/users/route.ts
import { prisma } from '@/lib/prisma';

// GET /api/users
export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });
  return Response.json(users);
}

// POST /api/users
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.email) {
    return Response.json({ error: 'Thiếu email' }, { status: 400 });
  }
  const user = await prisma.user.create({ data: body });
  return Response.json(user, { status: 201 });
}
\`\`\`

## 🧠 Quiz (3 câu)
1. Tên file nào tạo API endpoint?
A) api.ts B) route.ts C) handler.ts
ĐÁPÁN:B

2. Muốn xử lý POST thì làm gì?
A) Export function POST B) Thêm method='POST' C) Dùng chung handler
ĐÁPÁN:A

3. API routes chạy ở đâu?
A) Browser của user B) Server C) Cả 2
ĐÁPÁN:B

## 💡 Thực hành
Tạo API \`/api/todos\` với GET (liệt kê) và POST (thêm), lưu trong mảng tạm (không cần DB).
`
  },

  // ========== NODE.JS ==========
  {
    track: 'nodejs',
    topic: 'CommonJS vs ES Modules',
    content: `# CommonJS vs ES Modules

## 🎯 Mục tiêu
Hiểu 2 hệ thống module trong Node.js và biết dùng đúng cú pháp import/export.

## 📖 Giải thích
**CommonJS** (cũ, mặc định Node.js): \`require()\` để import, \`module.exports\` hoặc \`exports.x\` để export. Đồng bộ, chạy runtime. **ES Modules (ESM)** (chuẩn JS hiện đại): \`import/export\`, bất đồng bộ, static analysis. Để dùng ESM trong Node: thêm \`"type": "module"\` vào package.json HOẶC đặt đuôi file là \`.mjs\`. Khi viết thư viện mới → ưu tiên ESM. Đa số project Next.js/React hiện nay dùng ESM.

## 💻 Ví dụ code
\`\`\`javascript
// --- CommonJS (cũ) ---
// math.js
function add(a, b) { return a + b; }
module.exports = { add };

// index.js
const { add } = require('./math');
console.log(add(2, 3)); // 5

// --- ES Modules (mới) ---
// math.mjs
export function add(a, b) { return a + b; }
export default function sub(a, b) { return a - b; }

// index.mjs
import sub, { add } from './math.mjs';
console.log(add(2, 3), sub(5, 2)); // 5 3
\`\`\`

## 🧠 Quiz (3 câu)
1. Cú pháp nào là ES Modules?
A) require() B) import/export C) include
ĐÁPÁN:B

2. Để dùng ESM trong Node.js cần gì?
A) Cài thêm npm B) "type": "module" trong package.json C) Không cần gì
ĐÁPÁN:B

3. Đuôi file nào luôn là ESM bất kể cấu hình?
A) .js B) .mjs C) .cjs
ĐÁPÁN:B

## 💡 Thực hành
Viết 2 file: \`utils.mjs\` export 2 hàm, và \`main.mjs\` import + gọi chúng.
`
  },
  {
    track: 'nodejs',
    topic: 'Module fs (File System)',
    content: `# Module fs (File System)

## 🎯 Mục tiêu
Đọc, ghi, xóa file trên hệ thống bằng module \`fs\` built-in của Node.js.

## 📖 Giải thích
\`fs\` là module built-in của Node.js để làm việc với file system. Có 3 phong cách API:
- **Callback**: \`fs.readFile(path, cb)\` - cách cũ, dễ tạo callback hell
- **Sync**: \`fs.readFileSync()\` - chặn event loop, chỉ dùng cho script nhỏ
- **Promise**: \`fs.promises.readFile()\` hoặc \`import { readFile } from 'fs/promises'\` - nên dùng với async/await

Luôn handle lỗi (file không tồn tại, không có quyền...). Dùng \`path.join()\` để nối đường dẫn cross-platform.

## 💻 Ví dụ code
\`\`\`javascript
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Đọc file
async function docConfig() {
  try {
    const data = await readFile('config.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {}; // file không tồn tại
    throw err;
  }
}

// Ghi file
async function luuLog(msg) {
  const logPath = path.join(process.cwd(), 'logs', 'app.log');
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, \`[\${new Date().toISOString()}] \${msg}\\n\`, { flag: 'a' });
}
\`\`\`

## 🧠 Quiz (3 câu)
1. API nào nên dùng với async/await?
A) fs.readFile callback B) fs.readFileSync C) fs/promises.readFile
ĐÁPÁN:C

2. Mã lỗi khi file không tồn tại?
A) ENOENT B) EACCES C) EPERM
ĐÁPÁN:A

3. Tại sao nên dùng path.join()?
A) Ngắn hơn B) Cross-platform (Windows/Mac/Linux) C) Bắt buộc
ĐÁPÁN:B

## 💡 Thực hành
Viết script đọc file \`todos.json\`, thêm 1 todo mới, ghi lại. Tạo file nếu chưa có.
`
  },

  // ========== SQL ==========
  {
    track: 'sql',
    topic: 'SELECT, WHERE, ORDER BY',
    content: `# SELECT, WHERE, ORDER BY

## 🎯 Mục tiêu
Truy vấn dữ liệu cơ bản: chọn cột, lọc điều kiện, sắp xếp kết quả.

## 📖 Giải thích
\`SELECT col1, col2 FROM table\` chọn cột cần lấy. \`*\` = lấy tất cả (tránh trên production - chậm và lộ cột nhạy cảm). \`WHERE\` lọc hàng theo điều kiện: \`=\`, \`!=\`, \`>\`, \`<\`, \`LIKE\` (tìm mờ với \`%\`), \`IN (..)\` (trong danh sách), \`BETWEEN x AND y\`. Kết hợp điều kiện bằng \`AND\`/\`OR\`. \`ORDER BY col\` sắp xếp, mặc định ASC (tăng), thêm \`DESC\` để giảm. \`LIMIT n\` lấy tối đa n hàng.

## 💻 Ví dụ code
\`\`\`sql
-- Lấy 10 user mới nhất, chỉ cột cần thiết
SELECT id, name, email
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Lọc theo nhiều điều kiện
SELECT *
FROM products
WHERE price BETWEEN 100 AND 500
  AND category IN ('phone', 'laptop')
  AND name LIKE '%Pro%'
ORDER BY price ASC;

-- NULL phải dùng IS NULL, không dùng =
SELECT * FROM users WHERE phone IS NULL;
\`\`\`

## 🧠 Quiz (3 câu)
1. Lấy 5 bản ghi mới nhất sắp xếp thế nào?
A) ORDER BY created_at ASC LIMIT 5 B) ORDER BY created_at DESC LIMIT 5 C) LIMIT 5 DESC
ĐÁPÁN:B

2. Tìm tên có chứa "An" dùng gì?
A) WHERE name = 'An' B) WHERE name LIKE '%An%' C) WHERE name IN (An)
ĐÁPÁN:B

3. Kiểm tra NULL đúng cách?
A) WHERE x = NULL B) WHERE x IS NULL C) WHERE x == NULL
ĐÁPÁN:B

## 💡 Thực hành
Viết query lấy 10 sản phẩm giá 100k-1tr, tên chứa "iPhone", sắp xếp giá tăng dần.
`
  },
  {
    track: 'sql',
    topic: 'JOIN các bảng',
    content: `# JOIN các bảng

## 🎯 Mục tiêu
Kết hợp dữ liệu từ nhiều bảng liên quan thành 1 kết quả duy nhất.

## 📖 Giải thích
Dữ liệu thường tách thành nhiều bảng (normalize) để tránh lặp. JOIN kết nối chúng qua khóa ngoại (foreign key).
- **INNER JOIN**: chỉ lấy hàng khớp ở CẢ 2 bảng (phổ biến nhất)
- **LEFT JOIN**: lấy TẤT CẢ bảng trái + khớp từ bảng phải (NULL nếu không khớp)
- **RIGHT JOIN**: ngược lại
- **FULL OUTER JOIN**: tất cả hàng 2 bảng

Dùng alias (\`u\` cho \`users\`) để query gọn. Luôn chỉ định \`ON\` điều kiện khớp chính xác - thiếu sẽ sinh ra Cartesian product (tích Descartes, cực nhiều hàng).

## 💻 Ví dụ code
\`\`\`sql
-- Lấy bài viết kèm tên tác giả
SELECT
  p.id,
  p.title,
  u.name AS author_name
FROM posts p
INNER JOIN users u ON p.user_id = u.id
ORDER BY p.created_at DESC;

-- Lấy user + số bài viết (user chưa viết bài vẫn hiện)
SELECT
  u.name,
  COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
GROUP BY u.id, u.name
ORDER BY post_count DESC;
\`\`\`

## 🧠 Quiz (3 câu)
1. INNER JOIN trả về gì?
A) Tất cả 2 bảng B) Chỉ hàng khớp ở cả 2 bảng C) Chỉ bảng trái
ĐÁPÁN:B

2. Muốn hiện cả user chưa có bài viết dùng JOIN nào?
A) INNER JOIN B) LEFT JOIN users C) RIGHT JOIN posts
ĐÁPÁN:B

3. Quên \`ON\` thì điều gì xảy ra?
A) Lỗi syntax B) Cartesian product (cực nhiều hàng) C) Tự kết khóa chính
ĐÁPÁN:B

## 💡 Thực hành
Viết query hiển thị tên user + email + tổng số đơn hàng mỗi user (dùng LEFT JOIN + COUNT).
`
  },
  {
    track: 'sql',
    topic: 'GROUP BY và Aggregate Functions',
    content: `# GROUP BY và Aggregate Functions

## 🎯 Mục tiêu
Nhóm dữ liệu và tính toán thống kê: đếm, tổng, trung bình, min/max.

## 📖 Giải thích
\`GROUP BY col\` nhóm các hàng có cùng giá trị cột thành 1 hàng kết quả. Aggregate functions tính trên mỗi nhóm:
- \`COUNT(*)\`: đếm số hàng
- \`SUM(col)\`: tổng
- \`AVG(col)\`: trung bình
- \`MIN(col)\`, \`MAX(col)\`: nhỏ nhất, lớn nhất

Mọi cột trong SELECT phải ở trong GROUP BY HOẶC là aggregate function. Dùng \`HAVING\` để lọc SAU khi group (khác \`WHERE\` lọc TRƯỚC). Ví dụ \`HAVING COUNT(*) > 5\` - không dùng được với WHERE.

## 💻 Ví dụ code
\`\`\`sql
-- Doanh thu theo từng tháng
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS order_count,
  SUM(total) AS revenue,
  AVG(total) AS avg_order
FROM orders
WHERE status = 'completed'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- Top 5 user đặt nhiều nhất (có > 10 đơn)
SELECT u.name, COUNT(o.id) AS orders
FROM users u
JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 10
ORDER BY orders DESC
LIMIT 5;
\`\`\`

## 🧠 Quiz (3 câu)
1. Đếm số user dùng hàm nào?
A) LENGTH(*) B) COUNT(*) C) SIZE(*)
ĐÁPÁN:B

2. Lọc kết quả sau GROUP BY dùng?
A) WHERE B) HAVING C) FILTER
ĐÁPÁN:B

3. SELECT name, COUNT(*) cần có gì?
A) GROUP BY name B) ORDER BY name C) Không cần gì
ĐÁPÁN:A

## 💡 Thực hành
Viết query đếm số sản phẩm mỗi category, chỉ lấy category có > 3 sản phẩm, sắp xếp giảm dần.
`
  },

  // ========== GIT ==========
  {
    track: 'git',
    topic: 'Branching và Merging',
    content: `# Branching và Merging

## 🎯 Mục tiêu
Làm việc song song với nhiều nhánh, phát triển tính năng mà không ảnh hưởng nhánh chính.

## 📖 Giải thích
Branch (nhánh) là 1 dòng phát triển độc lập. Nhánh chính thường là \`main\` (hoặc \`master\`). Tạo nhánh mới để làm feature: không ảnh hưởng main, merge lại khi xong. \`git checkout -b feature-x\` = tạo + chuyển nhánh. \`git merge\` gộp nhánh khác vào nhánh hiện tại. Có 2 loại merge: **fast-forward** (nhánh đích không có commit mới - chỉ dời con trỏ) và **3-way merge** (có commit 2 bên - tạo merge commit).

## 💻 Ví dụ code
\`\`\`bash
# Tạo và chuyển qua nhánh feature mới
git checkout -b feature/login

# Làm việc, commit
git add .
git commit -m "Thêm form đăng nhập"

# Xem tất cả nhánh
git branch          # local
git branch -a       # cả remote

# Quay về main và merge feature vào
git checkout main
git pull                     # đồng bộ main mới nhất
git merge feature/login

# Xóa nhánh sau khi merge
git branch -d feature/login
\`\`\`

## 🧠 Quiz (3 câu)
1. Lệnh tạo + chuyển nhánh mới?
A) git branch new B) git checkout -b new C) git new-branch
ĐÁPÁN:B

2. Xóa nhánh đã merge an toàn?
A) git branch -D B) git branch -d C) git delete
ĐÁPÁN:B

3. Tại sao nên dùng branch cho feature mới?
A) Git bắt buộc B) Không ảnh hưởng nhánh chính khi đang dở C) Nhanh hơn
ĐÁPÁN:B

## 💡 Thực hành
Tạo nhánh \`feature/dark-mode\`, thêm 2 commit, checkout về main, merge vào, xóa nhánh.
`
  },
  {
    track: 'git',
    topic: 'Rebase vs Merge',
    content: `# Rebase vs Merge

## 🎯 Mục tiêu
Hiểu khác biệt giữa \`merge\` và \`rebase\`, biết khi nào dùng cái nào để có lịch sử commit sạch.

## 📖 Giải thích
**Merge**: gộp 2 nhánh, tạo thêm "merge commit". Lịch sử KHÔNG thay đổi - giữ nguyên commit gốc. An toàn, nhưng history trông rối nếu nhiều nhánh.

**Rebase**: lấy commit nhánh hiện tại, "áp" lên đỉnh nhánh đích. Lịch sử THẲNG, gọn đẹp. NHƯNG viết lại commit hash → KHÔNG rebase nhánh đã push chung với người khác (sẽ gây xung đột nghiêm trọng).

Quy tắc vàng: **Rebase nhánh feature local. Merge khi đưa vào main**. Hoặc team dùng workflow "squash and merge" trên PR.

## 💻 Ví dụ code
\`\`\`bash
# --- MERGE (an toàn, lịch sử rẽ nhánh) ---
git checkout feature
git merge main
# → Tạo merge commit

# --- REBASE (lịch sử thẳng, sạch) ---
git checkout feature
git rebase main
# → Commit của feature được "áp" lên đỉnh main

# Nếu có conflict khi rebase
# 1. Sửa file conflict
git add <file-da-sua>
git rebase --continue
# Hoặc hủy rebase: git rebase --abort

# ⚠️ KHÔNG làm điều này với nhánh đã push chung
# git push --force-with-lease  # chỉ khi nhánh của riêng mình
\`\`\`

## 🧠 Quiz (3 câu)
1. Rebase khác merge ở điểm nào?
A) Không tạo merge commit, lịch sử thẳng B) Nhanh hơn merge C) An toàn hơn
ĐÁPÁN:A

2. Khi nào KHÔNG nên rebase?
A) Nhánh local của riêng mình B) Nhánh đã push và người khác dùng chung C) Nhánh feature mới
ĐÁPÁN:B

3. Lệnh tiếp tục sau khi sửa conflict khi rebase?
A) git merge --continue B) git rebase --continue C) git commit
ĐÁPÁN:B

## 💡 Thực hành
Tạo nhánh feature, làm 2 commit. Quay main thêm 1 commit. Rebase feature lên main. Quan sát \`git log\`.
`
  },

  // ========== API ==========
  {
    track: 'api',
    topic: 'REST API Design Principles',
    content: `# REST API Design Principles

## 🎯 Mục tiêu
Thiết kế API theo chuẩn REST: URL rõ ràng, đúng HTTP method, dễ dùng cho frontend.

## 📖 Giải thích
REST dùng **HTTP method** làm động từ (action), **URL** làm danh từ (resource):
- \`GET /users\` - lấy danh sách
- \`GET /users/123\` - lấy 1 user
- \`POST /users\` - tạo mới
- \`PUT /users/123\` - cập nhật toàn bộ
- \`PATCH /users/123\` - cập nhật 1 phần
- \`DELETE /users/123\` - xóa

URL dùng **danh từ số nhiều**, kebab-case, KHÔNG dùng động từ. Nested resource: \`/users/123/posts\` (bài viết của user 123). Filter/sort qua query: \`/products?category=phone&sort=price\`. Version trong URL: \`/api/v1/users\`.

## 💻 Ví dụ code
\`\`\`
❌ BAD:
GET  /getAllUsers
POST /createUser
POST /deleteUser/5

✅ GOOD:
GET    /api/v1/users
POST   /api/v1/users
DELETE /api/v1/users/5

✅ Filter + pagination:
GET /api/v1/products?category=phone&min_price=500&page=2&limit=20

✅ Nested resource:
GET  /api/v1/users/5/orders       — đơn của user 5
POST /api/v1/users/5/orders       — tạo đơn cho user 5
\`\`\`

## 🧠 Quiz (3 câu)
1. Lấy 1 user có id=5 đúng chuẩn REST?
A) GET /getUser?id=5 B) GET /users/5 C) POST /user/5
ĐÁPÁN:B

2. URL resource nên dùng?
A) Động từ (getUsers) B) Danh từ số nhiều (users) C) Danh từ số ít (user)
ĐÁPÁN:B

3. Method nào để cập nhật 1 phần?
A) PUT B) PATCH C) POST
ĐÁPÁN:B

## 💡 Thực hành
Thiết kế URL cho hệ thống blog: CRUD posts, CRUD comments của post, tìm kiếm post theo tag.
`
  },
  {
    track: 'api',
    topic: 'HTTP Status Codes',
    content: `# HTTP Status Codes

## 🎯 Mục tiêu
Trả status code đúng cho mỗi tình huống để client hiểu và xử lý đúng cách.

## 📖 Giải thích
Status code gồm 5 nhóm:
- **2xx — Thành công**: 200 OK (GET/PUT ok), 201 Created (POST tạo mới), 204 No Content (xóa ok, không trả body)
- **3xx — Redirect**: 301 (di chuyển vĩnh viễn), 304 (cache còn dùng được)
- **4xx — Lỗi client**: 400 Bad Request (data sai), 401 Unauthorized (chưa login), 403 Forbidden (login rồi nhưng không có quyền), 404 Not Found, 409 Conflict (vd email đã tồn tại), 422 Unprocessable (validate fail)
- **5xx — Lỗi server**: 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable

Trả đúng code giúp frontend hiển thị thông báo phù hợp, retry logic hoạt động đúng.

## 💻 Ví dụ code
\`\`\`typescript
// Next.js API route
export async function POST(req: Request) {
  const body = await req.json();

  // 400 - data không hợp lệ
  if (!body.email || !body.password) {
    return Response.json({ error: 'Thiếu email/password' }, { status: 400 });
  }

  // 409 - email đã tồn tại
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) {
    return Response.json({ error: 'Email đã dùng' }, { status: 409 });
  }

  // 201 - tạo thành công
  const user = await prisma.user.create({ data: body });
  return Response.json(user, { status: 201 });
}
\`\`\`

## 🧠 Quiz (3 câu)
1. User chưa login gọi API trả code nào?
A) 404 B) 401 C) 403
ĐÁPÁN:B

2. POST tạo thành công nên trả code?
A) 200 B) 201 C) 204
ĐÁPÁN:B

3. Email đăng ký đã tồn tại nên trả?
A) 400 B) 404 C) 409
ĐÁPÁN:C

## 💡 Thực hành
Viết API \`/api/register\` trả đúng code cho các case: thiếu field (400), email tồn tại (409), thành công (201).
`
  },
];

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  console.log(`Đang tạo bài học cho ${users.length} user, ${LESSONS.length} bài mỗi user...`);

  let total = 0;
  for (const user of users) {
    // Xóa bài cũ để tránh trùng (chỉ xóa bài seed - theo topic)
    const topics = LESSONS.map(l => l.topic);
    await prisma.lesson.deleteMany({
      where: { userId: user.id, topic: { in: topics } },
    });

    // Insert mới
    for (let i = 0; i < LESSONS.length; i++) {
      const lesson = LESSONS[i];
      await prisma.lesson.create({
        data: {
          userId: user.id,
          track: lesson.track,
          topic: lesson.topic,
          content: lesson.content,
          order: i + 1,
          completed: false,
        },
      });
      total++;
    }
    console.log(`✓ ${user.name} (id=${user.id}): ${LESSONS.length} bài`);
  }

  console.log(`\n🎉 Tổng ${total} bài đã được tạo.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
