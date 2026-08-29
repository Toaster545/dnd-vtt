export type WikiVisibility = 'shared' | 'dm_only';

export interface WikiPageSummary {
  id: string;
  title: string;
  slug: string;
  /** '' = wiki root, otherwise a '/'-joined path like 'Lore/NPCs'. */
  folder: string;
  visibility: WikiVisibility;
  updated_at: string;
  updated_by_name?: string | null;
}

export interface WikiBacklink {
  id: string;
  title: string;
  slug: string;
  folder: string;
}

export interface WikiPage extends WikiPageSummary {
  campaign_id: string;
  body: string;
  author_id: string;
  author_name?: string;
  created_at: string;
  updated_by?: string | null;
}

export interface WikiPageResponse {
  page: WikiPage;
  backlinks: WikiBacklink[];
}

export interface WikiSearchHit {
  id: string;
  title: string;
  slug: string;
  folder: string;
  snippet: string;
}

export interface WikiGraphNode {
  id: string;
  title: string;
  slug: string;
  folder: string;
}

export interface WikiGraph {
  nodes: WikiGraphNode[];
  edges: { source: string; target: string }[];
}

export interface CreateWikiPagePayload {
  campaignId: string;
  title: string;
  folder?: string;
  body?: string;
  visibility?: WikiVisibility;
}

export interface UpdateWikiPagePayload {
  title?: string;
  folder?: string;
  body?: string;
  visibility?: WikiVisibility;
  expectedUpdatedAt?: string;
}
