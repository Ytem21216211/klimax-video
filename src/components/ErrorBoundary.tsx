import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {

  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 font-mono">
          <div className="max-w-md w-full space-y-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 blur-[100px] rounded-full animate-pulse" />
              <div className="relative bg-red-500/10 border border-red-500/20 p-8 rounded-3xl backdrop-blur-xl">
                <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">System Neural Failure</h1>
                <p className="text-white/40 text-xs mb-6 uppercase tracking-widest leading-relaxed">
                  The application encountered a catastrophic runtime exception. Neural pathways are currently obstructed.
                </p>
                <div className="bg-black/40 p-4 rounded-xl mb-6 text-left overflow-auto max-h-[150px] border border-white/5">
                  <p className="text-red-400 text-[10px] whitespace-pre-wrap">
                    {this.state.error?.message || "Unknown Runtime Error"}
                  </p>
                </div>
                <Button 
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 h-12 uppercase text-[10px] tracking-[0.3em] font-black"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Attempt Neural Reboot
                </Button>
              </div>
            </div>
            <div className="text-[8px] text-white/20 uppercase tracking-[0.5em]">
              Error Boundary v2.4 // Automated Diagnostics Active
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
