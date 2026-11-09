const https = require('https');

const token = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImUxNGFiMTM1IiwidHlwIjoiSldUIn0.eyJjcmVhdGVkX29uIjoxNzk0MTI3MzYxLCJlbWFpbCI6ImFydW5rdW1hcjEuYWs3MDBAZ21haWwuY29tIiwiZXhwIjoxNzk0MTU5NzYxLCJtb2JpbGUiOiI3MzU4NTcwMzYzIiwib3JpZ19pYXQiOjE3OTQxMjczNjEsInBsYXRmb3JtIjoid2ViIiwidG9rZW5faWQiOjQxODU5ODExLCJ1c2VyX2lkIjo3MjkyMjQxLCJ1c2VybmFtZSI6IjczNTg1NzAzNjMifQ.pyfYBPP0QDdUZNO6hu-ai32vok9QFmUCvqVoBf5mdxw';

const path = '/authx?client_id=JDFo3XdEMdgfUTwlkBwT&state=test_state&redirect_uri=https%3A%2F%2Fmcp.indmoney.com%2Fauth-callback&response_type=code&code_challenge=Nc9yBWX7R6WZqkTxx1Bt-W4ewgkroqm74UhrmzccGo0&code_challenge_method=S256';

const req = https.request({
  hostname: 'www.indmoney.com',
  path: path,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Cookie': 'token=' + token + '; user_token=' + token + '; jwt=' + token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const scripts = body.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (scripts) {
      const nextData = JSON.parse(scripts[1]);
      console.log('Page props:', JSON.stringify(nextData.props.pageProps, null, 2));
    }
  });
});
req.end();
