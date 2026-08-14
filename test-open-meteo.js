import http from 'http';

http.get('http://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current_weather=true', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Open meteo test:', data);
  });
});
