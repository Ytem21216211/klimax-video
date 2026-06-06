import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Flame, Target, Activity, Eye, Heart, UserPlus, Search, Clock, History, Key, Lock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface WarmupLog {
    id: string;
    interaction_type: string;
    video_title: string;
    video_url: string;
    created_at: string;
}

interface WarmupSettings {
    niche: string;
    search_terms: string[];
    daily_duration_minutes: number;
}

interface WarmupControlProps {
    accountId: string;
    status: string;
    startedAt: string;
    settings: WarmupSettings | null;
    onSettingsUpdate: (settings: WarmupSettings) => void;
}

export function WarmupControl({ accountId, status, startedAt, settings, onSettingsUpdate }: WarmupControlProps) {
    const [logs, setLogs] = useState<WarmupLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [localSettings, setLocalSettings] = useState<WarmupSettings>(settings || {
        niche: "Minecraft",
        search_terms: [],
        daily_duration_minutes: 30
    });

    // Client Secret Management
    const [clientSecret, setClientSecret] = useState("");
    const [secretDialogOpen, setSecretDialogOpen] = useState(false);
    const [hasSecret, setHasSecret] = useState(false);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
        // Check if secret exists in localStorage
        const stored = localStorage.getItem("google_client_secret");
        if (stored) setHasSecret(true);
    }, [settings]);

    const saveClientSecret = () => {
        if (!clientSecret.trim()) return;
        localStorage.setItem("google_client_secret", clientSecret.trim());
        setHasSecret(true);
        setSecretDialogOpen(false);
        setClientSecret("");
        toast({ title: "Secret Saved", description: "Your Client Secret allows auto-refreshing tokens." });
    };

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const { data, error } = await supabase
                .from('youtube_warmup_logs')
                .select('*')
                .eq('account_id', accountId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error("Error fetching warmup logs:", error);
        } finally {
            setLoadingLogs(false);
        }
    };

    const calculateRemainingTime = () => {
        const start = new Date(startedAt);
        const end = new Date(start.getTime() + (3 * 24 * 60 * 60 * 1000));
        const remaining = end.getTime() - Date.now();

        if (remaining <= 0) return "Warmup complete!";

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h remaining`;
    };

    const handleUpdateSettings = () => {
        onSettingsUpdate(localSettings);
        toast({ title: "Warmup settings updated" });
    };

    const handleAddSearchTerm = () => {
        if (!searchTerm.trim()) return;
        const updatedTerms = [...(localSettings.search_terms || []), searchTerm.trim()];
        setLocalSettings({ ...localSettings, search_terms: updatedTerms });
        setSearchTerm("");
    };

    const handleRemoveSearchTerm = (term: string) => {
        const updatedTerms = (localSettings.search_terms || []).filter(t => t !== term);
        setLocalSettings({ ...localSettings, search_terms: updatedTerms });
    };

    const getInteractionIcon = (type: string) => {
        switch (type) {
            case 'watch': return <Eye className="h-3 w-3 text-blue-400" />;
            case 'like': return <Heart className="h-3 w-3 text-red-400" />;
            case 'subscribe': return <UserPlus className="h-3 w-3 text-green-400" />;
            default: return <Activity className="h-3 w-3 text-gray-400" />;
        }
    };

    // --- CLIENT-SIDE TOKEN REFRESH LOGIC ---
    // Correct implementation of refresh using explicit user inputs
    const performLocalRefresh = async (refreshToken: string) => {
        const secret = localStorage.getItem("google_client_secret");
        // We need Client ID. Let's try to get it from a public config or ask user.
        // Ideally we'd modify the dialog to ask for Client ID too.
        // For this revision, I'll update the dialog to ask for BOTH.
        const clientId = localStorage.getItem("google_client_id");

        if (!secret || !clientId) throw new Error("Missing Client ID/Secret. Please configure in the lock menu.");

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: secret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`Refresh failed: ${err.error_description || 'Unknown error'}`);
        }

        return await response.json(); // { access_token, expires_in, scope, token_type }
    };

    return (
        <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Flame className={`h-5 w-5 ${status === 'warmed' ? 'text-orange-500' : 'text-blue-500 animate-pulse'}`} />
                    <h4 className="font-semibold text-sm">Account Warmup</h4>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                {hasSecret ? <Lock className="h-3 w-3 text-green-500" /> : <Key className="h-3 w-3 text-yellow-500" />}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Auto-Refresh Configuration</DialogTitle>
                                <DialogDescription>
                                    To refresh tokens without a backend server, we need your Google Credentials.
                                    These are saved <strong>locally in your browser</strong> only.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <Label>Client ID</Label>
                                    <Input
                                        type="text"
                                        placeholder="789...apps.googleusercontent.com"
                                        onChange={(e) => localStorage.setItem("google_client_id", e.target.value.trim())}
                                        defaultValue={localStorage.getItem("google_client_id") || ""}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Client Secret</Label>
                                    <Input
                                        type="password"
                                        value={clientSecret}
                                        onChange={(e) => setClientSecret(e.target.value)}
                                        placeholder="GOCSPX-..."
                                    />
                                </div>
                                <Button onClick={saveClientSecret} className="w-full">
                                    Save Locally
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                    <Badge variant={status === 'warmed' ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                        {status}
                    </Badge>
                </div>
            </div>

            {status !== 'warmed' && (
                <div className="bg-primary/5 p-3 rounded border border-primary/20 space-y-1">
                    <p className="text-xs text-muted-foreground">Warmup started on {new Date(startedAt).toLocaleDateString()}</p>
                    <p className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        {calculateRemainingTime()}
                    </p>
                    <p className="text-[10px] text-muted-foreground italic">
                        Posting is restricted during warmup to build account authority.
                    </p>
                </div>
            )}

            <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Niche</Label>
                        <Input
                            value={localSettings.niche}
                            onChange={(e) => setLocalSettings({ ...localSettings, niche: e.target.value })}
                            className="h-8 text-sm"
                            placeholder="e.g. Minecraft"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Daily Duration (Min)</Label>
                        <Input
                            type="number"
                            value={localSettings.daily_duration_minutes}
                            onChange={(e) => setLocalSettings({ ...localSettings, daily_duration_minutes: parseInt(e.target.value) || 30 })}
                            className="h-8 text-sm"
                            min="5"
                            max="180"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Search Terms</Label>
                    <div className="flex gap-2">
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSearchTerm())}
                            className="h-8 text-sm"
                            placeholder="Add search term..."
                        />
                        <Button size="sm" variant="secondary" className="h-8" onClick={handleAddSearchTerm}>
                            <Search className="h-3 w-3" />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {(localSettings.search_terms || []).map((term) => (
                            <Badge key={term} variant="outline" className="text-[10px] py-0 pr-1 gap-1">
                                {term}
                                <button onClick={() => handleRemoveSearchTerm(term)} className="hover:text-red-500">
                                    ×
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="secondary"
                        className="w-full h-8 text-[10px] uppercase font-bold"
                        onClick={handleUpdateSettings}
                    >
                        Update Settings
                    </Button>
                    <Button
                        variant="default"
                        className="w-full h-8 text-[10px] uppercase font-bold bg-orange-600 hover:bg-orange-700"
                        onClick={async () => {
                            try {
                                // 1. Fetch Account
                                const { data: account, error: accError } = await supabase
                                    .from('youtube_accounts')
                                    .select('access_token, token_expires_at, refresh_token, channel_name, warmup_settings')
                                    .eq('id', accountId)
                                    .single();

                                if (accError || !account) throw new Error("Could not fetch account credentials.");

                                let token = account.access_token;

                                // 2. Check Expiry & Refresh if needed
                                if (new Date(account.token_expires_at) <= new Date()) {
                                    toast({ title: "Token Expired", description: "Attempting auto-refresh...", variant: "default" });

                                    try {
                                        const newTokens = await performLocalRefresh(account.refresh_token);
                                        token = newTokens.access_token;

                                        // Update Supabase with new token
                                        await supabase.from('youtube_accounts').update({
                                            access_token: token,
                                            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
                                        }).eq('id', accountId);

                                        toast({ title: "Token Refreshed", description: "Successfully refreshed access token.", className: "bg-green-600 text-white" });
                                    } catch (refreshErr: any) {
                                        setSecretDialogOpen(true);
                                        throw new Error(`Auto-refresh failed: ${refreshErr.message}`);
                                    }
                                }

                                // 3. Perform Warmup Actions
                                const settings = (account.warmup_settings as unknown as WarmupSettings) || { niche: "Minecraft", search_terms: [] };
                                const query = settings.search_terms.length > 0
                                    ? settings.search_terms[Math.floor(Math.random() * settings.search_terms.length)]
                                    : settings.niche;

                                const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=15&relevanceLanguage=en`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });

                                if (!searchRes.ok) throw new Error("YouTube Search failed. Quota might be exceeded.");
                                const searchData = await searchRes.json();
                                const videos = searchData.items || [];

                                if (videos.length === 0) throw new Error("No videos found by search.");

                                // Perform 1-3 random interactions immediately
                                const targetCount = Math.floor(Math.random() * 3) + 1;
                                const selectedVideos = videos.sort(() => 0.5 - Math.random()).slice(0, targetCount);

                                let actionsCount = 0;
                                for (const video of selectedVideos) {
                                    const action = Math.random() > 0.7 ? 'subscribe' : (Math.random() > 0.4 ? 'like' : 'watch');
                                    let success = false;

                                    if (action === 'like') {
                                        const likeRes = await fetch(`https://www.googleapis.com/youtube/v3/videos/rate?id=${video.id.videoId}&rating=like`, {
                                            method: 'POST',
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        success = likeRes.ok;
                                    } else if (action === 'subscribe') {
                                        const subRes = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet`, {
                                            method: 'POST',
                                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ snippet: { resourceId: { kind: 'youtube#channel', channelId: video.snippet.channelId } } })
                                        });
                                        success = subRes.ok;
                                    } else {
                                        success = true; // Watch is just a log
                                    }

                                    if (success) {
                                        await supabase.from('youtube_warmup_logs').insert({
                                            account_id: accountId,
                                            interaction_type: action,
                                            video_id: video.id.videoId,
                                            video_title: video.snippet.title,
                                            video_url: `https://youtube.com/watch?v=${video.id.videoId}`
                                        });
                                        actionsCount++;
                                    }
                                }

                                if (actionsCount > 0 && status === 'new') {
                                    await supabase.from('youtube_accounts').update({ warmup_status: 'warming' }).eq('id', accountId);
                                    // Trigger parent status update if needed, typically real-time or callback
                                }

                                toast({ title: "Warmup executed!", description: `Performed ${actionsCount} interactions.` });
                                fetchLogs();
                            } catch (err: any) {
                                toast({ title: "Action Failed", description: err.message, variant: "destructive" });
                            }
                        }}
                    >
                        <Flame className="h-3 w-3 mr-1" /> Run Now
                    </Button>
                </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-border/30">
                <div className="flex items-center justify-between">
                    <h5 className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <History className="h-3 w-3" /> Activity Log
                    </h5>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={fetchLogs} disabled={loadingLogs}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${loadingLogs ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                </div>

                {loadingLogs ? (
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : logs.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2 italic border border-dashed rounded">
                        No activities recorded yet.
                    </p>
                ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {logs.map((log) => (
                            <div key={log.id} className="text-[10px] p-2 bg-background/50 rounded flex flex-col gap-1 border border-border/20">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium flex items-center gap-1 uppercase tracking-tight">
                                        {getInteractionIcon(log.interaction_type)}
                                        {log.interaction_type}
                                    </span>
                                    <span className="text-muted-foreground">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="truncate text-muted-foreground">{log.video_title}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
