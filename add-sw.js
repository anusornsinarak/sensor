import fs from 'fs';
let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('serviceWorker.register')) {
  html = html.replace('</body>', `  <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    </script>
  </body>`);
  fs.writeFileSync('index.html', html);
}
