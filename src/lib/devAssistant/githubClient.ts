import { supabase } from '@/integrations/supabase/client';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface GitHubSearchResult {
  path: string;
  matches: string[];
}

const STORAGE_KEY = 'dev-assistant-github-config';

export const getGitHubConfig = (): GitHubConfig | null => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
};

export const setGitHubConfig = (config: GitHubConfig): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const clearGitHubConfig = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const listFiles = async (config: GitHubConfig, path: string = ''): Promise<GitHubFile[]> => {
  const { data, error } = await supabase.functions.invoke('github-repo-reader', {
    body: {
      action: 'list_files',
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path,
    }
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return data.files || [];
};

export const readFile = async (config: GitHubConfig, path: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('github-repo-reader', {
    body: {
      action: 'read_file',
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path,
    }
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return data.content || '';
};

export const searchCode = async (config: GitHubConfig, query: string): Promise<GitHubSearchResult[]> => {
  const { data, error } = await supabase.functions.invoke('github-repo-reader', {
    body: {
      action: 'search_code',
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      query,
    }
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return data.results || [];
};

export const getRepoTree = async (config: GitHubConfig): Promise<GitHubFile[]> => {
  const { data, error } = await supabase.functions.invoke('github-repo-reader', {
    body: {
      action: 'get_tree',
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
    }
  });

  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return data.tree || [];
};

export const buildFileTreeString = (files: GitHubFile[]): string => {
  // Group files by directory
  const tree: Record<string, GitHubFile[]> = {};
  
  files.forEach(file => {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(file);
  });

  // Build tree string
  const lines: string[] = [];
  const processedDirs = new Set<string>();

  const addDir = (dirPath: string, indent: string = '') => {
    if (processedDirs.has(dirPath)) return;
    processedDirs.add(dirPath);

    const filesInDir = tree[dirPath] || [];
    
    filesInDir.forEach(file => {
      const icon = file.type === 'dir' ? '📁' : '📄';
      const name = file.path.split('/').pop() || file.path;
      lines.push(`${indent}${icon} ${name}`);
      
      if (file.type === 'dir') {
        addDir(file.path, indent + '  ');
      }
    });
  };

  // Start from root
  addDir('.');
  
  // Add directories that aren't in root
  Object.keys(tree).sort().forEach(dir => {
    if (!processedDirs.has(dir) && dir !== '.') {
      const parts = dir.split('/');
      lines.push(`📁 ${parts[0]}/`);
      addDir(dir, '  ');
    }
  });

  return lines.join('\n') || 'No files found';
};
