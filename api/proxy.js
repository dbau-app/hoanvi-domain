export default async function handler(req, res) {
  // Dán đúng link .../exec thật của bạn vào đây (lấy ở Apps Script > Deploy > Manage deployments)
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbx52r_fflvLDlPfC20QSU4v3OEYFqtaKkmpOFPNJfGzAdiLOd4K54SLVAimJhYUoNggIQ/exec';

  const incoming = new URL(req.url, 'https://x');
  const target = GAS_URL + incoming.search;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      redirect: 'follow', // quan trọng: tự đi theo chuỗi redirect của Google
      headers: {
        'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded'
      },
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? req : undefined,
      duplex: (req.method !== 'GET' && req.method !== 'HEAD') ? 'half' : undefined
    });

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader('content-type', contentType);
    res.send(body);
  } catch (err) {
    res.status(502).send('Không kết nối được tới hệ thống. Vui lòng thử lại sau ít phút.');
  }
}
