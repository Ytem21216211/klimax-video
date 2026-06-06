import { FileInfo, ProjectIndex } from './types';

// Simulated project file tree - in a real implementation, this would be fetched from a backend
const PROJECT_FILES: FileInfo[] = [
  // Root files
  { path: 'package.json', name: 'package.json', type: 'file', summary: 'Project dependencies and scripts' },
  { path: 'vite.config.ts', name: 'vite.config.ts', type: 'file', summary: 'Vite build configuration' },
  { path: 'tailwind.config.ts', name: 'tailwind.config.ts', type: 'file', summary: 'Tailwind CSS configuration' },
  { path: 'tsconfig.json', name: 'tsconfig.json', type: 'file', summary: 'TypeScript configuration' },
  
  // src directory
  { path: 'src', name: 'src', type: 'directory' },
  { path: 'src/App.tsx', name: 'App.tsx', type: 'file', summary: 'Main app component with routes and providers' },
  { path: 'src/main.tsx', name: 'main.tsx', type: 'file', summary: 'Application entry point' },
  { path: 'src/index.css', name: 'index.css', type: 'file', summary: 'Global styles and Tailwind imports' },
  
  // Components
  { path: 'src/components', name: 'components', type: 'directory' },
  { path: 'src/components/ui', name: 'ui', type: 'directory', summary: 'shadcn/ui base components' },
  { path: 'src/components/Navbar.tsx', name: 'Navbar.tsx', type: 'file', summary: 'Main navigation component' },
  { path: 'src/components/Hero.tsx', name: 'Hero.tsx', type: 'file', summary: 'Landing page hero section' },
  { path: 'src/components/ProtectedRoute.tsx', name: 'ProtectedRoute.tsx', type: 'file', summary: 'Auth-protected route wrapper' },
  
  // Pages
  { path: 'src/pages', name: 'pages', type: 'directory' },
  { path: 'src/pages/Index.tsx', name: 'Index.tsx', type: 'file', summary: 'Landing page' },
  { path: 'src/pages/Auth.tsx', name: 'Auth.tsx', type: 'file', summary: 'Authentication page' },
  { path: 'src/pages/Dashboard.tsx', name: 'Dashboard.tsx', type: 'file', summary: 'Main dashboard page' },
  { path: 'src/pages/ProjectEditor.tsx', name: 'ProjectEditor.tsx', type: 'file', summary: 'Project editing interface' },
  { path: 'src/pages/ScriptForge.tsx', name: 'ScriptForge.tsx', type: 'file', summary: 'Script creation and management' },
  { path: 'src/pages/DataCenter.tsx', name: 'DataCenter.tsx', type: 'file', summary: 'Analytics and data visualization' },
  
  // Hooks
  { path: 'src/hooks', name: 'hooks', type: 'directory' },
  { path: 'src/hooks/use-toast.ts', name: 'use-toast.ts', type: 'file', summary: 'Toast notification hook' },
  { path: 'src/hooks/useNotifications.ts', name: 'useNotifications.ts', type: 'file', summary: 'Notification system hook' },
  
  // Integrations
  { path: 'src/integrations', name: 'integrations', type: 'directory' },
  { path: 'src/integrations/supabase', name: 'supabase', type: 'directory', summary: 'Supabase client and types' },
  
  // Supabase functions
  { path: 'supabase/functions', name: 'functions', type: 'directory', summary: 'Edge functions for backend logic' },
];

// File content cache
const FILE_CONTENT_CACHE: Record<string, string> = {};

export const getProjectIndex = (): ProjectIndex => {
  const summaries: Record<string, string> = {};
  
  PROJECT_FILES.forEach(file => {
    if (file.summary) {
      summaries[file.path] = file.summary;
    }
  });
  
  return {
    structure: PROJECT_FILES,
    summaries,
    lastUpdated: new Date()
  };
};

