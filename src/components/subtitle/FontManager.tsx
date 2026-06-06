import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileType, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface UserFont {
    id: string;
    font_name: string;
    storage_path: string;
    created_at: string;
}

export const FontManager: React.FC = () => {
    const [fonts, setFonts] = useState<UserFont[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFonts = async () => {
        try {
            const { data, error } = await (supabase as any)
                .from('user_fonts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setFonts((data as any[]) || []);
        } catch (error: any) {
            toast.error('Failed to load fonts: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFonts();
    }, []);

    const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0] || (e.target as HTMLInputElement).files?.[0];

        if (!file) return;

        // Strict validation
        const validTypes = ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-opentype'];
        const validExtensions = ['.ttf', '.otf'];
        const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt)) {
            toast.error('Invalid file type. Only `.ttf` and `.otf` fonts are allowed.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('Font file is too large. Limit is 10MB.');
            return;
        }

        setIsUploading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Authentication required");

            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const storagePath = `${user.id}/${Date.now()}_${cleanFileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('custom_fonts')
                .upload(storagePath, file);

            if (uploadError) throw uploadError;

            // 2. Insert into DB
            const { error: dbError } = await (supabase as any)
                .from('user_fonts')
                .insert({
                    user_id: user.id,
                    font_name: file.name.replace(fileExt, ''), // Remove extension for display name
                    storage_path: storagePath
                });

            if (dbError) throw dbError;

            toast.success('Font uploaded successfully!');
            fetchFonts();
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    }, []);

    const deleteFont = async (id: string, storagePath: string) => {
        try {
            // Delete from DB
            const { error: dbError } = await (supabase as any).from('user_fonts').delete().eq('id', id);
            if (dbError) throw dbError;

            // Delete from storage
            await supabase.storage.from('custom_fonts').remove([storagePath]);

            toast.success('Font deleted');
            setFonts(fonts.filter(f => f.id !== id));
        } catch (error: any) {
            toast.error('Failed to delete font: ' + error.message);
        }
    };

    return (
        <div className="space-y-4">
            {/* Drag & Drop Zone */}
            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="relative border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-background/50 group"
            >
                <input
                    type="file"
                    accept=".ttf,.otf"
                    onChange={(e) => onDrop(e as any)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isUploading}
                />
                {isUploading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                ) : (
                    <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                )}
                <h3 className="text-sm font-medium">{isUploading ? 'Uploading securely...' : 'Click or drag a .ttf / .otf file here'}</h3>
            </div>

            {/* Font List */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {isLoading ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">Loading fonts...</div>
                ) : fonts.length === 0 ? (
                    <div className="text-center py-6 bg-muted/20 rounded-lg text-xs text-muted-foreground border border-dashed border-border">
                        No custom fonts uploaded yet.
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {fonts.map((font) => (
                            <li key={font.id} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg border border-border/50 hover:border-border transition-colors">
                                <div className="flex items-center gap-2">
                                    <FileType className="text-primary w-4 h-4" />
                                    <span className="font-medium font-mono text-xs">{font.font_name}</span>
                                </div>
                                <button
                                    onClick={() => deleteFont(font.id, font.storage_path)}
                                    className="p-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
