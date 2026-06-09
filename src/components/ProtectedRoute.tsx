import * as React from "react";
const { useEffect, useState } = React;
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";



interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let settled = false;
    const decide = (authed: boolean) => {
      if (settled) return;
      settled = true;
      setIsAuthenticated(authed);
      if (!authed) navigate("/auth");
    };

    // Never let the auth check hang on a black loading screen: if getSession()
    // doesn't resolve quickly (e.g. an expired token whose refresh stalls), fall
    // back to the login page instead of spinning forever.
    const timer = setTimeout(() => decide(false), 4000);
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timer);
        decide(!!session);
      })
      .catch(() => {
        clearTimeout(timer);
        decide(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [navigate]);



  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }



  return <>{children}</>;
};

export default ProtectedRoute;
