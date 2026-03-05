export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;


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

    // Error Handling
    if (data.errors) {
      console.error(data.errors);
      return res.status(500).send('GitHub API Error');
    }

    const viewer = data.data.viewer;
    const contribs = viewer.contributionsCollection;
    const repos = viewer.repositories.nodes;

    // 2. Data ටික ලස්සනට ගලපගමු
    let totalStars = 0;
    let totalForks = 0;
    let languageStats = {};
    let totalSize = 0;

    repos.forEach(repo => {
      totalStars += repo.stargazersCount;
      totalForks += repo.forkCount;
      repo.languages.edges.forEach(edge => {
        const { size, node } = edge;
        if (!languageStats[node.name]) {
          languageStats[node.name] = { size: 0, color: node.color };
        }
        languageStats[node.name].size += size;
        totalSize += size;
      });
    });

    const totalCommits = contribs.totalCommitContributions + contribs.restrictedContributionsCount;
    const totalPRs = contribs.totalPullRequestContributions;
    const totalIssues = contribs.totalIssueContributions;
    const totalRepos = viewer.repositories.totalCount;
    const totalCollabs = viewer.collaborations.totalCount;
    const followers = viewer.followers.totalCount;

    // 3. Rank එක Calculate කරමු (සරල Logic එකක්)
    // Score = Commits*2 + PRs*3 + Issues*1 + Stars*4 + Followers*2
    const score = (totalCommits * 2) + (totalPRs * 3) + (totalIssues * 1) + (totalStars * 4) + (followers * 2);
    
    let rank = 'B';
    if (score > 5000) rank = 'S+';
    else if (score > 2500) rank = 'S';
    else if (score > 1000) rank = 'A+';
    else if (score > 500) rank = 'A';
    else if (score > 200) rank = 'B+';

    // භාෂා ටික ප්‍රතිශතයක් විදියට හදමු
    const langsArray = Object.keys(languageStats).map(name => {
      const percentage = ((languageStats[name].size / totalSize) * 100).toFixed(1);
      return { name, percentage, color: languageStats[name].color };
    }).sort((a, b) => b.percentage - a.percentage).slice(0, 6); // Top 6 languages only

    // 4. SVG එක ලස්සනට අඳිමු
    const width = 450;
    const height = 240; // Card Size

    // Styles & CSS
    const style = `
      <style>
        .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #58a6ff; }
        .stat { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #c9d1d9; }
        .stat-bold { font: 700 15px 'Segoe UI', Ubuntu, Sans-Serif; fill: #fff; }
        .rank-text { font: 800 40px 'Segoe UI', Ubuntu, Sans-Serif; fill: #f0e130; }
        .rank-label { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #8b949e; letter-spacing: 2px; }
        .lang-name { font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: #8b949e; }
      </style>
    `;

    // SVG Body
    let svgContent = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${style}
        <rect x="0" y="0" width="${width}" height="${height}" rx="10" ry="10" fill="#0d1117" stroke="#30363d" />
        
        <text x="25" y="35" class="header">${viewer.name || viewer.login}'s GitHub Stats</text>

        <g transform="translate(360, 60)">
          <circle cx="0" cy="0" r="40" fill="none" stroke="#30363d" stroke-width="4" />
          <circle cx="0" cy="0" r="40" fill="none" stroke="#58a6ff" stroke-width="4" stroke-dasharray="250" stroke-dashoffset="30" transform="rotate(-90)"/>
          <text x="0" y="15" text-anchor="middle" class="rank-text">${rank}</text>
        </g>
        <text x="360" y="120" text-anchor="middle" class="rank-label">RANK</text>

        <g transform="translate(25, 65)">
          <g transform="translate(0, 0)">
            <text x="0" y="15" class="stat">⭐ Total Stars:</text>
            <text x="110" y="15" class="stat-bold">${totalStars}</text>
            
            <text x="0" y="40" class="stat">🔄 Commits:</text>
            <text x="110" y="40" class="stat-bold">${totalCommits}</text>
            
            <text x="0" y="65" class="stat">🔀 Pull Requests:</text>
            <text x="110" y="65" class="stat-bold">${totalPRs}</text>
          </g>

          <g transform="translate(160, 0)">
            <text x="0" y="15" class="stat">📦 Total Repos:</text>
            <text x="110" y="15" class="stat-bold">${totalRepos}</text>
            
            <text x="0" y="40" class="stat">🐛 Total Issues:</text>
            <text x="110" y="40" class="stat-bold">${totalIssues}</text>
            
            <text x="0" y="65" class="stat">🤝 Contribs:</text>
            <text x="110" y="65" class="stat-bold">${totalCollabs}</text>
          </g>
        </g>

        <line x1="25" y1="160" x2="425" y2="160" stroke="#30363d" stroke-width="1" />

        <g transform="translate(25, 185)">
    `;

    // Progress Bar Drawing
    let xPos = 0;
    langsArray.forEach(lang => {
        const barWidth = (parseFloat(lang.percentage) / 100) * 400;
        if(barWidth > 0) {
           svgContent += `<rect x="${xPos}" y="0" width="${barWidth}" height="8" fill="${lang.color || '#ccc'}" />`;
           xPos += barWidth;
        }
    });

    // Language Labels (Bottom)
    svgContent += `</g> <g transform="translate(25, 215)">`;
    
    let labelX = 0;
    langsArray.slice(0, 5).forEach(lang => {
        svgContent += `
        <circle cx="${labelX}" cy="-4" r="5" fill="${lang.color || '#ccc'}" />
        <text x="${labelX + 10}" y="0" class="lang-name">${lang.name} (${lang.percentage}%)</text>
        `;
        labelX += 85; // Gap between labels
    });

    svgContent += `</g> </svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(svgContent);

  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching data');
  }
}
