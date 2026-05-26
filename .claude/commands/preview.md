Serve the calendar over HTTP locally and open it in the browser. A server is REQUIRED — the app
fetches JSON, which the browser blocks on `file://`.

Project directory: C:\Users\Saphita\Documents\Vittunyuta\repos\thaidhamma_calendar

Pick the first available server (this machine may not have Python or Node — check first):
1. `python -m http.server 8080`  (or `py -m http.server 8080` / `python3 -m http.server 8080`)
2. `npx serve -l 8080`  or  `npx http-server -p 8080`
3. `php -S localhost:8080`

If none of the above are installed, use this dependency-free PowerShell static server (run in the
background from the project directory):

```powershell
$root = 'C:\Users\Saphita\Documents\Vittunyuta\repos\thaidhamma_calendar'
$l = [System.Net.HttpListener]::new(); $l.Prefixes.Add('http://localhost:8080/'); $l.Start()
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')); if (-not $rel) { $rel = 'index.html' }
  $path = Join-Path $root $rel
  if (Test-Path $path -PathType Leaf) {
    $ext = [IO.Path]::GetExtension($path)
    $ctx.Response.ContentType = @{ '.html'='text/html; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css' }[$ext]
    $bytes = [IO.File]::ReadAllBytes($path); $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
```

Then open the site: `start http://localhost:8080`

Tell the user the server is running, the URL, and how to stop it (Ctrl+C, or kill the background
process / close the terminal).
