import { useState } from "react";
import {
    LayoutDashboard,
    Trophy,
    Users,
    Settings,
    TrendingUp,
    Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface AnalyticsLayoutProps {
    children: React.ReactNode;
}

export function AnalyticsLayout({ children }: AnalyticsLayoutProps) {
    const [activeTab, setActiveTab] = useState("overview");

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <div className="w-64 border-r bg-card/50 backdrop-blur-sm flex flex-col">
                <div className="p-6">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        TikTok Brain
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Algorithmic Dominance Engine
                    </p>
                </div>

                <Separator />

                <nav className="flex-1 p-4 space-y-2">
                    <Button
                        variant={activeTab === "overview" ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveTab("overview")}
                    >
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Live Dashboard
                    </Button>

                    <Button
                        variant={activeTab === "scores" ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveTab("scores")}
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        Score Deep Dive
                    </Button>

                    <Button
                        variant={activeTab === "competitors" ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveTab("competitors")}
                    >
                        <Users className="mr-2 h-4 w-4" />
                        Competitor Intel
                    </Button>

                    <Button
                        variant={activeTab === "trends" ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveTab("trends")}
                    >
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Market Trends
                    </Button>
                </nav>

                <div className="p-4">
                    <Button variant="outline" className="w-full justify-start">
                        <Settings className="mr-2 h-4 w-4" />
                        Engine Config
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <header className="h-16 border-b flex items-center justify-between px-6 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center space-x-4">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search videos or hooks..."
                                className="h-9 w-64 rounded-md border border-input bg-transparent pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">
                            Engine Status: <span className="text-green-500 font-medium">Online</span>
                        </span>
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                </header>

                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
