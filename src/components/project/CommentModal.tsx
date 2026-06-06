import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, User, Globe } from "lucide-react";

interface CommentEntry {
    id: string;
    author_name: string;
    avatar_url: string | null;
    content: string;
}

interface CommentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    comment?: CommentEntry;
    onSuccess: () => void;
}

export const CommentModal = ({ open, onOpenChange, comment, onSuccess }: CommentModalProps) => {
    const [name, setName] = useState("");
    const [content, setContent] = useState("");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const { toast } = useToast();

    useEffect(() => {
        if (comment) {
            setName(comment.author_name);
            setContent(comment.content);
            setAvatarUrl(comment.avatar_url);
        } else {
            setName("");
            setContent("");
            setAvatarUrl(null);
        }
    }, [comment, open]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `avatars/${Math.random()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrl);
            toast({ title: "Avatar uploaded", description: "Profile picture set successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Upload failed", description: error.message });
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim() || !content.trim()) {
            toast({ variant: "destructive", title: "Missing fields", description: "Please provide a name and comment content." });
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const payload = {
                user_id: user.id,
                author_name: name,
                content,
                avatar_url: avatarUrl,
            };

            let error;
            if (comment) {
                const { error: updateError } = await supabase
                    .from('comment_library')
                    .update(payload)
                    .eq('id', comment.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('comment_library')
                    .insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            toast({ title: "Success", description: comment ? "Comment updated" : "Comment added to library" });
            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Save failed", description: error.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] bg-[#1a1628] border-white/10 text-white rounded-[32px] overflow-hidden backdrop-blur-3xl shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                
                <DialogHeader className="relative z-10">
                    <DialogTitle className="text-2xl font-black tracking-tight">
                        {comment ? "Edit Persona" : "New Comment Persona"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4 relative z-10">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center justify-center space-y-3 p-6 bg-white/[0.03] border border-white/5 rounded-3xl">
                        <div className="relative group">
                            <div className="w-20 h-20 rounded-full overflow-hidden bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center transition-all group-hover:border-primary/50 relative">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-8 h-8 text-white/20" />
                                )}
                                {uploading && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                )}
                            </div>
                            <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-all border-2 border-[#1a1628]">
                                <Upload className="w-4 h-4" />
                                <input type="file" className="sr-only" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                            </label>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">User Avatar Profile</p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-white/40">Username / Name</Label>
                        <Input 
                            placeholder="e.g. DreamFan99" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-white/[0.03] border-white/10 rounded-xl focus:ring-primary focus:border-primary h-11"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-white/40">Comment Content</Label>
                        <Textarea 
                            placeholder="What do they say?" 
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="bg-white/[0.03] border-white/10 rounded-xl focus:ring-primary focus:border-primary min-h-[100px] resize-none leading-relaxed"
                        />
                    </div>
                </div>

                <DialogFooter className="relative z-10 gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl hover:bg-white/5 text-white/60">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSave} 
                        disabled={saving || uploading}
                        className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-8 shadow-lg shadow-primary/20"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                        {comment ? "Update Persona" : "Save to Matrix"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
