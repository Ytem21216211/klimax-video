import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, MessageSquare, Trash2, ArrowLeft, User, Search, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CommentModal } from "@/components/project/CommentModal";

interface CommentEntry {
    id: string;
    author_name: string;
    avatar_url: string | null;
    content: string;
    created_at: string;
}

const CommentLibrary = () => {
    const [comments, setComments] = useState<CommentEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedComment, setSelectedComment] = useState<CommentEntry | undefined>(undefined);

    const { toast } = useToast();
    const navigate = useNavigate();

    const fetchComments = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('comment_library')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to load comment library" });
        } else {
            setComments(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchComments();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this comment?")) return;

        const { error } = await supabase
            .from('comment_library')
            .delete()
            .eq('id', id);

        if (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to delete comment" });
        } else {
            toast({ title: "Success", description: "Comment removed from library" });
            setComments(comments.filter(c => c.id !== id));
        }
    };

    const handleEdit = (comment: CommentEntry) => {
        setSelectedComment(comment);
        setModalOpen(true);
    };

    const handleAddNew = () => {
        setSelectedComment(undefined);
        setModalOpen(true);
    };

    const filteredComments = comments.filter(c => 
        c.author_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">
            {/* 🌑 Premium Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[#08060d]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
                <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#3b38fc]/10 rounded-full blur-[150px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#e324ff]/10 rounded-full blur-[150px] animate-pulse" />
            </div>

            <div className="container max-w-7xl mx-auto py-12 px-6 relative z-10">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
                    <div className="flex items-center gap-6">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate("/dashboard")}
                            className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white leading-none mb-2">
                                Comment Lab
                            </h1>
                            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em] opacity-60">
                                Social Interaction Database v1.0
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative w-64 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                            <Input 
                                placeholder="Search comments..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-11 bg-white/[0.03] border-white/10 rounded-xl focus:ring-primary focus:border-primary transition-all"
                            />
                        </div>
                        <Button
                            onClick={handleAddNew}
                            className="h-11 px-6 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg border-none transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Add Comment
                        </Button>
                    </div>
                </header>

                {/* Content */}
                <div className="">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-30">
                            <Loader2 className="w-12 h-12 animate-spin" />
                            <p className="text-sm font-medium text-slate-500">Accessing archives...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredComments.length === 0 ? (
                                <div className="col-span-full py-24 bg-[#161224]/40 backdrop-blur-3xl rounded-[40px] border border-dashed border-white/5 flex flex-col items-center justify-center text-center">
                                    <MessageSquare className="w-12 h-12 text-white/10 mb-6" />
                                    <h3 className="text-2xl font-bold text-white mb-2">No Comments Found</h3>
                                    <p className="text-white/30 max-w-xs mx-auto mb-8">Populate your library with fake comments to simulate platform engagement.</p>
                                    <Button onClick={handleAddNew} variant="outline" className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10">Create First Entry</Button>
                                </div>
                            ) : (
                                filteredComments.map(comment => (
                                    <Card key={comment.id} className="group bg-[#1a1628]/60 backdrop-blur-3xl border border-white/5 rounded-[32px] overflow-hidden hover:border-white/20 transition-all duration-500 hover:-translate-y-1">
                                        <CardHeader className="p-6 pb-0 flex flex-row items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
                                                    {comment.avatar_url ? (
                                                        <img src={comment.avatar_url} alt={comment.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-5 h-5 text-white/20" />
                                                    )}
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base font-bold text-white truncate max-w-[150px]">
                                                        {comment.author_name}
                                                    </CardTitle>
                                                    <div className="text-[10px] text-white/20 font-bold uppercase tracking-wider">
                                                        Active User
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" onClick={() => handleEdit(comment)} className="h-8 w-8 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => handleDelete(comment.id)} className="h-8 w-8 rounded-lg text-red-500/40 hover:text-red-500 hover:bg-red-500/10">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-6">
                                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-sm text-white/70 italic leading-relaxed">
                                                "{comment.content}"
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            <CommentModal 
                open={modalOpen} 
                onOpenChange={setModalOpen} 
                comment={selectedComment}
                onSuccess={fetchComments}
            />
        </div>
    );
};

export default CommentLibrary;
