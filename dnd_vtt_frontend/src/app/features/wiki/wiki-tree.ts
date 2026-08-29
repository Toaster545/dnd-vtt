import { WikiPageSummary } from '../../core/models/wiki.model';

/** A node in the sidebar file tree. `path` is the '/'-joined folder path ('' = wiki root). */
export interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  pages: WikiPageSummary[];
}

/** Every distinct folder path (and its ancestors) referenced by a page. */
export function folderPaths(pages: WikiPageSummary[]): string[] {
  const out = new Set<string>();
  for (const p of pages) {
    if (!p.folder) continue;
    const parts = p.folder.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      out.add(acc);
    }
  }
  return [...out];
}

export function joinFolder(parent: string, rest: string): string {
  return (parent + rest).replace(/^\/+/, '').replace(/\/+$/, '');
}

/** The containing folder of a '/'-joined path ('' for a top-level folder). */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** The first page in tree order (root pages, then depth-first into folders); null if empty. */
export function firstPageSlug(node: FolderNode): string | null {
  if (node.pages.length) return node.pages[0].slug;
  for (const child of node.folders) {
    const hit = firstPageSlug(child);
    if (hit) return hit;
  }
  return null;
}

export function buildTree(pages: WikiPageSummary[], draftFolders: string[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], pages: [] };

  const ensure = (path: string): FolderNode => {
    if (!path) return root;
    const parts = path.split('/');
    let node = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let child = node.folders.find((f) => f.name === part);
      if (!child) {
        child = { name: part, path: acc, folders: [], pages: [] };
        node.folders.push(child);
      }
      node = child;
    }
    return node;
  };

  for (const path of draftFolders) ensure(path);
  for (const p of pages) ensure(p.folder).pages.push(p);

  const sort = (node: FolderNode): void => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.pages.sort((a, b) => a.title.localeCompare(b.title));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}
