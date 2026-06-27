const README_URL =
  'https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/README.md';

const sidebarNav = document.getElementById('sidebar-nav');
const docsContent = document.getElementById('docs-content');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function stripDuplicateHeaderLinks(markdown) {
  return markdown
    .replace(/^# Mapbox EXIF Layer\s*\n+/m, '')
    .replace(/^\[!\[npm version\][^\n]*\n+/m, '')
    .replace(/^\[US wind & temperature demo[^\n]*\n+/m, '')
    .replace(/^\[Weather map time slider demo[^\n]*\n+/m, '')
    .replace(/^\[Demo website[^\n]*\n+/m, '')
    .replace(/^\[Demo video — Southern California wind particles[^\n]*\n+/m, '')
    .replace(/^\[Demo video — US continental wind particle animation[^\n]*\n+/m, '')
    .replace(/^\[Demo video recording\][^\n]*\n+/m, '')
    .replace(/^\[Technique Explanation\][^\n]*\n+/m, '');
}

function buildSidebar(headings) {
  sidebarNav.innerHTML = '';

  const videosLink = document.createElement('a');
  videosLink.href = '#videos';
  videosLink.textContent = 'Demo videos';
  videosLink.addEventListener('click', () => sidebar.classList.remove('open'));
  sidebarNav.appendChild(videosLink);

  const demosLink = document.createElement('a');
  demosLink.href = '#demos';
  demosLink.textContent = 'Live demos';
  demosLink.addEventListener('click', () => sidebar.classList.remove('open'));
  sidebarNav.appendChild(demosLink);

  headings.forEach(({ id, text, level }) => {
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = text;
    if (level === 3) link.classList.add('nav-h3');
    link.addEventListener('click', () => sidebar.classList.remove('open'));
    sidebarNav.appendChild(link);
  });
}

function setupScrollSpy() {
  const links = [...sidebarNav.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((link) => {
      const id = link.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      return el ? { link, el } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const setActive = (id) => {
    links.forEach((l) => {
      l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: '-15% 0px -60% 0px', threshold: [0, 0.1, 0.5] }
  );

  sections.forEach(({ el }) => observer.observe(el));
}

function enrichHeadings(container) {
  const headings = [];
  const usedIds = new Set();

  container.querySelectorAll('h2, h3').forEach((el) => {
    const text = el.textContent.trim();
    let id = slugify(text);
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    usedIds.add(id);
    el.id = id;
    headings.push({ id, text, level: Number(el.tagName.charAt(1)) });
  });

  return headings;
}

function renderMarkdown(markdown) {
  return marked.parse(markdown, { gfm: true, breaks: false });
}

async function loadDocs() {
  try {
    const response = await fetch(README_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = stripDuplicateHeaderLinks(await response.text());
    docsContent.innerHTML = renderMarkdown(markdown);
    const headings = enrichHeadings(docsContent);
    buildSidebar(headings);
    setupScrollSpy();
  } catch (error) {
    docsContent.innerHTML = `
      <p>Could not load documentation automatically.</p>
      <p>View the full README on
        <a href="https://github.com/zwang-geog/mapbox-exif-layer" target="_blank" rel="noopener">GitHub</a>.
      </p>
      <p><em>${error.message}</em></p>
    `;
    const loading = sidebarNav.querySelector('.sidebar-loading');
    if (loading) loading.textContent = 'Docs unavailable';
  }
}

sidebarToggle?.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (
    sidebar.classList.contains('open') &&
    !sidebar.contains(event.target) &&
    event.target !== sidebarToggle
  ) {
    sidebar.classList.remove('open');
  }
});

loadDocs();
