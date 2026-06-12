import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
    Newspaper, Search, ArrowLeft, Calendar, Clock,
    Share2, Sparkles, Heart,
    ChevronRight, Brain, Plus, Pencil, Trash2
} from "lucide-react";
import logo from "../assets/logo.png";
import { isAdmin } from "../lib/permissions.js";
import { Modal, Field, inputCls, btn, ErrorNote } from "./admin/ui.jsx";
import { createBlogPost, updateBlogPost, deleteBlogPost } from "../api.js";

const CATEGORIES = ["Tất cả", "Mô hình ngôn ngữ", "Suy luận AI", "Ứng dụng AI", "Hướng dẫn"];

// Form thêm/sửa bài viết — chỉ dành cho admin.
function BlogEditor({ initial, token, onClose, onSaved }) {
    const isCreate = !initial;
    const [f, setF] = useState(() => ({
        title: initial?.title || "",
        category: initial?.category || "Ứng dụng AI",
        description: initial?.description || "",
        image: initial?.image || "",
        read_time: initial?.read_time || initial?.readTime || "",
        date: initial?.date || "",
        author_title: initial?.author_title || initial?.author?.title || "",
        pinned: !!initial?.pinned,
        content: initial?.content || "",
    }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));

    async function submit() {
        if (!f.title.trim()) { setErr("Tiêu đề không được để trống"); return; }
        setErr(""); setBusy(true);
        try {
            if (isCreate) await createBlogPost(f, token);
            else await updateBlogPost(initial.id, f, token);
            await onSaved();
            onClose();
        } catch (e) {
            setErr(e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            wide
            title={isCreate ? "Viết bài mới" : `Sửa: ${initial.title}`}
            onClose={onClose}
            footer={<>
                <button className={btn("ghost")} onClick={onClose}>Huỷ</button>
                <button className={btn("primary")} onClick={submit} disabled={busy}>{busy ? "Đang lưu..." : "Lưu"}</button>
            </>}
        >
            <ErrorNote>{err}</ErrorNote>
            <Field label="Tiêu đề"><input className={inputCls} value={f.title} onChange={set("title")} /></Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Danh mục">
                    <select className={inputCls} value={f.category} onChange={set("category")}>
                        {CATEGORIES.filter(c => c !== "Tất cả").map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </Field>
                <Field label="Thời gian đọc"><input className={inputCls} placeholder="Tự động nếu để trống" value={f.read_time} onChange={set("read_time")} /></Field>
            </div>
            <Field label="Mô tả ngắn"><textarea className={inputCls} rows={2} value={f.description} onChange={set("description")} /></Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Ngày đăng"><input className={inputCls} placeholder="YYYY-MM-DD (mặc định hôm nay)" value={f.date} onChange={set("date")} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
                <Field label="Chức danh tác giả"><input className={inputCls} placeholder="Vibe Coder" value={f.author_title} onChange={set("author_title")} /></Field>
                <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={f.pinned} onChange={(e) => setF(s => ({ ...s, pinned: e.target.checked }))} className="w-4 h-4 rounded accent-indigo-600" />
                    Ghim lên trang chủ
                </label>
            </div>
            <Field label="Nội dung (HTML)">
                <textarea className={`${inputCls} font-mono text-[12px] leading-relaxed`} rows={12} value={f.content} onChange={set("content")} placeholder="<h2>Tiêu đề mục</h2><p>Nội dung đoạn văn...</p>" />
            </Field>
        </Modal>
    );
}

export default function BlogHub({ user, token, onViewChange }) {
    const isGuest = !user;
    const admin = isAdmin(user);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPostId, setSelectedPostId] = useState(null);
    const [activeCategory, setActiveCategory] = useState("Tất cả");
    const [searchQuery, setSearchQuery] = useState("");
    const [editor, setEditor] = useState(null);      // null | { post: postOrNull }
    const [deleting, setDeleting] = useState(false);
    const [likedPosts, setLikedPosts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("hagent_blog_likes") || "[]");
        } catch {
            return [];
        }
    });

    // Fetch posts from database API. silent=true: làm mới không hiện spinner toàn trang.
    const loadPosts = useCallback((silent = false) => {
        if (!silent) setLoading(true);
        return fetch("/api/blog/posts")
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
                if (!silent) setLoading(false);
            });
    }, []);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    async function handleDeleteDirect(post) {
        if (!post) return;
        setDeleting(true);
        try {
            await deleteBlogPost(post.id, token);
            if (selectedPostId === post.id) {
                setSelectedPostId(null);
            }
            await loadPosts(true);
        } catch (e) {
            alert("Lỗi khi xoá bài viết: " + e.message);
        } finally {
            setDeleting(false);
        }
    }

    const adminModals = admin ? (
        <>
            {editor && (
                <BlogEditor
                    initial={editor.post}
                    token={token}
                    onClose={() => setEditor(null)}
                    onSaved={() => loadPosts(true)}
                />
            )}
        </>
    ) : null;

    const activePostId = !admin
        ? (selectedPostId || (posts.length === 1 ? posts[0]?.id : null))
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

    if (!admin && activePostId) {
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in relative">
                <div className="max-w-3xl mx-auto">
                    {/* Guest Sticky Header */}
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                        {posts.length > 1 ? (
                            <button
                                onClick={() => setSelectedPostId(null)}
                                className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold transition-all group cursor-pointer"
                            >
                                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                                <span>Quay lại danh sách</span>
                            </button>
                        ) : (
                            <div />
                        )}
                        {!user && (
                            <button
                                onClick={() => onViewChange('login')}
                                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" /></svg>
                                <span>Đăng nhập</span>
                            </button>
                        )}
                    </div>

                    <article className="bg-white rounded-3xl p-2 sm:p-6">
                        {/* Logo Hero + Title */}
                        <div className="flex flex-col items-center text-center mb-10">
                            <img src={logo} alt="HAgent" className="w-20 h-20 rounded-2xl shadow-md mb-5" />
                            <div className="flex flex-wrap gap-2 justify-center mb-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider">
                                    <Sparkles size={11} /> {currentPost?.category}
                                </span>
                                {currentPost?.pinned && (
                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm">
                                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                                        Đã ghim
                                    </span>
                                )}
                            </div>
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

    if (!admin && !activePostId) {
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in relative">
                <div className="max-w-5xl mx-auto">
                    {/* Guest Sticky Header */}
                    <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-200">
                        <div className="flex items-center gap-2.5">
                            <img src={logo} alt="HAgent" className="w-9 h-9 rounded-xl shadow-sm object-cover" />
                            <span className="font-extrabold text-slate-800 text-base tracking-tight">HAgent Blog</span>
                        </div>

                        {!user && (
                            <button
                                onClick={() => onViewChange('login')}
                                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" /></svg>
                                <span>Đăng nhập</span>
                            </button>
                        )}
                    </div>

                    {/* Category Filter */}
                    <div className="flex flex-wrap gap-2 mb-8 justify-center sm:justify-start">
                        {CATEGORIES.filter(cat => cat !== "Tất cả").map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(prev => prev === cat ? "Tất cả" : cat)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                    activeCategory === cat
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Cards Grid */}
                    {filteredArticles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 border border-dashed border-slate-200 rounded-3xl bg-white/50">
                            <Newspaper size={32} className="opacity-20 text-slate-600" />
                            <p className="text-xs font-bold">Không tìm thấy bài viết nào.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredArticles.map(post => (
                                <div
                                    key={post.id}
                                    onClick={() => setSelectedPostId(post.id)}
                                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md hover:border-indigo-100 transition-all duration-300 flex flex-col justify-between cursor-pointer group hover:-translate-y-1 animate-fade-in"
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="inline-block bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider">
                                                {post.category}
                                            </span>
                                            {post.pinned && (
                                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider shadow-sm">
                                                    Ghim
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-black text-slate-800 text-base leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2">
                                            {post.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                                            {post.description}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-[11px] font-semibold text-slate-400">
                                        <span>
                                            {new Date(post.date).toLocaleDateString("vi-VN", {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "numeric"
                                            })}
                                        </span>
                                        <span>{post.readTime}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (currentPost) {
        // Detailed View for Logged-In User
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50 min-h-0 py-8 px-4 sm:px-6 lg:px-8 animate-fade-in relative">
                <div className="max-w-3xl mx-auto">
                    {/* Top Bar: Back + Admin actions */}
                    <div className="flex items-center justify-between mb-6 gap-3">
                        <button
                            onClick={() => setSelectedPostId(null)}
                            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold transition-all group cursor-pointer"
                        >
                            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                            <span>Quay lại danh sách</span>
                        </button>
                        {admin && (
                            <div className="flex items-center gap-2">
                                <button className={btn("soft")} onClick={() => setEditor({ post: currentPost })}>
                                    <Pencil size={13} /> Sửa
                                </button>
                                <button className={btn("danger")} onClick={() => handleDeleteDirect(currentPost)} disabled={deleting}>
                                    <Trash2 size={13} /> {deleting ? "Đang xoá..." : "Xoá"}
                                </button>
                            </div>
                        )}
                    </div>

                    <article className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        {/* Article Info */}
                        <div className="p-6 sm:p-8 md:p-10">
                            <header className="mb-6 pb-6 border-b border-slate-100">
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <span className="inline-block bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider">
                                        {currentPost.category}
                                    </span>
                                    {currentPost.pinned && (
                                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm">
                                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                                            Đã ghim
                                        </span>
                                    )}
                                </div>
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
                {adminModals}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Control Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-gray-200">
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[12px] text-gray-400 font-semibold">{filteredArticles.length} bài viết</p>
                    
                    {/* Search */}
                    <div className="relative w-full sm:w-48">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Tìm bài viết..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-8 pl-8 pr-2.5 text-[11px] font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/50 hover:border-gray-300 transition-all"
                        />
                    </div>
                </div>

                {admin && (
                    <button
                        onClick={() => setEditor({ post: null })}
                        className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer shrink-0"
                    >
                        <Plus size={14} /> Viết bài mới
                    </button>
                )}
            </div>

            {/* Articles Table */}
            {filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 border border-dashed border-slate-200 rounded-3xl bg-white/50">
                    <Newspaper size={32} className="opacity-20 text-slate-600" />
                    <p className="text-xs font-bold">Không tìm thấy bài viết nào.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-left text-[12px]">
                        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                            <tr>
                                <th className="px-3 py-2.5 font-semibold">Bài viết</th>
                                <th className="px-3 py-2.5 font-semibold">Danh mục</th>
                                <th className="px-3 py-2.5 font-semibold">Thời gian đọc</th>
                                <th className="px-3 py-2.5 font-semibold">Ngày đăng</th>
                                <th className="px-3 py-2.5 font-semibold">Ghim</th>
                                <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredArticles.map(post => (
                                <tr key={post.id} className="hover:bg-gray-50/60">
                                    <td className="px-3 py-2.5 max-w-sm sm:max-w-md">
                                        <div className="min-w-0">
                                            <p 
                                                className="truncate font-semibold text-gray-900 hover:text-indigo-600 cursor-pointer transition-colors"
                                                onClick={() => setSelectedPostId(post.id)}
                                            >
                                                {post.title}
                                            </p>
                                            <p className="truncate text-[11px] text-gray-400">{post.description}</p>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                                            {post.category}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{post.readTime}</td>
                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                                        {new Date(post.date).toLocaleDateString("vi-VN", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric"
                                        })}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {post.pinned ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                                                Có
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">Không</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex justify-end gap-1.5">
                                            <button 
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" 
                                                onClick={() => setSelectedPostId(post.id)}
                                            >
                                                Xem
                                            </button>
                                            {admin && <button className={btn("soft")} onClick={() => setEditor({ post: post })}>Sửa</button>}
                                            {admin && <button className={btn("danger")} onClick={() => handleDeleteDirect(post)} disabled={deleting}>Xoá</button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {adminModals}
        </div>
    );
}
