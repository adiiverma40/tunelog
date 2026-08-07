import { parseFrontmatter } from "../utils/parseFrontmatter";
import { compareVersions } from "../utils/compareVerisons";

export interface ChangelogEntry {
  version: string;
  date: string;
  content: string;
}

const files = import.meta.glob("./changelog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const changelog: ChangelogEntry[] = Object.entries(files)
  .map(([path, raw]) => {
    const version = path.split("/").pop()!.replace(/\.md$/, "");
    const { data, content } = parseFrontmatter(raw);
    return { version, date: data.date ?? "", content };
  })
  .sort((a, b) => compareVersions(b.version, a.version));

export const CURRENT_VERSION = changelog[0]?.version ?? "0.0.0";
