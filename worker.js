/**
 * LanzouAPI - Cloudflare Worker
 * 蓝奏云直链解析，纯前端 + Worker 无服务器方案
 * 
 * 部署: 复制此文件到 Cloudflare Workers 即可
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function normalizeUrl(url) {
  const domains = ['lanzouf.com','lanzoux.com','lanzous.com','lanzoui.com',
    'lanzouw.com','lanzou.com','lanzouy.com','lanzout.com',
    'lanzouo.com','lanzoup.com','lanzoua.com','lanzouq.com']
  for (const d of domains) {
    const idx = url.indexOf(d)
    if (idx !== -1) return 'https://www.lanzouf.com' + url.substring(idx + d.length)
  }
  return url
}

function acw_sc_v2(arg1) {
  const pos = [15,35,29,24,33,16,1,38,10,9,19,31,40,27,22,23,25,13,6,11,39,18,20,8,14,21,32,26,2,30,7,4,17,5,3,28,34,37,12,36]
  const mask = '3000176000856006061501533003690027800375'
  const arr = new Array(40).fill('')
  for (let i = 0; i < arg1.length; i++)
    for (let j = 0; j < pos.length; j++)
      if (pos[j] === i + 1) arr[j] = arg1[i]
  const s = arr.join('')
  let r = ''
  for (let i = 0; i < Math.min(s.length, mask.length); i += 2)
    r += (parseInt(s.substr(i,2),16) ^ parseInt(mask.substr(i,2),16)).toString(16).padStart(2,'0')
  return r
}

async function fetchHtml(url, cookie = '') {
  const h = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  if (cookie) h['Cookie'] = cookie
  return fetch(url, { headers: h })
}

async function getPage(url) {
  let resp = await fetchHtml(url), text = await resp.text()
  if (text.includes('acw_sc__v2')) {
    const m = text.match(/arg1='([0-9A-Z]+)'/)
    if (m) {
      const v = acw_sc_v2(m[1])
      const ck = [...(resp.headers.get('Set-Cookie')||'').split(',').map(x=>x.split(';')[0]),`acw_sc__v2=${v}`].filter(Boolean).join('; ')
      resp = await fetchHtml(url, ck)
      text = await resp.text()
    }
  }
  return text
}

function extractInfo(html) {
  let name = '', size = ''
  let m = html.match(/style="font-size:\s*30px[^"]*">(.*?)<\/div>/)
    || html.match(/<div class="n_box_3fn"[^>]*>(.*?)<\/div>/)
    || html.match(/var filename = '(.*?)'/)
    || html.match(/<div class="b"><span>(.*?)<\/span><\/div>/)
  if (m) name = m[1]
  m = html.match(/<div class="n_filesize"[^>]*>大小：(.*?)<\/div>/)
    || html.match(/<span class="p7">文件大小：<\/span>(.*?)<br>/)
  if (m) size = m[1]
  return { name, size }
}

async function resolveDownload(shareUrl, pwd = '') {
  const url = normalizeUrl(shareUrl)
  let html = await getPage(url)
  if (html.includes('文件取消分享了')) return { code: 400, msg: '文件取消分享了' }
  const { name, size } = extractInfo(html)
  const webpage = (shareUrl.match(/[?&]webpage=([^&]+)/) || [])[1] || ''

  let postData, referer

  if (html.includes('function down_p(') && !webpage) {
    if (!pwd) return { code: 400, msg: '请输入分享密码' }
    const sm = html.match(/'sign':'(.+?)'/)
    if (!sm) return { code: 400, msg: '无法提取参数' }
    postData = { action:'downprocess', sign:sm[1], p:pwd, kd:1 }
    referer = url
  } else {
    const im = html.match(/<iframe[^>]*src="\/(.*?)"/)
    if (!im) return { code: 400, msg: '无法提取iframe' }
    const ifurl = `https://www.lanzouf.com/${im[1]}${webpage?'?'+webpage:''}`
    referer = ifurl
    const fhtml = await getPage(ifurl)

    if (webpage) {
      const sm = fhtml.match(/'sign':'(.+?)'/), am = fhtml.match(/ajaxdata = '(.*?)'/)
      if (!sm) return { code: 400, msg: '无法提取参数' }
      postData = { action:'downprocess', websignkey:'Em2R', sign:sm[1], websign:2, kd:1, ves:1 }
    } else {
      const sm = fhtml.match(/wp_sign = '(.*?)'/), am = fhtml.match(/ajaxdata = '(.*?)'/)
      if (!sm) return { code: 400, msg: '无法提取参数' }
      postData = { action:'downprocess', websignkey:am[1], signs:am[1], sign:sm[1], websign:'', kd:1, ves:1 }
    }
  }

  const r = await fetch('https://www.lanzouf.com/ajaxm.php', {
    method:'POST',
    headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded','Referer':referer},
    body: new URLSearchParams(postData)
  })
  const j = await r.json()
  if (j.zt !== 1) return { code:400, msg:j.inf||'解析失败' }

  const downUrl1 = j.dom + '/file/' + j.url
  const fr = await fetch(downUrl1, {
    method:'GET', redirect:'manual',
    headers:{'User-Agent':UA,'Referer':'https://developer.lanzoug.com','Accept-Language':'zh-CN,zh;q=0.9'}
  })
  let downUrl = fr.headers.get('Location') || downUrl1
  downUrl = downUrl.replace(/pid=[^&]+&?/g, '')

  return { code:200, msg:'解析成功', name, filesize:size, downUrl }
}

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>蓝奏云直链解析</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;width:100%;max-width:540px}
h1{font-size:24px;color:#1a1a2e;margin-bottom:8px;text-align:center}
.sub{color:#666;font-size:14px;text-align:center;margin-bottom:28px}
.form-group{margin-bottom:18px}
label{display:block;font-size:14px;color:#444;margin-bottom:6px;font-weight:500}
input{width:100%;padding:12px 16px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:15px;transition:border .2s;outline:none;background:#fafafa}
input:focus{border-color:#4a6cf7;background:#fff}
.input-row{display:flex;gap:12px}
.input-row input{flex:1}
.btn{width:100%;padding:13px;background:#4a6cf7;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s}
.btn:hover{background:#3b5de7}
.btn:disabled{background:#a0b4f7;cursor:not-allowed}
.btn-group{display:flex;gap:10px;margin-top:6px}
.btn-group .btn{flex:1}
.btn-outline{background:transparent;color:#4a6cf7;border:1.5px solid #4a6cf7}
.btn-outline:hover{background:#f0f3ff}
.result{margin-top:24px;padding:16px 20px;border-radius:10px;display:none}
.result.success{display:block;background:#f0faf0;border:1px solid #d4edda}
.result.error{display:block;background:#fef2f2;border:1px solid #fecaca}
.result .label{font-size:12px;color:#888;margin-bottom:2px}
.result .value{font-size:15px;color:#222;word-break:break-all;margin-bottom:10px}
.result .value:last-child{margin-bottom:0}
.result .value a{color:#4a6cf7;text-decoration:none}
.result .value a:hover{text-decoration:underline}
.loading{text-align:center;color:#888;font-size:14px;margin-top:20px;display:none}
.spinner{display:inline-block;width:18px;height:18px;border:2px solid #ddd;border-top-color:#4a6cf7;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.footer{text-align:center;margin-top:20px;font-size:12px;color:#aaa}
</style>
</head>
<body>
<div class="card">
<h1>🔗 蓝奏云直链解析</h1>
<p class="sub">输入蓝奏云分享链接，获取文件真实下载地址</p>
<form id="form">
<div class="form-group">
<label for="url">分享链接</label>
<input type="url" id="url" placeholder="https://www.lanzouf.com/xxxxxx" required>
</div>
<div class="form-group">
<label for="pwd">提取码（可选）</label>
<input type="text" id="pwd" placeholder="无密码留空">
</div>
<button type="submit" class="btn" id="submitBtn">解析直链</button>
</form>
<div id="loading" class="loading"><span class="spinner"></span>解析中...</div>
<div id="result" class="result"></div>
<div class="footer">数据通过 Cloudflare Worker 中转，仅供学习交流</div>
</div>
<script>
const form = document.getElementById('form')
const urlInput = document.getElementById('url')
const pwdInput = document.getElementById('pwd')
const submitBtn = document.getElementById('submitBtn')
const result = document.getElementById('result')
const loading = document.getElementById('loading')

form.addEventListener('submit', async e => {
  e.preventDefault()
  const url = urlInput.value.trim()
  const pwd = pwdInput.value.trim()
  if (!url) return
  submitBtn.disabled = true
  loading.style.display = 'block'
  result.className = 'result'
  try {
    const params = new URLSearchParams({ url, pwd })
    const resp = await fetch('/api?' + params)
    const data = await resp.json()
    loading.style.display = 'none'
    submitBtn.disabled = false
    if (data.code === 200) {
      result.className = 'result success'
      result.innerHTML = \`
        <div class="label">文件名</div>
        <div class="value">\${data.name||'未知'}</div>
        <div class="label">文件大小</div>
        <div class="value">\${data.filesize||'未知'}</div>
        <div class="label">下载直链（30分钟有效）</div>
        <div class="value"><a href="\${data.downUrl}" target="_blank">\${data.downUrl}</a></div>
        <div class="btn-group">
          <button class="btn" onclick="window.open('\${data.downUrl}')">直接下载</button>
          <button class="btn btn-outline" onclick="navigator.clipboard.writeText('\${data.downUrl}').then(()=>this.textContent='已复制')">复制链接</button>
        </div>
      \`
    } else {
      result.className = 'result error'
      result.innerHTML = '<div class="value">❌ ' + (data.msg||'解析失败') + '</div>'
    }
  } catch(e) {
    loading.style.display = 'none'
    submitBtn.disabled = false
    result.className = 'result error'
    result.innerHTML = '<div class="value">❌ 网络错误: ' + e.message + '</div>'
  }
})
</script>
</body>
</html>`

export default {
  async fetch(request) {
    const url = new URL(request.url)

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    if (request.method === 'OPTIONS')
      return new Response(null, { headers: cors })

    if (url.pathname === '/' || url.pathname === '/index.html')
      return new Response(HTML, { headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } })

    if (url.pathname === '/api') {
      const shareUrl = url.searchParams.get('url')
      const pwd = url.searchParams.get('pwd') || ''
      const type = url.searchParams.get('type') || ''
      if (!shareUrl)
        return new Response(JSON.stringify({ code:400, msg:'请输入URL' }), { headers: { ...cors, 'Content-Type':'application/json' } })
      try {
        const result = await resolveDownload(shareUrl, pwd)
        if (type === 'down' && result.code === 200 && result.downUrl)
          return new Response(null, { status:302, headers: { ...cors, 'Location': result.downUrl } })
        return new Response(JSON.stringify(result, null, 2), { headers: { ...cors, 'Content-Type':'application/json; charset=utf-8' } })
      } catch(e) {
        return new Response(JSON.stringify({ code:500, msg:e.message }), { headers: { ...cors, 'Content-Type':'application/json' } })
      }
    }

    return new Response('Not Found', { status:404, headers: cors })
  }
}
