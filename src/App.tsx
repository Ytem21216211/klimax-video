import * as React from "react";
const { Suspense, lazy } = React;
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { DevAssistantProvider } from "./components/devAssistant";
import ErrorBoundary from "./components/ErrorBoundary";


// Lazy load all pages for better crash isolation
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Datalligence = lazy(() => import("./pages/Datalligence"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AssetBank = lazy(() => import("./pages/AssetBank"));
const ProjectEditor = lazy(() => import("./pages/ClimaxVideoEditor"));
const Imports = lazy(() => import("./pages/Imports"));
const Invitations = lazy(() => import("./pages/Invitations"));
const SfxLibrary = lazy(() => import("./pages/SfxLibrary"));
const ScriptForge = lazy(() => import("./pages/ScriptForge"));
const DataCenter = lazy(() => import("./pages/DataCenter"));
const ClipsFactory = lazy(() => import("./pages/ClipsFactory"));
const VoiceLibrary = lazy(() => import("./pages/VoiceLibrary"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const AgentikFlow = lazy(() => import("./pages/AgentikFlow"));
const VizionDashboard = lazy(() => import("./pages/VizionDashboard"));
const Tablor = lazy(() => import("./pages/Tablor"));
const CommentLibrary = lazy(() => import("./pages/CommentLibrary"));
const AgenticSuit = lazy(() => import("./pages/AgenticSuit"));
const Cognium = lazy(() => import("./pages/Cognium"));
const SlateLanding = lazy(() => import("./pages/SlateLanding"));
const AfterAI = lazy(() => import("./pages/AfterAI"));
const Parametres = lazy(() => import("./pages/Parametres"));
const AutomaticMode = lazy(() => import("./pages/AutomaticMode"));
const AutoParamMode = lazy(() => import("./pages/AutoParamMode"));
const StudioProjects = lazy(() => import("./pages/StudioProjects"));
const ProjectsHome = lazy(() => import("./pages/ProjectsHome"));
const TrainingMode = lazy(() => import("./pages/TrainingMode"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LoadingFallback = () => (
  <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono">
    <div className="text-center space-y-6">
      <div className="relative w-16 h-16 mx-auto">
        <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
        <div className="absolute inset-0 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-black text-white uppercase tracking-[0.6em]">Initialising Systems</p>
        <p className="text-[8px] text-white/30 uppercase tracking-[0.4em]">Neural Core v4.3 // Syncing Assets</p>
      </div>
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DevAssistantProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<SlateLanding />} />
                <Route path="/slate" element={<SlateLanding />} />
                <Route path="/auth" element={<Auth />} />

                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />

                {/* Protected routes */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/asset-bank" element={<ProtectedRoute><AssetBank /></ProtectedRoute>} />
                <Route path="/project/:projectId" element={<ProtectedRoute><ProjectEditor /></ProtectedRoute>} />
                <Route path="/imports" element={<ProtectedRoute><Imports /></ProtectedRoute>} />
                <Route path="/invitations" element={<ProtectedRoute><Invitations /></ProtectedRoute>} />
                <Route path="/sfx-library" element={<ProtectedRoute><SfxLibrary /></ProtectedRoute>} />
                <Route path="/scriptforge" element={<ProtectedRoute><ScriptForge /></ProtectedRoute>} />

                <Route path="/data-center" element={<ProtectedRoute><DataCenter /></ProtectedRoute>} />
                <Route path="/clips-factory" element={<ProtectedRoute><ClipsFactory /></ProtectedRoute>} />
                <Route path="/voice-library" element={<ProtectedRoute><VoiceLibrary /></ProtectedRoute>} />
                <Route path="/datalligence" element={<ProtectedRoute><Datalligence /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><AnalyticsDashboard /></ProtectedRoute>} />
                <Route path="/agentik-flow" element={<ProtectedRoute><AgentikFlow /></ProtectedRoute>} />
                <Route path="/vizion" element={<ProtectedRoute><VizionDashboard /></ProtectedRoute>} />
                <Route path="/tablor" element={<ProtectedRoute><Tablor /></ProtectedRoute>} />
                <Route path="/comment-library" element={<ProtectedRoute><CommentLibrary /></ProtectedRoute>} />
                <Route path="/agentic-suit" element={<ProtectedRoute><AgenticSuit /></ProtectedRoute>} />
                <Route path="/cognium" element={<ProtectedRoute><Cognium /></ProtectedRoute>} />
                <Route path="/afterai" element={<ProtectedRoute><AfterAI /></ProtectedRoute>} />
                <Route path="/parametres" element={<ProtectedRoute><Parametres /></ProtectedRoute>} />
                <Route path="/automatic-mode" element={<ProtectedRoute><AutomaticMode /></ProtectedRoute>} />
                <Route path="/auto-param-mode" element={<ProtectedRoute><AutoParamMode /></ProtectedRoute>} />
                <Route path="/studio" element={<ProtectedRoute><StudioProjects /></ProtectedRoute>} />
                <Route path="/projets" element={<ProtectedRoute><ProjectsHome /></ProtectedRoute>} />
                <Route path="/training-mode" element={<ProtectedRoute><TrainingMode /></ProtectedRoute>} />

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </DevAssistantProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
