import React, { useState, useMemo } from "react";
import { 
    BookOpen, Search, ArrowLeft, Calendar, Clock, 
    Share2, Sparkles, Heart, 
    ChevronRight, Brain 
} from "lucide-react";

// Mock AI Blog articles with rich content in Vietnamese
const ARTICLES = [
    {
        id: 5,
        title: "HAgent: Nền tảng trợ lý AI cá nhân & Tự động hóa quy trình công việc thế hệ mới",
        description: "Giới thiệu HAgent - trợ lý AI đa năng chạy trực tiếp trên máy của bạn, kết hợp khả năng lập trình, quản lý hệ thống, tự động hóa cron job và theo dõi tài chính thông minh.",
        category: "Ứng dụng AI",
        readTime: "4 phút đọc",
        date: "2026-06-12",
        image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
        likes: 312,
        comments: 45,
        pinned: true,
        author: {
            name: "Nguyễn Hồng Hạt",
            avatar: "https://ui-avatars.com/api/?name=Hong+Hat&background=3b82f6&color=fff&size=96",
            title: "Makers & Tech Architect"
        },
        content: `
            <h2>HAgent là gì?</h2>
            <p><strong>HAgent</strong> là một hệ sinh thái AI Agent cá nhân (Personal AI Agent Ecosystem) được thiết kế đặc biệt để giúp lập trình viên và người dùng nâng cao năng suất làm việc hàng ngày. Không chỉ dừng lại ở một chatbot thông thường, HAgent sở hữu hệ thống tools mạnh mẽ cho phép tương tác trực tiếp với hệ điều hành dưới sự kiểm soát an toàn của bạn.</p>

            <h2>Các tính năng cốt lõi làm nên sức mạnh của HAgent</h2>
            <ul>
                <li><strong>Omni Chat đa nhân vật:</strong> Hỗ trợ tích hợp và chuyển đổi mượt mà giữa các mô hình ngôn ngữ lớn hàng đầu thế giới (Google Gemini, DeepSeek-R1, GPT-4o) để phục vụ các mục đích khác nhau từ code, dịch thuật đến viết lách.</li>
                <li><strong>Trợ lý lập trình thực chiến:</strong> Tích hợp sâu với terminal và trình soạn thảo file. HAgent có khả năng hiểu codebase hiện tại của bạn, tự động sửa lỗi code, chạy unit test và thực thi các câu lệnh terminal sau khi nhận được sự đồng ý của bạn.</li>
                <li><strong>Tự động hóa thông minh (Automation Hub):</strong> Thiết lập các tác vụ định kỳ (Cron Jobs), quản lý Docker, tự động hóa quy trình sao lưu dữ liệu (Backup) và đồng bộ tệp tin đám mây.</li>
                <li><strong>Quản lý tài chính cá nhân:</strong> Phân hệ theo dõi chi tiêu chi tiết (Expense Tracker), thống kê số dư ngân hàng (Account Balance) giúp bạn nắm bắt dòng tiền một cách nhanh chóng và bảo mật nhất.</li>
            </ul>

            <div class="highlight-box bg-indigo-50 border-l-4 border-indigo-500 p-4 my-6 rounded-r-xl">
                <p class="font-bold text-slate-800">Cam kết bảo mật & Quyền riêng tư:</p>
                <p class="text-sm text-slate-600">Mọi dữ liệu cá nhân, nhật ký trò chuyện, thông tin tài chính đều được lưu trữ hoàn toàn trên máy cục bộ của bạn hoặc đồng bộ hóa mã hóa bảo mật đến tài khoản đám mây cá nhân (Google Drive), tuyệt đối không chia sẻ cho bên thứ ba.</p>
            </div>

            <h2>Tầm nhìn tương lai</h2>
            <p>HAgent hướng tới việc trở thành một "AI OS" - một hệ điều hành mini chạy bằng AI, nơi các agent phối hợp nhịp nhàng để giải quyết các luồng công việc phức tạp thay thế con người. Hãy cùng tham gia trải nghiệm và xây dựng tương lai năng suất vượt trội cùng HAgent!</p>
        `
    },
    {
        id: 1,
        title: "Gemini 1.5 Pro: Kỷ nguyên mới với Ngữ cảnh siêu rộng 2 Triệu Tokens",
        description: "Google công bố mô hình Gemini 1.5 Pro với khả năng xử lý ngữ cảnh lên tới 2 triệu tokens, mở ra cuộc cách mạng trong phân tích mã nguồn và tài liệu lớn.",
        category: "Mô hình ngôn ngữ",
        readTime: "6 phút đọc",
        date: "2026-06-10",
        image: "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&q=80&w=800",
        likes: 142,
        comments: 28,
        author: {
            name: "Hạt AI Team",
            avatar: "https://ui-avatars.com/api/?name=Hat+AI&background=6366f1&color=fff&size=96",
            title: "AI Research Lead"
        },
        content: `
            <h2>Cuộc cách mạng Context Window</h2>
            <p>Trong các mô hình ngôn ngữ lớn (LLM), cửa sổ ngữ cảnh (Context Window) quyết định lượng thông tin mà mô hình có thể tiếp nhận và ghi nhớ trong một phiên làm việc. Với bước nhảy vọt lên 2 triệu tokens, Gemini 1.5 Pro có thể xử lý đồng thời:</p>
            <ul>
                <li>Hơn 1.5 triệu từ văn bản.</li>
                <li>Toàn bộ cơ sở mã nguồn (codebase) gồm hàng chục nghìn dòng lệnh.</li>
                <li>Nhiều giờ video chất lượng cao hoặc các file âm thanh dài.</li>
            </ul>

            <div class="highlight-box bg-slate-50 border-l-4 border-indigo-500 p-4 my-6 rounded-r-xl">
                <p class="font-bold text-slate-800">Thử nghiệm "Kim trong đống cỏ khô" (Needle In A Haystack):</p>
                <p class="text-sm text-slate-600">Google đã chứng minh Gemini 1.5 Pro có thể tìm thấy một dòng code hoặc thông tin cụ thể được ẩn sâu bên trong tài liệu dài hàng triệu từ với độ chính xác đạt tới 99.7%.</p>
            </div>

            <h2>Ứng dụng thực tế trong lập trình và phân tích</h2>
            <p>Khả năng này thay đổi hoàn toàn cách chúng ta phát triển phần mềm. Thay vì phải chia nhỏ dự án để đưa vào context của AI, nhà phát triển có thể tải toàn bộ repo dự án lên và yêu cầu Gemini giải thích luồng hoạt động, tìm lỗi bảo mật hoặc viết unit test trên diện rộng.</p>
            <p>Đối với phân tích dữ liệu, Gemini 1.5 Pro có thể đọc hàng trăm bản báo cáo tài chính dày đặc, so sánh các số liệu qua từng năm và đưa ra dự báo chỉ trong vài giây mà không bị mất mát thông tin.</p>
        `
    },
    {
        id: 2,
        title: "DeepSeek-R1: Mô hình suy luận nguồn mở thách thức các gã khổng lồ",
        description: "Sự trỗi dậy của DeepSeek-R1 từ Trung Quốc với phương pháp Học tăng cường (Reinforcement Learning) đã làm thay đổi bản đồ AI toàn cầu nhờ hiệu năng vượt trội và chi phí cực thấp.",
        category: "Suy luận AI",
        readTime: "8 phút đọc",
        date: "2026-06-08",
        image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=800",
        likes: 289,
        comments: 54,
        author: {
            name: "Nguyễn Hồng Hạt",
            avatar: "https://ui-avatars.com/api/?name=Hong+Hat&background=3b82f6&color=fff&size=96",
            title: "Makers & Tech Architect"
        },
        content: `
            <h2>Reinforcement Learning (Học tăng cường) làm nên sự khác biệt</h2>
            <p>Khác với các mô hình truyền thống chủ yếu tối ưu hóa thông qua học có giám sát (Supervised Fine-Tuning), DeepSeek-R1 áp dụng cơ chế suy luận tự động qua học tăng cường (RL). Mô hình tự suy nghĩ, lập luận, kiểm tra chéo các bước giải quyết vấn đề trước khi đưa ra câu trả lời cuối cùng.</p>
            
            <blockquote>
                "DeepSeek-R1 không chỉ trả lời nhanh, nó tạo ra một 'Chuỗi suy nghĩ' (Chain of Thought) nội bộ để phân tích vấn đề đa chiều như cách con người tư duy lập luận toán học và logic."
            </blockquote>

            <h2>Chi phí siêu rẻ - Hiệu quả cực cao</h2>
            <p>Một trong những điểm gây sốc nhất cho cộng đồng công nghệ là chi phí huấn luyện của DeepSeek chỉ bằng một phần nhỏ so với các đối thủ từ Mỹ. Bằng cách tối ưu cấu trúc Mixture-of-Experts (MoE) và thuật toán phân bổ bộ nhớ hiệu quả, DeepSeek-R1 chứng minh rằng không cần phần cứng siêu máy tính nghìn tỷ đô vẫn có thể tạo ra trí tuệ nhân tạo hàng đầu thế giới.</p>

            <h2>Tác động đến cộng đồng nguồn mở</h2>
            <p>Việc DeepSeek công bố mở mã nguồn (open-source) trọng số mô hình đã thúc đẩy hàng ngàn dự án cá nhân và doanh nghiệp tự phát triển trợ lý suy luận riêng tư, giảm sự phụ thuộc vào các API đóng đắt đỏ.</p>
        `
    },
    {
        id: 3,
        title: "Lập trình tương lai với Agentic Workflows (Quy trình Agent)",
        description: "Tại sao các chatbot AI thông thường đang nhường chỗ cho hệ thống Multi-Agent có khả năng tự lập kế hoạch, sử dụng công cụ và hợp tác giải quyết tác vụ phức tạp.",
        category: "Ứng dụng AI",
        readTime: "5 phút đọc",
        date: "2026-06-05",
        image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
        likes: 95,
        comments: 12,
        author: {
            name: "Hạt AI Team",
            avatar: "https://ui-avatars.com/api/?name=Hat+AI&background=6366f1&color=fff&size=96",
            title: "Workflow Automation Dev"
        },
        content: `
            <h2>Chatbot thông thường vs Agentic Workflow</h2>
            <p>Khi sử dụng ChatGPT hay Gemini dạng chat trực tiếp, mô hình sẽ trả lời ngay lập tức (Zero-shot). Tuy nhiên đối với các công việc phức tạp như viết một cuốn sách hay debug hệ thống lớn, cách tiếp cận này dễ gặp lỗi và ảo tưởng (hallucination).</p>
            <p><strong>Agentic Workflows</strong> chia nhỏ tác vụ và chạy theo một vòng lặp khép kín:</p>
            <ol>
                <li><strong>Lập kế hoạch (Planning):</strong> Agent phân tích đề bài và chia nhỏ thành các bước.</li>
                <li><strong>Sử dụng công cụ (Tool Use):</strong> Agent gọi các API, chạy code terminal, đọc ghi file hoặc tìm kiếm web để thu thập thông tin chính xác.</li>
                <li><strong>Phản hồi và Sửa lỗi (Reflection/Self-Correction):</strong> Một Agent khác hoặc chính nó sẽ rà soát lại kết quả, chạy thử nghiệm và tự động sửa nếu có lỗi.</li>
            </ol>

            <h2>Hệ thống Multi-Agent: Hợp tác như một nhóm chuyên gia</h2>
            <p>Trong một quy trình tự động hóa nâng cao, nhiều Agent với các vai trò khác nhau (ví dụ: Product Manager Agent, Coder Agent, Tester Agent) sẽ trò chuyện và phối hợp với nhau để xây dựng một sản phẩm hoàn chỉnh mà không cần sự can thiệp liên tục của con người.</p>
        `
    },
    {
        id: 4,
        title: "Hướng dẫn thực chiến Prompt Engineering dành cho lập trình viên",
        description: "Tổng hợp các kỹ thuật thiết kế prompt nâng cao như Few-shot, Chain-of-Thought và ReAct để tăng cường độ chính xác của LLM lên gấp nhiều lần.",
        category: "Hướng dẫn",
        readTime: "7 phút đọc",
        date: "2026-05-28",
        image: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=800",
        likes: 178,
        comments: 31,
        author: {
            name: "Nguyễn Hồng Hạt",
            avatar: "https://ui-avatars.com/api/?name=Hong+Hat&background=3b82f6&color=fff&size=96",
            title: "Makers & Tech Architect"
        },
        content: `
            <h2>1. Few-shot Prompting: Dạy AI bằng ví dụ</h2>
            <p>Đừng chỉ yêu cầu AI thực hiện một việc mơ hồ. Hãy cung cấp cho nó 2-3 ví dụ mẫu về định dạng đầu vào và kết quả mong muốn đầu ra. Kỹ thuật này giúp mô hình hiểu rõ cấu trúc dữ liệu cần phản hồi mà không cần huấn luyện lại.</p>

            <h2>2. Chain-of-Thought (Chuỗi tư duy)</h2>
            <p>Thêm câu lệnh đơn giản như <em>"Hãy suy nghĩ từng bước một"</em> (Let's think step by step) sẽ kích hoạt khả năng phân tích logic. AI sẽ đưa ra các bước lập luận trung gian trước khi đưa ra kết luận cuối cùng, hạn chế tối đa các lỗi tính toán toán học đơn giản.</p>

            <h2>3. ReAct Pattern (Reasoning and Acting)</h2>
            <p>Đây là cấu trúc nền tảng của các Agent hiện đại. Prompt được thiết kế để yêu cầu AI luân phiên thực hiện <strong>Suy nghĩ (Thought)</strong> -> <strong>Hành động (Action)</strong> -> <strong>Quan sát (Observation)</strong>. Bằng cách này, AI có thể quyết định khi nào cần tìm kiếm Google, khi nào cần đọc tài liệu và phản hồi dựa trên kết quả thực tế.</p>
        `
    }
];

