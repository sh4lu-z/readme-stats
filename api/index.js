export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "MISSING_TOKEN", message: "Please set GITHUB_TOKEN in Vercel settings" });
  }

  const query = `
    query {
      viewer {
        login
        name
        followers {
          totalCount
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          restrictedContributionsCount 
        }
        repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
          totalCount
          nodes {
            name
            stargazerCount
            forkCount
            isPrivate
            isFork
            languages(first: 20, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  color
                  name
                }
              }
            }
          }
        }
        collaborations: repositories(ownerAffiliations: COLLABORATOR) {
          totalCount
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error(data.errors);
      return res.status(500).json({ error: "GITHUB_API_ERROR", details: data.errors });
    }

    const viewer = data.data.viewer;
    const contribs = viewer.contributionsCollection;
    const repos = viewer.repositories.nodes;

    // --- Data Calculation ---
    let totalStars = 0;
    let totalForks = 0;
    let privateRepos = 0;
    let publicRepos = 0;
    let myForks = 0;
    let languageStats = {};
    let totalSize = 0;

    repos.forEach(repo => {
      totalStars += repo.stargazerCount;
      totalForks += repo.forkCount;
      
      if (repo.isPrivate) privateRepos++;
      else publicRepos++;

      if (repo.isFork) myForks++;

      if (!repo.isFork) { 
        if (repo.languages && repo.languages.edges) {
          repo.languages.edges.forEach(edge => {
            const { size, node } = edge;
            if (!languageStats[node.name]) {
              languageStats[node.name] = { size: 0, color: node.color };
            }
            languageStats[node.name].size += size;
            totalSize += size;
          });
        }
      }
    });

    const totalCommits = contribs.totalCommitContributions + (contribs.restrictedContributionsCount || 0);
    const totalPRs = contribs.totalPullRequestContributions;
    const totalIssues = contribs.totalIssueContributions;
    const totalRepos = viewer.repositories.totalCount;
    const totalCollabs = viewer.collaborations ? viewer.collaborations.totalCount : 0;

    // --- Language Sorting ---
    const allLangs = Object.keys(languageStats).map(name => {
      const percentage = totalSize > 0 ? ((languageStats[name].size / totalSize) * 100).toFixed(1) : 0;
      return { name, percentage, color: languageStats[name].color };
    }).sort((a, b) => b.percentage - a.percentage);

    // Top 12 Languages for Display
    const topLangs = allLangs.slice(0, 12);
    // Count remaining languages
    const extraLangsCount = Math.max(0, allLangs.length - 12);

    // --- SVG Layout Calculations ---
    const columns = 3;
    const colWidth = 140;
    const rowHeight = 25;
    
    // Calculate required height based on rows
    const rowsNeeded = Math.ceil(topLangs.length / columns);
    const legendHeight = rowsNeeded * rowHeight;
    const footerHeight = extraLangsCount > 0 ? 25 : 0; // Extra space for "...and X more" text

    const width = 450;
    const height = 180 + legendHeight + footerHeight; 
    const displayName = viewer.name || viewer.login;

    const css = `
      <style>
        .container { font-family: 'Segoe UI', Ubuntu, Sans-Serif; fill: #c9d1d9; }
        .header { font-weight: 700; font-size: 18px; fill: #58a6ff; }
        .stat-label { font-size: 13px; fill: #8b949e; font-weight: 500; }
        .stat-value { font-weight: 700; font-size: 14px; fill: #e6edf3; }
        .small-text { font-size: 10px; fill: #8b949e; }
        .lang-text { font-size: 11px; fill: #8b949e; font-weight: 500; }
        .footer-text { font-size: 10px; fill: #8b949e; font-style: italic; }
        .card-bg { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
      </style>
    `;

    let svgContent = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${css}
        <rect x="0.5" y="0.5" width="${width-1}" height="${height-1}" rx="10" ry="10" class="card-bg"/>

        <text x="25" y="35" class="header">${displayName}'s GitHub Stats</text>

        <g transform="translate(25, 70)">
           <g>
             <text x="0" y="0" class="stat-label">⭐ Total Stars</text>
             <text x="110" y="0" class="stat-value">${totalStars}</text>
             
             <text x="0" y="25" class="stat-label">🔄 Commits</text>
             <text x="110" y="25" class="stat-value">${totalCommits}</text>
             
             <text x="0" y="50" class="stat-label">🔀 PRs</text>
             <text x="110" y="50" class="stat-value">${totalPRs}</text>
           </g>
           
           <g transform="translate(160, 0)">
             <text x="0" y="0" class="stat-label">📦 Total Repos</text>
             <text x="100" y="0" class="stat-value">${totalRepos} <tspan class="small-text">(${privateRepos} Priv / ${myForks} Forks)</tspan></text>
             
             <text x="0" y="25" class="stat-label">🐛 Issues</text>
             <text x="100" y="25" class="stat-value">${totalIssues}</text>
             
             <text x="0" y="50" class="stat-label">👥 Contribs</text>
             <text x="100" y="50" class="stat-value">${totalCollabs}</text>
           </g>
        </g>

        <line x1="25" y1="145" x2="425" y2="145" stroke="#21262d" stroke-width="1"/>

        <g transform="translate(25, 165)">
            <clipPath id="bar-clip">
                <rect x="0" y="0" width="400" height="8" rx="4"/>
            </clipPath>
            <g clip-path="url(#bar-clip)">
    `;

    // Draw Progress Bars (Use Top 12 to fill the bar mostly)
    let xOffset = 0;
    topLangs.forEach(lang => {
        const barWidth = (parseFloat(lang.percentage) / 100) * 400;
        if (barWidth > 0) {
            svgContent += `<rect x="${xOffset}" y="0" width="${barWidth}" height="8" fill="${lang.color || '#ccc'}"/>`;
            xOffset += barWidth;
        }
    });

    svgContent += `
            </g>
        </g>
        
        <g transform="translate(25, 190)">
    `;

    // Render Grid
    topLangs.forEach((lang, index) => {
        const colIndex = index % columns;
        const rowIndex = Math.floor(index / columns);
        
        const x = colIndex * colWidth;
        const y = rowIndex * rowHeight;
        
        svgContent += `
        <circle cx="${x}" cy="${y - 3}" r="4" fill="${lang.color || '#ccc'}"/>
        <text x="${x + 12}" y="${y}" class="lang-text">${lang.name} ${lang.percentage}%</text>
        `;
    });

    svgContent += `</g>`;

    // --- Footer Text (If more languages exist) ---
    if (extraLangsCount > 0) {
        const footerY = 190 + legendHeight + 5;
        svgContent += `
          <text x="25" y="${footerY}" class="footer-text">...and ${extraLangsCount} more languages</text>
        `;
    }

    svgContent += `</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(svgContent);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", details: error.toString() });
  }
}
