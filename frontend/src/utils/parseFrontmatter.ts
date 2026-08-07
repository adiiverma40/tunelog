export interface FrontmatterResult {
  data: Record<string, string>;
  content: string;
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw.trim() };

  const [, frontmatter, content] = match;
  const data: Record<string, string> = {};
  frontmatter.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  });

  return { data, content: content.trim() };
}
