import http from 'http';

const url = 'http://api.open-meteo.com/v1/forecast?latitude=14.0509&longitude=101.3716&current=temperature_2m,relative_humidity_2m,weather_code';

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Raw data:', data);
    const json = JSON.parse(data);
    console.log('Parsed:', {
      temp: json.current.temperature_2m,
      humi: json.current.relative_humidity_2m,
      code: json.current.weather_code
    });
  });
});
