import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Music2, Link2, Unlink, ExternalLink, Plus, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TikTokAccount {
    id: string;
    project_id: string;
    open_id: string; // TikTok specific
    display_name: string; // TikTok specific
    avatar_url?: string; // TikTok specific
    refresh_token: string;
    expires_at: string;
    privacy: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

interface TikTokMultiAccountManagerProps {
    projectId: string;
}

export function TikTokMultiAccountManager({ projectId }: TikTokMultiAccountManagerProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
    const { toast } = useToast();

    // Fetch accounts
    useEffect(() => {
        fetchAccounts();
    }, [projectId]);

    // Check for OAuth callback results
    useEffect(() => {
        const connected = searchParams.get("tiktok_connected");
        const error = searchParams.get("tiktok_error");

        if (connected === "true") {
            toast({
                title: "TikTok Connected!",
                description: "Your TikTok account has been linked to this project.",
            });
            fetchAccounts();
            searchParams.delete("tiktok_connected");
            setSearchParams(searchParams);
        }

        if (error) {
            toast({
                title: "TikTok Connection Failed",
                description: `Error: ${error}`,
                variant: "destructive",
            });
            searchParams.delete("tiktok_error");
            setSearchParams(searchParams);
        }
    }, [searchParams, setSearchParams]);

    const fetchAccounts = async () => {
        try {
            const { data, error } = await supabase
                .from("tiktok_accounts")
                .select("*")
                .eq("project_id", projectId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            setAccounts(data || []);
        } catch (error: any) {
            console.error("Error fetching TikTok accounts:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        setIsConnecting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast({ title: "Please log in first", variant: "destructive" });
                return;
            }

            const { data, error } = await supabase.functions.invoke("tiktok-oauth-start", {
                body: { project_id: projectId },
            });

            if (error) throw error;
            window.location.href = data.auth_url;
        } catch (error: any) {
            console.error("TikTok connect error:", error);
            toast({
                title: "Connection Failed",
                description: error.message || "Failed to start TikTok connection",
                variant: "destructive",
            });
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async (accountId: string) => {
        try {
            const { error } = await supabase
                .from("tiktok_accounts")
                .delete()
                .eq("id", accountId);

            if (error) throw error;

            setAccounts(prev => prev.filter(a => a.id !== accountId));
            toast({ title: "TikTok Account Disconnected" });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const handleAccountSettingChange = async (accountId: string, key: keyof TikTokAccount, value: any) => {
        try {
            const { error } = await supabase
                .from("tiktok_accounts")
                .update({ [key]: value })
                .eq("id", accountId);

            if (error) throw error;

            setAccounts(prev => prev.map(a =>
                a.id === accountId ? { ...a, [key]: value } : a
            ));
        } catch (error: any) {
            toast({
                title: "Error saving settings",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const enabledCount = accounts.filter(a => a.enabled).length;

    return (
        <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Music2 className="h-4 w-4 text-pink-500" />
                    TikTok Auto-Post
                    {accounts.length > 0 && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                            {enabledCount}/{accounts.length} Active
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Connected Accounts */}
                {isLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">Loading accounts...</div>
                ) : (
                    <div className="space-y-2">
                        {accounts.map((account) => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                isExpanded={expandedAccountId === account.id}
                                onToggleExpand={() => setExpandedAccountId(
                                    expandedAccountId === account.id ? null : account.id
                                )}
                                onSettingChange={(key, value) => handleAccountSettingChange(account.id, key, value)}
                                onDisconnect={() => handleDisconnect(account.id)}
                            />
                        ))}
                    </div>
                )}

                {/* Add Account Button */}
                <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full"
                    variant="outline"
                >
                    {accounts.length === 0 ? (
                        <>
                            <Link2 className="h-4 w-4 mr-2" />
                            {isConnecting ? "Connecting..." : "Connect TikTok Account"}
                        </>
                    ) : (
                        <>
                            <Plus className="h-4 w-4 mr-2" />
                            {isConnecting ? "Connecting..." : "Add Another Account"}
                        </>
                    )}
                </Button>

                {accounts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                        Connect your TikTok accounts to automatically upload videos after rendering.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

// Separate component for each account card
interface AccountCardProps {
    account: TikTokAccount;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onSettingChange: (key: keyof TikTokAccount, value: any) => void;
    onDisconnect: () => void;
}

function AccountCard({ account, isExpanded, onToggleExpand, onSettingChange, onDisconnect }: AccountCardProps) {
    return (
        <div className="border border-border/50 rounded-lg overflow-hidden">
            {/* Account Header */}
            <div className="flex items-center justify-between p-3 bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-pink-500/10 flex items-center justify-center overflow-hidden">
                        {account.avatar_url ? (
                            <img src={account.avatar_url} alt="Ava" className="h-full w-full object-cover" />
                        ) : (
                            <Music2 className="h-4 w-4 text-pink-500" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{account.display_name}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Via TikTok OAuth
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Switch
                        checked={account.enabled}
                        onCheckedChange={(checked) => onSettingChange("enabled", checked)}
                    />
                    <Button variant="ghost" size="sm" onClick={onToggleExpand}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Expanded Settings */}
            <Collapsible open={isExpanded}>
                <CollapsibleContent className="p-3 pt-0 space-y-4 border-t border-border/30">
                    <div className="pt-3" />

                    {/* Privacy */}
                    <div className="space-y-2">
                        <Label className="text-sm">Privacy</Label>
                        <Select
                            value={account.privacy || 'public'}
                            onValueChange={(value) => onSettingChange("privacy", value)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="private">Private (Only Me)</SelectItem>
                                <SelectItem value="friends">Friends Only</SelectItem>
                                <SelectItem value="public">Public</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Disconnect Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={onDisconnect}
                    >
                        <Unlink className="h-4 w-4 mr-2" />
                        Disconnect Account
                    </Button>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
