const postsUrl = "posts/index.json";
const postsPerPage = 10;

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInline(text) {
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img alt="$1" src="$2" />');
  formatted = formatted.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  return formatted;
}

function markdownToHtml(markdown) {
  const lines = markdown.trim().split(/\n/);
  let html = "";
  let paragraph = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html += `<p>${formatInline(paragraph.join(" "))}</p>`;
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      html += `<ul>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ul>`;
      listItems = [];
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      flushList();
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#{1,6}\s+/, "");
      html += `<h${level}>${formatInline(content)}</h${level}>`;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    if (/^>\s+/.test(line)) {
      flushParagraph();
      flushList();
      html += `<blockquote>${formatInline(line.replace(/^>\s+/, ""))}</blockquote>`;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      flushParagraph();
      flushList();
      html += "<hr />";
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return html;
}

function parseDate(dateValue) {
  return new Date(dateValue + "T00:00:00");
}

function formatDate(dateValue) {
  const date = parseDate(dateValue);
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function parsePostMarkdown(markdown) {
  const trimmed = markdown.trim();
  const heading = trimmed.match(/^#\s+(.+?)(?:\r?\n|$)/);
  const body = heading ? trimmed.slice(heading[0].length).trim() : trimmed;
  const excerpt = body
    .split(/\r?\n\s*\r?\n/)
    .find((paragraph) => paragraph.trim() && !/^(#{1,6}\s|[-*]\s|>)/.test(paragraph.trim()));

  return {
    title: heading ? heading[1].trim() : "Untitled note",
    body,
    summary: excerpt ? excerpt.trim().replace(/\s+/g, " ") : "",
  };
}

function getDateFromSlug(slug) {
  return `${slug.slice(0, 4)}-${slug.slice(4, 6)}-${slug.slice(6, 8)}`;
}

function getPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page") || "1");
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function renderPostCards(posts) {
  const list = document.getElementById("post-list");
  if (!list) return;

  list.innerHTML = posts
    .map(
      (post) => `
        <article class="post-card">
          <p class="meta">${formatDate(post.date)}</p>
          <h2><a href="post.html?post=${post.slug}">${formatInline(post.title)}</a></h2>
          <p>${formatInline(post.summary)}</p>
          <a class="read-link" href="post.html?post=${post.slug}">Read the note</a>
        </article>
      `
    )
    .join("");
}

function renderArchiveNavigation(currentPage, totalPages) {
  const nav = document.getElementById("archive-nav");
  if (!nav) return;

  const prevLink = currentPage > 1 ? `<a href="?page=${currentPage - 1}">Previous</a>` : `<span>Previous</span>`;
  const nextLink = currentPage < totalPages ? `<a href="?page=${currentPage + 1}">Next</a>` : `<span>Next</span>`;

  const pageLinks = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === currentPage) {
      pageLinks.push(`<span class="current-page">${page}</span>`);
    } else {
      pageLinks.push(`<a href="?page=${page}">${page}</a>`);
    }
  }

  nav.innerHTML = `
    <div class="archive-label">Older</div>
    <div class="archive-pages">${pageLinks.join("")}</div>
    <div class="archive-controls">
      ${prevLink}
      ${nextLink}
    </div>
  `;
}

async function loadPosts() {
  const response = await fetch(postsUrl);
  if (!response.ok) {
    throw new Error("Unable to load the posts index.");
  }

  const filenames = await response.json();
  const posts = await Promise.all(
    filenames.map(async (filename) => {
      const slug = filename.replace(/\.md$/i, "");
      const markdownResponse = await fetch(`posts/${filename}`);
      if (!markdownResponse.ok) {
        throw new Error(`Unable to load ${filename}.`);
      }

      const markdown = await markdownResponse.text();
      return {
        slug,
        date: getDateFromSlug(slug),
        ...parsePostMarkdown(markdown),
      };
    })
  );

  return posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

async function renderPostPage() {
  const container = document.getElementById("post-content");
  if (!container) return;

  const posts = await loadPosts();
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("post") || posts[0]?.slug;

  if (!slug) {
    container.innerHTML = "<p>No post found.</p>";
    return;
  }

  const post = posts.find((entry) => entry.slug === slug);
  if (!post) {
    container.innerHTML = "<p>Post not found.</p>";
    return;
  }

  const content = markdownToHtml(post.body);

  container.innerHTML = `
    <div class="breadcrumb">
      <a href="index.html">Home</a> / <span>${escapeHtml(post.title)}</span>
    </div>
    <header class="post-header">
      <p class="meta">${formatDate(post.date)}</p>
      <h1>${formatInline(post.title)}</h1>
    </header>
    ${content}
    <p><a href="index.html">← Back to notes</a></p>
  `;
}

async function initHomePage() {
  try {
    const posts = await loadPosts();
    const currentPage = getPageFromUrl();
    const totalPages = Math.max(1, Math.ceil(posts.length / postsPerPage));
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * postsPerPage;
    const end = start + postsPerPage;

    renderPostCards(posts.slice(start, end));
    renderArchiveNavigation(page, totalPages);
  } catch (error) {
    console.error(error);
    const list = document.getElementById("post-list");
    if (list) {
      list.innerHTML = "<p>Unable to load posts.</p>";
    }
  }
}

function initGoatCounter() {
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return;

  const pathname = window.location.pathname;
  const postSlug = pathname.endsWith("post.html")
    ? new URLSearchParams(window.location.search).get("post")
    : null;

  window.goatcounter = {
    path: postSlug ? `${pathname}?post=${encodeURIComponent(postSlug)}` : pathname,
  };

  const script = document.createElement("script");
  script.dataset.goatcounter = "https://devmonzter.goatcounter.com/count";
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  document.head.append(script);
}

async function init() {
  initGoatCounter();

  if (document.location.pathname.endsWith("post.html")) {
    renderPostPage();
    return;
  }

  initHomePage();
}

document.addEventListener("DOMContentLoaded", init);
