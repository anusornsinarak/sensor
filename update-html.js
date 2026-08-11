import fs from 'fs';
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<title>My Google AI Studio App</title>', '<title>SensorFlow Realtime Cloud</title>\n    <link rel="manifest" href="/manifest.json" />\n    <meta name="theme-color" content="#ffffff" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />');
fs.writeFileSync('index.html', html);