const CATEGORIES = ["Tất cả", "Mô hình ngôn ngữ", "Suy luận AI", "Ứng dụng AI", "Hướng dẫn"];

export default function BlogHub({ user, token }) {
    const [selectedPostId, setSelectedPostId] = useState(null);
    const [activeCategory, setActiveCategory] = useState("Tất cả");
    const [searchQuery, setSearchQuery] = useState("");
    const [likedPosts, setLikedPosts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("hagent_blog_likes") || "[]");
        } catch {
            return [];
        }
    });

    const currentPost = useMemo(() => {
        return ARTICLES.find(post => post.id === selectedPostId);
    }, [selectedPostId]);

    const filteredArticles = useMemo(() => {
        const filtered = ARTICLES.filter(post => {
            const matchesCategory = activeCategory === "Tất cả" || post.category === activeCategory;
            const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  post.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
        return [...filtered].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.date) - new Date(a.date);
        });
    }, [activeCategory, searchQuery]);

    const handleLike = (id, e) => {
        e.stopPropagation();
        let nextLikes;
        if (likedPosts.includes(id)) {
            nextLikes = likedPosts.filter(x => x !== id);
        } else {
            nextLikes = [...likedPosts, id];
        }
        setLikedPosts(nextLikes);
        localStorage.setItem("hagent_blog_likes", JSON.stringify(nextLikes));
    };

    const handleShare = (post, e) => {
        e.stopPropagation();
        if (navigator.share) {
            navigator.share({
                title: post.title,
                text: post.description,
                url: window.location.href
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(`${post.title} - ${post.description}`).then(() => {
                alert("Đã sao chép tiêu đề bài viết vào clipboard!");
            });
        }
    };

    if (currentPost) {
        // Detailed View
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
                <div className="max-w-3xl mx-auto">
                    {/* Back Button */}
                    <button
                        onClick={() => setSelectedPostId(null)}
                        className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold mb-6 transition-all group cursor-pointer"
                    >
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        <span>Quay lại danh sách</span>
                    </button>

                    <article className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        {/* Cover Image */}
                        <div className="w-full h-64 sm:h-80 md:h-96 relative overflow-hidden bg-slate-200">
                            <img
                                src={currentPost.image}
                                alt={currentPost.title}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                            <span className="absolute bottom-6 left-6 inline-block bg-indigo-600 text-white px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider">
                                {currentPost.category}
                            </span>
                            {currentPost.pinned && (
                                <span className="absolute bottom-6 right-6 inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider shadow-md">
                                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                                    Đã ghim
                                </span>
                            )}
                        </div>

                        {/* Article Info */}
                        <div className="p-6 sm:p-8 md:p-10">
                            <header className="mb-6 pb-6 border-b border-slate-100">
                                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 leading-tight mb-4">
                                    {currentPost.title}
                                </h1>

                                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={14} className="text-slate-400" />
                                        <span>
                                            {new Date(currentPost.date).toLocaleDateString("vi-VN", {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "numeric",
                                            })}
                                        </span>
                                    </div>
                                    <span>•</span>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={14} className="text-slate-400" />
                                        <span>{currentPost.readTime}</span>
                                    </div>
                                </div>
                            </header>

                            {/* Main Text Content */}
                            <div 
                                className="prose max-w-none text-slate-700 text-sm sm:text-base leading-relaxed
                                    [&_h2]:text-lg sm:[&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-800 [&_h2]:mt-6 [&_h2]:mb-3
                                    [&_p]:mb-4 [&_p]:text-justify
                                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul_li]:mb-1
                                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_ol_li]:mb-1
                                    [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:my-4
                                    [&_strong]:font-extrabold [&_strong]:text-slate-800"
                                dangerouslySetInnerHTML={{ __html: currentPost.content }}
                            />

                            {/* Author Box */}
                            <div className="mt-8 pt-8 border-t border-slate-100">
                                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                                    <img
                                        src={currentPost.author.avatar}
                                        alt={currentPost.author.name}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                                    />
                                    <div>
                                        <p className="text-sm font-black text-slate-800">{currentPost.author.name}</p>
                                        <p className="text-xs text-slate-400 font-bold mt-0.5">{currentPost.author.title}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </article>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-6 px-4 sm:px-6 lg:px-8 animate-fade-in">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Hero / Welcome Banner */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-850 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="space-y-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                                <Sparkles size={11} /> Góc kiến thức
                            </span>
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-tight">
                                H-Agent AI Blog
                            </h1>
                            <p className="text-xs sm:text-sm text-indigo-200/90 font-medium max-w-xl">
                                Cập nhật các xu hướng, kỹ thuật lập trình và nghiên cứu công nghệ mới nhất về Trí tuệ nhân tạo.
                            </p>
                        </div>
                        <div className="hidden md:flex p-3 bg-white/5 rounded-2xl border border-white/10 shrink-0">
                            <Brain size={44} className="text-indigo-300" />
                        </div>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    {/* Search Input */}
                    <div className="relative w-full sm:max-w-xs">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Tìm bài viết..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 text-xs font-semibold border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/50 hover:border-slate-300 focus:ring-4 focus:ring-indigo-500/5 transition-all"
                        />
                    </div>

                    {/* Category Scroll */}
                    <div className="flex p-0.5 bg-slate-200/60 rounded-xl select-none overflow-x-auto no-scrollbar gap-0.5 shrink-0 max-w-full">
                        {CATEGORIES.map(category => {
                            const isActive = activeCategory === category;
                            return (
                                <button
                                    key={category}
                                    onClick={() => setActiveCategory(category)}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 select-none cursor-pointer whitespace-nowrap ${
                                        isActive ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
                                    }`}
                                >
                                    {category}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Articles Grid */}
                {filteredArticles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 border border-dashed border-slate-200 rounded-3xl bg-white/50">
                        <BookOpen size={32} className="opacity-20 text-slate-600" />
                        <p className="text-xs font-bold">Không tìm thấy bài viết nào phù hợp.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredArticles.map(post => {
                            const isLiked = likedPosts.includes(post.id);
                            return (
                                <div
                                    key={post.id}
                                    onClick={() => setSelectedPostId(post.id)}
                                    className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-md hover:border-slate-200 transition-all duration-300 cursor-pointer flex flex-col justify-between group animate-scale-up"
                                >
                                    {/* Cover Image & Category */}
                                    <div className="h-48 w-full overflow-hidden relative bg-slate-100">
                                        <img
                                            src={post.image}
                                            alt={post.title}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                        <span className="absolute top-4 left-4 inline-block bg-white/90 backdrop-blur text-indigo-600 border border-slate-100 px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider">
                                            {post.category}
                                        </span>
                                        {post.pinned && (
                                            <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 bg-amber-500 text-white px-2.5 py-1 rounded-full font-bold text-[9px] uppercase tracking-wider shadow-sm z-10">
                                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                                                Ghim
                                            </span>
                                        )}
                                    </div>

                                    {/* Content Info */}
                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={12} />
                                                    {new Date(post.date).toLocaleDateString("vi-VN", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "numeric"
                                                    })}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {post.readTime}
                                                </span>
                                            </div>
                                            <h2 className="text-base font-black text-slate-800 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                                                {post.title}
                                            </h2>
                                            <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                                                {post.description}
                                            </p>
                                        </div>

                                        {/* Footer Actions */}
                                        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-50 flex-shrink-0">
                                            {/* Author */}
                                            <div className="flex items-center gap-2">
                                                <img
                                                    src={post.author.avatar}
                                                    alt={post.author.name}
                                                    className="w-7 h-7 rounded-full object-cover border border-white shadow-sm"
                                                />
                                                <span className="text-[10px] font-black text-slate-700">{post.author.name}</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => handleLike(post.id, e)}
                                                    className={`p-1.5 rounded-lg border transition ${
                                                        isLiked 
                                                            ? "bg-rose-50 border-rose-100 text-rose-500" 
                                                            : "bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-700"
                                                    }`}
                                                >
                                                    <Heart size={13} className={isLiked ? "fill-rose-500" : ""} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleShare(post, e)}
                                                    className="p-1.5 rounded-lg border bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-700 transition"
                                                >
                                                    <Share2 size={13} />
                                                </button>
                                                <button className="flex items-center gap-1 pl-2.5 pr-2 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
                                                    <span>Đọc bài</span>
                                                    <ChevronRight size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
