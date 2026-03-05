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
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          totalCount
          nodes {
            stargazersCount
            forkCount
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
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

    if (!data.data || !data.data.viewer) {
      return res.status(500).json({ error: "NO_DATA", message: "User data not found" });
    }

    const viewer = data.data.viewer;
    const contribs = viewer.contributionsCollection;
    const repos = viewer.repositories.nodes;

    // --- Data Calculation ---
    let totalStars = 0;
    let totalForks = 0;
    let languageStats = {};
    let totalSize = 0;

    repos.forEach(repo => {
      totalStars += repo.stargazersCount;
      totalForks += repo.forkCount;
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
    });

    const totalCommits = contribs.totalCommitContributions + (contribs.restrictedContributionsCount || 0);
    const totalPRs = contribs.totalPullRequestContributions;
    const totalIssues = contribs.totalIssueContributions;
    const totalRepos = viewer.repositories.totalCount;
    const totalCollabs = viewer.collaborations ? viewer.collaborations.totalCount : 0;
    const followers = viewer.followers.totalCount;

    // --- Rank Logic ---
    // Score Formula: Commits*2 + PRs*3 + Issues*1 + Stars*4 + Followers*2 + Repos*1
    const score = (totalCommits * 2) + (totalPRs * 3) + (totalIssues * 1) + (totalStars * 4) + (followers * 2) + totalRepos;
    
    let rank = 'B';
    if (score > 5000) rank = 'S+';
    else if (score > 2500) rank = 'S';
    else if (score > 1000) rank = 'A+';
    else if (score > 500) rank = 'A';
    else if (score > 200) rank = 'B+';

    // --- Language Percentages ---
    const langsArray = Object.keys(languageStats).map(name => {
      const percentage = totalSize > 0 ? ((languageStats[name].size / totalSize) * 100).toFixed(1) : 0;
      return { name, percentage, color: languageStats[name].color };
    }).sort((a, b) => b.percentage - a.percentage).slice(0, 5);

    // --- SVG Generation ---
    const width = 450;
    const height = 240; 
    const displayName = viewer.name || viewer.login;

    const css = `
      <style>
        .card { font-family: 'Segoe UI', Ubuntu, Sans-Serif; fill: #c9d1d9; }
        .header { font-weight: 600; font-size: 18px; fill: #58a6ff; }
        .stat-label { font-size: 14px; fill: #8b949e; }
        .stat-value { font-weight: 600; font-size: 15px; fill: #ffffff; }
        .rank-text { font-weight: 800; font-size: 40px; fill: #f0e130; text-anchor: middle; }
        .rank-label { font-weight: 600; font-size: 12px; fill: #8b949e; letter-spacing: 2px; text-anchor: middle; }
        .lang-text { font-size: 11px; fill: #8b949e; }
      </style>
    `;

    let svgContent = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${css}
        <rect x="0.5" y="0.5" width="${width-1}" height="${height-1}" rx="10" ry="10" fill="#0d1117" stroke="#30363d" stroke-width="1"/>

        <text x="25" y="35" class="header">${displayName}'s GitHub Stats</text>

        <g transform="translate(360, 70)">
          <circle cx="0" cy="0" r="38" fill="none" stroke="#30363d" stroke-width="4"/>
          <circle cx="0" cy="0" r="38" fill="none" stroke="#58a6ff" stroke-width="4" stroke-dasharray="240" stroke-dashoffset="${240 - (Math.min(score, 5000)/5000)*240}" transform="rotate(-90)"/>
          <text x="0" y="15" class="rank-text">${rank}</text>
          <text x="0" y="55" class="rank-label">RANK</text>
        </g>

        <g transform="translate(25, 65)">
           <g>
             <text x="0" y="0" class="stat-label">⭐ Total Stars</text>
             <text x="110" y="0" class="stat-value">${totalStars}</text>
             <text x="0" y="25" class="stat-label">🔄 Commits</text>
             <text x="110" y="25" class="stat-value">${totalCommits}</text>
             <text x="0" y="50" class="stat-label">🔀 PRs</text>
             <text x="110" y="50" class="stat-value">${totalPRs}</text>
           </g>
           <g transform="translate(160, 0)">
             <text x="0" y="0" class="stat-label">📦 Repos</text>
             <text x="100" y="0" class="stat-value">${totalRepos}</text>
             <text x="0" y="25" class="stat-label">🐛 Issues</text>
             <text x="100" y="25" class="stat-value">${totalIssues}</text>
             <text x="0" y="50" class="stat-label">👥 Contribs</text>
             <text x="100" y="50" class="stat-value">${totalCollabs}</text>
           </g>
        </g>

        <line x1="25" y1="155" x2="425" y2="155" stroke="#30363d" stroke-width="1"/>

        <g transform="translate(25, 180)">
    `;

    // Draw Progress Bars
    let xOffset = 0;
    langsArray.forEach(lang => {
        const barWidth = (parseFloat(lang.percentage) / 100) * 400;
        if (barWidth > 0) {
            svgContent += `<rect x="${xOffset}" y="0" width="${barWidth}" height="8" fill="${lang.color || '#ccc'}"/>`;
            xOffset += barWidth;
        }
    });

    svgContent += `</g> <g transform="translate(25, 210)">`;

    // Draw Legend
    let legendX = 0;
    langsArray.forEach(lang => {
        svgContent += `
        <circle cx="${legendX}" cy="-3" r="4" fill="${lang.color || '#ccc'}"/>
        <text x="${legendX + 8}" y="0" class="lang-text">${lang.name} ${lang.percentage}%</text>
        `;
        legendX += 80;
    });

    svgContent += `</g></svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(svgContent);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", details: error.toString() });
  }
}
