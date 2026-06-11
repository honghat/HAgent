import React, { useState, useMemo, useEffect } from "react";
import {
    BookOpen, Search, ArrowLeft, Calendar, Clock,
    Share2, Sparkles, Heart,
    ChevronRight, Brain
} from "lucide-react";
import logo from "../assets/logo.png";

const CATEGORIES = ["Tất cả", "Mô hình ngôn ngữ", "Suy luận AI", "Ứng dụng AI", "Hướng dẫn"];

export default function BlogHub({ user, token, onViewChange }) {
    const isGuest = !user;
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
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

    // Fetch posts from database API
    useEffect(() => {
        setLoading(true);
        fetch("/api/blog/posts")
            .then(r => {
                if (!r.ok) throw new Error("Failed to fetch blog posts");
                return r.json();
            })
            .then(data => {
                const formatted = data.map(post => ({
                    ...post,
                    readTime: post.read_time,
                    author: {
                        name: post.author_name || "Nguyễn Hồng Hạt",
                        avatar: post.author_avatar || "https://ui-avatars.com/api/?name=Hong+Hat&background=3b82f6&color=fff&size=96",
                        title: post.author_title || "Vibe Coder"
                    }
                }));
                setPosts(formatted);
            })
            .catch(err => {
                console.error("Error fetching blog posts:", err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const activePostId = isGuest 
        ? (posts.find(p => p.pinned)?.id || posts[0]?.id) 
        : selectedPostId;

    const currentPost = useMemo(() => {
        return posts.find(post => post.id === activePostId);
    }, [posts, activePostId]);

    const filteredArticles = useMemo(() => {
        const filtered = posts.filter(post => {
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
    }, [posts, activeCategory, searchQuery]);

    const handleLike = (id, e) => {
        e.stopPropagation();
        if (likedPosts.includes(id)) return; // Already liked

        fetch(`/api/blog/posts/${id}/like`, { method: "POST" })
            .then(r => {
                if (!r.ok) throw new Error("Failed to like post");
                return r.json();
            })
            .then(data => {
                setPosts(prev => prev.map(p => p.id === id ? { ...p, likes: data.likes } : p));
                const nextLiked = [...likedPosts, id];
                setLikedPosts(nextLiked);
                localStorage.setItem("hagent_blog_likes", JSON.stringify(nextLiked));
            })
            .catch(err => {
                console.error("Error liking post:", err);
            });
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

    if (loading) {
        return (
            <div className={`h-full flex items-center justify-center ${isGuest ? "bg-white" : "bg-slate-50/50"}`}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-semibold text-slate-500">
                        {isGuest ? "Đang tải trang giới thiệu..." : "Đang tải bài viết..."}
                    </span>
                </div>
            </div>
        );
    }

    if (isGuest) {
        return (
            <div className="h-full overflow-y-auto bg-white min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in relative">
                <div className="max-w-4xl mx-auto">
                    {/* Guest Sticky Header */}
                    <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                            <img src={logo} alt="HAgent" className="w-9 h-9 rounded-xl shadow-sm object-cover" />
                            <span className="font-extrabold text-slate-800 text-base tracking-tight">HAgent</span>
                        </div>

                        <button
                            onClick={() => onViewChange('login')}
                            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" /></svg>
                            <span>Đăng nhập</span>
                        </button>
                    </div>

                    <article className="bg-white rounded-3xl p-2 sm:p-6">
                        {/* Logo Hero + Title */}
                        <div className="flex flex-col items-center text-center mb-10">
                            <img src={logo} alt="HAgent" className="w-20 h-20 rounded-2xl shadow-md mb-5" />
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider mb-3">
                                <Sparkles size={11} /> Giới thiệu
                            </span>
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 leading-tight max-w-2xl">
                                {currentPost?.title}
                            </h1>
                            {currentPost && (
                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 mt-4">
                                    <span className="flex items-center gap-1.5">
                                        <Calendar size={13} />
                                        {new Date(currentPost.date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1.5"><Clock size={13} />{currentPost.readTime}</span>
                                </div>
                            )}
                        </div>

                        <div
                            className="prose max-w-none text-slate-700 text-sm sm:text-base leading-relaxed
                                [&_h2]:text-xl sm:[&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-800 [&_h2]:mt-8 [&_h2]:mb-4
                                [&_h3]:text-lg sm:[&_h3]:text-xl [&_h3]:font-black [&_h3]:text-slate-800 [&_h3]:mt-6 [&_h3]:mb-3
                                [&_p]:mb-4 [&_p]:text-justify [&_p]:leading-relaxed
                                [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul_li]:mb-1.5
                                [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol_li]:mb-1.5
                                [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:my-6 [&_blockquote]:bg-slate-50 [&_blockquote]:py-2 [&_blockquote]:pr-4 [&_blockquote]:rounded-r-lg
                                [&_strong]:font-extrabold [&_strong]:text-slate-900"
                            dangerouslySetInnerHTML={{ __html: currentPost?.content }}
                        />

                        {/* CTA */}
                        <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col items-center text-center gap-3">
                            <p className="text-sm font-bold text-slate-700">Sẵn sàng trải nghiệm HAgent?</p>
                            <button
                                onClick={() => onViewChange('login')}
                                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-sm hover:shadow transition-all cursor-pointer"
                            >
                                <span>Đăng nhập để bắt đầu</span>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </article>
                </div>
            </div>
        );
    }

    if (currentPost) {
        // Detailed View for Logged-In User
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in relative">
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
                                    [&_h3]:text-base sm:[&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-800 [&_h3]:mt-4 [&_h3]:mb-2
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
                                        src={currentPost.author?.avatar}
                                        alt={currentPost.author?.name}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                                    />
                                    <div>
                                        <p className="text-sm font-black text-slate-800">{currentPost.author?.name}</p>
                                        <p className="text-xs text-slate-400 font-bold mt-0.5">{currentPost.author?.title}</p>
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
                                                    src={post.author?.avatar}
                                                    alt={post.author?.name}
                                                    className="w-7 h-7 rounded-full object-cover border border-white shadow-sm"
                                                />
                                                <span className="text-[10px] font-black text-slate-700">{post.author?.name}</span>
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
