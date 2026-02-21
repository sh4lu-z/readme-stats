export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;


  const query = `
    query {
      viewer {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          totalCount
          nodes {
            languages(first: 100, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
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
    const repos = data.data.viewer.repositories;
    const totalRepos = repos.totalCount;

    let languageStats = {};
    let totalSize = 0;

    repos.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        const { size, node } = edge;
        if (!languageStats[node.name]) {
          languageStats[node.name] = { size: 0, color: node.color };
        }
        languageStats[node.name].size += size;
        totalSize += size;
      });
    });

 
    const langsArray = Object.keys(languageStats).map(name => {
      const percentage = ((languageStats[name].size / totalSize) * 100).toFixed(2);
      return { name, percentage, color: languageStats[name].color };
    }).sort((a, b) => b.percentage - a.percentage);


    const baseHeight = 70; 
    const itemHeight = 25; 
    const paddingBottom = 20; 
    const dynamicHeight = baseHeight + (langsArray.length * itemHeight) + paddingBottom;

    let svgContent = `
      <svg width="400" height="${dynamicHeight}" viewBox="0 0 400 ${dynamicHeight}" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #0d1117; color: #c9d1d9; border-radius: 6px; border: 1px solid #30363d;">
        <text x="20" y="30" fill="#c9d1d9" font-size="16" font-weight="600">Total Repositories: ${totalRepos}</text>
        <line x1="20" y1="45" x2="380" y2="45" stroke="#30363d" stroke-width="1"/>
    `;

    let yPos = 70;
 
    langsArray.forEach(lang => { 
      const langColor = lang.color || '#8b949e'; 
      svgContent += `
        <circle cx="20" cy="${yPos - 4}" r="5" fill="${langColor}" />
        <text x="35" y="${yPos}" fill="#8b949e" font-size="14">${lang.name}</text>
        <text x="330" y="${yPos}" fill="#8b949e" font-size="14" font-weight="600">${lang.percentage}%</text>
      `;
      yPos += 25;
    });

    svgContent += `</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(svgContent);

  } catch (error) {
    res.status(500).send('Error fetching data');
  }
}
