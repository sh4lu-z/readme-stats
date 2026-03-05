export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  // 1. මුලින්ම බලමු Vercel එකට Token එක ඇවිල්ලද කියලා
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ 
      error: "MISSING_TOKEN", 
      message: "Vercel Settings වල GITHUB_TOKEN එක දාලා නෑ, හෝ දැම්මට පස්සේ Redeploy කරලා නෑ." 
    });
  }

  const query = `
    query {
      viewer {
        login
        repositories(first: 1) {
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

    // 2. GitHub එකෙන් Error එකක් එවනවද බලමු
    if (data.errors) {
      return res.status(500).json({ 
        error: "GITHUB_GRAPHQL_ERROR", 
        details: data.errors 
      });
    }

    // 3. Authentication අවුලක්ද බලමු
    if (data.message) {
       return res.status(500).json({ 
        error: "GITHUB_AUTH_ERROR", 
        details: data.message 
      });
    }

    // දෝෂයක් නැත්නම් මේක පෙන්නයි
    res.status(200).json({ 
      success: true, 
      message: "Token is working perfectly!", 
      user: data.data.viewer.login 
    });

  } catch (error) {
    res.status(500).json({ error: "CODE_EXECUTION_ERROR", details: error.toString() });
  }
}