export const buildFileTreeString = (files: FileInfo[], indent = ''): string => {
  const lines: string[] = [];
  const dirs = files.filter(f => f.type === 'directory');
  const regularFiles = files.filter(f => f.type === 'file');
  
  // Group files by directory
  const filesByDir: Record<string, FileInfo[]> = { '.': [] };
  
  regularFiles.forEach(file => {
    const parts = file.path.split('/');
    if (parts.length === 1) {
      filesByDir['.'].push(file);
    } else {
      const dir = parts.slice(0, -1).join('/');
      if (!filesByDir[dir]) filesByDir[dir] = [];
      filesByDir[dir].push(file);
    }
  });
  
  // Build tree string
  const buildTree = (currentPath: string, depth: number): string[] => {
    const result: string[] = [];
    const indent = '  '.repeat(depth);
    
    // Add files in current directory
    const filesHere = filesByDir[currentPath] || [];
    filesHere.forEach(file => {
      const summary = file.summary ? ` - ${file.summary}` : '';
      result.push(`${indent}${file.name}${summary}`);
    });
    
    // Add subdirectories
    const subDirs = dirs.filter(d => {
      const parentPath = d.path.split('/').slice(0, -1).join('/') || '.';
      return parentPath === currentPath;
    });
    
    subDirs.forEach(dir => {
      const summary = dir.summary ? ` - ${dir.summary}` : '';
      result.push(`${indent}${dir.name}/${summary}`);
      result.push(...buildTree(dir.path, depth + 1));
    });
    
    return result;
  };
  
  return buildTree('.', 0).join('\n');
};

export const listFiles = (path: string): FileInfo[] => {
  const normalizedPath = path === '.' ? '' : path;
  
  return PROJECT_FILES.filter(file => {
    if (normalizedPath === '') {
      return !file.path.includes('/');
    }
    const parentPath = file.path.split('/').slice(0, -1).join('/');
    return parentPath === normalizedPath;
  });
};

export const readFile = async (path: string): Promise<string> => {
  // Check cache first
  if (FILE_CONTENT_CACHE[path]) {
    return FILE_CONTENT_CACHE[path];
  }
  
  // In a real implementation, this would fetch from an API
  // For now, return a placeholder or actual content for known files
  const content = `// Content of ${path}\n// This would be the actual file content in a real implementation`;
  FILE_CONTENT_CACHE[path] = content;
  return content;
};

export const searchCode = (query: string): { path: string; matches: string[] }[] => {
  // Simulated search - in production, this would call a backend search API
  const results: { path: string; matches: string[] }[] = [];
  
  const queryLower = query.toLowerCase();
  
  PROJECT_FILES.filter(f => f.type === 'file').forEach(file => {
    // Check if filename matches
    if (file.name.toLowerCase().includes(queryLower)) {
      results.push({
        path: file.path,
        matches: [`File name contains "${query}"`]
      });
    }
    // Check if summary matches
    if (file.summary?.toLowerCase().includes(queryLower)) {
      results.push({
        path: file.path,
        matches: [file.summary]
      });
    }
  });
  
  return results;
};

export const identifyRelevantFiles = (userMessage: string, projectIndex: ProjectIndex): string[] => {
  const relevantPaths: string[] = [];
  const messageLower = userMessage.toLowerCase();
  
  // Keywords to file mapping
  const keywordMap: Record<string, string[]> = {
    'route': ['src/App.tsx'],
    'routing': ['src/App.tsx'],
    'navigation': ['src/components/Navbar.tsx', 'src/App.tsx'],
    'auth': ['src/pages/Auth.tsx', 'src/components/ProtectedRoute.tsx'],
    'login': ['src/pages/Auth.tsx'],
    'dashboard': ['src/pages/Dashboard.tsx'],
    'style': ['src/index.css', 'tailwind.config.ts'],
    'css': ['src/index.css', 'tailwind.config.ts'],
    'tailwind': ['tailwind.config.ts', 'src/index.css'],
    'component': ['src/components/ui'],
    'hook': ['src/hooks'],
    'supabase': ['src/integrations/supabase'],
    'database': ['src/integrations/supabase'],
    'api': ['supabase/functions'],
    'edge function': ['supabase/functions'],
    'project': ['src/pages/ProjectEditor.tsx'],
    'script': ['src/pages/ScriptForge.tsx'],
    'data': ['src/pages/DataCenter.tsx'],
  };
  
  Object.entries(keywordMap).forEach(([keyword, paths]) => {
    if (messageLower.includes(keyword)) {
      paths.forEach(p => {
        if (!relevantPaths.includes(p)) {
          relevantPaths.push(p);
        }
      });
    }
  });
  
  // Also check for direct file references
  projectIndex.structure.forEach(file => {
    if (messageLower.includes(file.name.toLowerCase())) {
      if (!relevantPaths.includes(file.path)) {
        relevantPaths.push(file.path);
      }
    }
  });
  
  return relevantPaths.slice(0, 10); // Limit to 10 most relevant files
};
