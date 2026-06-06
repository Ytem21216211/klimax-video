import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  sha: string;
}

interface GitHubSearchResult {
  path: string;
  repository: { full_name: string };
  text_matches?: { fragment: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GITHUB_ACCESS_TOKEN = Deno.env.get("GITHUB_ACCESS_TOKEN");
    if (!GITHUB_ACCESS_TOKEN) {
      throw new Error("GITHUB_ACCESS_TOKEN is not configured");
    }

    const { action, owner, repo, path = "", query, branch = "main" } = await req.json();

    const headers = {
      "Authorization": `Bearer ${GITHUB_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "DevAssistant/1.0",
    };

    console.log(`GitHub API: ${action} for ${owner}/${repo}, path: ${path}, branch: ${branch}`);

    switch (action) {
      case "list_files": {
        // Get directory contents
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("GitHub API error:", response.status, errorText);
          throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Handle both array (directory) and object (file) responses
        const files: GitHubFile[] = Array.isArray(data) ? data : [data];
        
        const result = files.map((f: GitHubFile) => ({
          name: f.name,
          path: f.path,
          type: f.type,
          size: f.size,
        }));

        return new Response(
          JSON.stringify({ files: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "read_file": {
        // Get file contents
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("GitHub API error:", response.status, errorText);
          throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        if (data.type !== "file") {
          throw new Error(`Path "${path}" is not a file`);
        }

        // Decode base64 content
        const content = atob(data.content.replace(/\n/g, ""));
        
        return new Response(
          JSON.stringify({ 
            content,
            path: data.path,
            size: data.size,
            sha: data.sha,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "search_code": {
        if (!query) {
          throw new Error("Search query is required");
        }

        // Search code in repository
        const searchQuery = encodeURIComponent(`${query} repo:${owner}/${repo}`);
        const url = `https://api.github.com/search/code?q=${searchQuery}`;
        
        const response = await fetch(url, { 
          headers: {
            ...headers,
            "Accept": "application/vnd.github.text-match+json", // Include text matches
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("GitHub Search API error:", response.status, errorText);
          
          // Rate limit handling
          if (response.status === 403) {
            throw new Error("GitHub API rate limit exceeded. Please wait a moment and try again.");
          }
          throw new Error(`GitHub Search API error: ${response.status}`);
        }

        const data = await response.json();
        
        const results = data.items?.map((item: GitHubSearchResult) => ({
          path: item.path,
          matches: item.text_matches?.map((m: { fragment: string }) => m.fragment) || [],
        })) || [];

        return new Response(
          JSON.stringify({ 
            results,
            total_count: data.total_count,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_tree": {
        // Get full repository tree (recursive)
        const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("GitHub API error:", response.status, errorText);
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Filter and format tree
        const tree = data.tree
          ?.filter((item: { type: string; path: string }) => 
            // Exclude common non-essential directories
            !item.path.startsWith("node_modules/") &&
            !item.path.startsWith(".git/") &&
            !item.path.startsWith("dist/") &&
            !item.path.startsWith("build/")
          )
          .map((item: { path: string; type: string; size?: number }) => ({
            path: item.path,
            type: item.type === "tree" ? "dir" : "file",
            size: item.size,
          })) || [];

        return new Response(
          JSON.stringify({ tree, truncated: data.truncated }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error("GitHub repo reader error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
